"""Supabase Auth (Google sign-in) token verification.

Supabase signs Auth tokens with ES256 (project JWKS at
<SUPABASE_URL>/auth/v1/.well-known/jwks.json). We verify the access token
against those public keys — no shared secret needed — then the auth router
exchanges it for our own FitQuest JWT so the rest of the app is unchanged.

Same email via Google and via email-code = one merged account (matched on email).
"""
from __future__ import annotations

import os
import time

import httpx
import jwt
from jwt.algorithms import ECAlgorithm

_JWKS_CACHE: dict = {"keys": {}, "fetched_at": 0.0}
JWKS_TTL = 3600  # seconds


def supabase_base_url() -> str:
    raw = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
    if raw.endswith("/rest/v1"):
        raw = raw[: -len("/rest/v1")]
    return raw


def _jwks_url() -> str:
    base = supabase_base_url()
    if not base:
        raise RuntimeError("SUPABASE_URL is not set on the server")
    return base + "/auth/v1/.well-known/jwks.json"


def _jwks_keys() -> dict:
    now = time.monotonic()
    if _JWKS_CACHE["keys"] and now - _JWKS_CACHE["fetched_at"] < JWKS_TTL:
        return _JWKS_CACHE["keys"]
    resp = httpx.get(_jwks_url(), timeout=10)
    if resp.status_code != 200:
        raise RuntimeError(f"Could not fetch Supabase JWKS ({resp.status_code})")
    keys = {}
    for jwk in resp.json().get("keys", []):
        if jwk.get("kid"):
            keys[jwk["kid"]] = jwk
    if not keys:
        raise RuntimeError("Supabase JWKS returned no keys")
    _JWKS_CACHE.update(keys=keys, fetched_at=now)
    return keys


def verify_supabase_token(access_token: str) -> dict:
    """Verify a Supabase access token. Returns {sub, email, name}.

    Raises RuntimeError with a user-safe message on any failure.
    """
    try:
        kid = jwt.get_unverified_header(access_token).get("kid")
    except Exception:
        raise RuntimeError("Invalid login token. Try signing in again.")
    if not kid:
        raise RuntimeError("Invalid login token. Try signing in again.")
    jwk = _jwks_keys().get(kid)
    if not jwk:
        # Key rotation: refresh once before giving up.
        _JWKS_CACHE.update(keys={}, fetched_at=0.0)
        jwk = _jwks_keys().get(kid)
    if not jwk:
        raise RuntimeError("Login key expired. Try signing in again.")
    try:
        public_key = ECAlgorithm.from_jwk(jwk)
        base = supabase_base_url()
        claims = jwt.decode(
            access_token,
            public_key,
            algorithms=["ES256"],
            audience="authenticated",
            issuer=base + "/auth/v1",
            options={"require": ["exp", "sub"]},
        )
    except jwt.ExpiredSignatureError:
        raise RuntimeError("Session expired. Sign in again.")
    except Exception:
        raise RuntimeError("Could not verify Google sign-in. Try again.")
    email = (claims.get("email") or "").strip().lower()
    if not email:
        raise RuntimeError("Google did not share an email address. Use email signup instead.")
    meta = claims.get("user_metadata") or {}
    name = (meta.get("full_name") or meta.get("name") or email.split("@")[0]).strip()[:120]
    return {"sub": claims["sub"], "email": email, "name": name or email.split("@")[0]}
