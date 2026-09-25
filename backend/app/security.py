"""Production hardening for public hosting.

- Env-driven config (FITQUEST_ENV=production enables strict behavior)
- Sliding-window rate limiting per IP (anti bot-loop / quota-burn)
- Security response headers
- Concurrency cap for the paid vision API (graceful 429 instead of pile-up)
"""
from __future__ import annotations

import asyncio
import logging
import os
import time
from collections import defaultdict, deque

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

log = logging.getLogger("fitquest.security")


def env(name: str, default: str = "") -> str:
    return os.environ.get(name, default)


ENV = env("FITQUEST_ENV", "development").lower()
IS_PROD = ENV == "production"


def get_jwt_secret() -> str:
    s = env("FITQUEST_SECRET", "")
    if not s or s == "dev-only-change-me":
        if IS_PROD:
            raise RuntimeError("FITQUEST_SECRET must be set when FITQUEST_ENV=production")
        log.warning("No FITQUEST_SECRET set — using an ephemeral dev secret (tokens die on restart)")
        import secrets

        return secrets.token_hex(32)
    return s


def cors_origins() -> list[str]:
    raw = env("CORS_ORIGINS", "").strip()
    if not raw:
        return ["*"]
    return [o.strip() for o in raw.split(",") if o.strip()]


def startup_checks() -> None:
    get_jwt_secret()  # raises in prod without a real secret
    if IS_PROD and env("RESEND_ALLOW_TEST_FALLBACK", "1") == "1":
        os.environ["RESEND_ALLOW_TEST_FALLBACK"] = "0"
        log.warning("RESEND_ALLOW_TEST_FALLBACK forced OFF in production")
    if IS_PROD and cors_origins() == ["*"]:
        log.warning("CORS is open (*) in production — set CORS_ORIGINS to your domain")
    log.info("FitQuestAI starting (env=%s)", ENV)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Sliding-window limits per (route-prefix, IP). First matching rule wins."""

    def __init__(self, app, rules: list[tuple[str, int, int]]):
        super().__init__(app)
        self.rules = rules
        self.hits: dict[str, deque] = defaultdict(deque)

    def _client_ip(self, request) -> str:
        fwd = request.headers.get("x-forwarded-for", "")
        if fwd:
            return fwd.split(",")[0].strip()
        return request.client.host if request.client else "?"

    def _allow(self, key: str, limit: int, window: int) -> bool:
        now = time.monotonic()
        q = self.hits[key]
        while q and q[0] <= now - window:
            q.popleft()
        if len(q) >= limit:
            return False
        q.append(now)
        if len(self.hits) > 8000:  # occasional cleanup
            for k in [k for k, v in self.hits.items() if not v or v[-1] <= now - 3600]:
                del self.hits[k]
        return True

    async def dispatch(self, request, call_next):
        path = request.url.path
        for prefix, limit, window in self.rules:
            if path.startswith(prefix):
                ip = self._client_ip(request)
                if not self._allow(f"{prefix}|{ip}", limit, window):
                    log.warning("rate-limited %s %s", ip, path)
                    return JSONResponse(
                        {"detail": "Too many requests. Slow down and try again shortly."},
                        status_code=429,
                        headers={"Retry-After": str(window)},
                    )
                break
        return await call_next(request)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        resp = await call_next(request)
        resp.headers["X-Content-Type-Options"] = "nosniff"
        resp.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        resp.headers["X-Frame-Options"] = "DENY"
        resp.headers["Permissions-Policy"] = "camera=(self), microphone=()"
        if IS_PROD:
            resp.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
        return resp


# Max simultaneous NVIDIA vision calls per worker. Extra callers get a fast
# 429 ("AI busy") instead of piling up into multi-minute timeouts.
VISION_SEM = asyncio.Semaphore(2)


async def acquire_vision_slot():
    from fastapi import HTTPException

    try:
        await asyncio.wait_for(VISION_SEM.acquire(), timeout=5)
    except (asyncio.TimeoutError, TimeoutError):
        raise HTTPException(429, "AI is busy right now. Try again in a few seconds.")


def release_vision_slot() -> None:
    try:
        VISION_SEM.release()
    except ValueError:
        pass  # never acquired (e.g. failed before acquire)
