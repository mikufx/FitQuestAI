"""FitQuestAI FastAPI entrypoint."""
from __future__ import annotations

import os

try:
    from dotenv import load_dotenv

    load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))
except ImportError:  # python-dotenv not installed; rely on real env vars
    pass

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

# FitQuestAI/ folder (parent of backend/); the servable site lives in frontend/.
SITE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FRONTEND_DIR = os.path.join(SITE_DIR, "frontend")

from .database import Base, SessionLocal, engine
from .models import SEED_CHALLENGES, Challenge
from .security import (
    RateLimitMiddleware,
    SecurityHeadersMiddleware,
    cors_origins,
    startup_checks,
)

app = FastAPI(title="FitQuestAI API", version="1.0.0")

app.add_middleware(SecurityHeadersMiddleware)
# Tighten with CORS_ORIGINS="https://your-domain" in production.
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# Anti bot-loop, sized for NAT: classrooms/offices share one public IP, so one
# IP can legitimately mean ~30 real users. Bot loops (100s/sec) still die.
app.add_middleware(
    RateLimitMiddleware,
    rules=[
        ("/api/nutrition/analyze", 20, 60),
        ("/api/auth/", 40, 60),
        ("/api/suggestions", 10, 60),
        ("/api/", 300, 60),
    ],
)

from .routers import auth_router, challenges, leaderboard, nutrition, suggestions, users, workouts  # noqa: E402

app.include_router(auth_router.router)
app.include_router(users.router)
app.include_router(suggestions.router)
app.include_router(workouts.router)
app.include_router(nutrition.router)
app.include_router(challenges.router)
app.include_router(leaderboard.router)

# Serve the site itself so one Render service covers frontend + API (same origin).
# Only frontend/ is exposed — backend code and repo internals stay private.
app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="site-static")


@app.get("/", include_in_schema=False)
def site_index():
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))


# Frontend split: index.html references /styles.css, /app.js, /clips.js.
# Explicit allowlist (not a full directory mount) so nothing else leaks.
_SITE_ASSETS = {
    "styles.css": "text/css",
    "app.js": "application/javascript",
    "clips.js": "application/javascript",
}


@app.get("/{name}", include_in_schema=False)
def site_asset(name: str):
    if name in _SITE_ASSETS:
        # app.js/styles.css change often during development: force revalidation
        # every load (304 if unchanged — cheap) so phones never run stale code.
        # clips.js (videos, rarely changes) keeps default ETag caching.
        headers = {"Cache-Control": "no-cache"} if name != "clips.js" else None
        return FileResponse(os.path.join(FRONTEND_DIR, name), media_type=_SITE_ASSETS[name], headers=headers)
    from fastapi import HTTPException

    raise HTTPException(404, "Not found")


@app.on_event("startup")
def startup():
    startup_checks()  # refuses boot in prod without JWT secret; locks test fallback
    Base.metadata.create_all(bind=engine)
    # create_all() doesn't add columns to pre-existing tables (Supabase already live).
    db = SessionLocal()
    try:
        from sqlalchemy import text

        db.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS supabase_id VARCHAR(64)"))
        db.commit()
        for c in SEED_CHALLENGES:
            if not db.get(Challenge, c["id"]):
                db.add(Challenge(**c))
        db.commit()
    finally:
        db.close()


@app.get("/api/health")
def health():
    return {"ok": True, "service": "fitquest-api"}
