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

# FitQuestAI/ folder (parent of backend/) — holds the HTML + logo assets.
SITE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from .database import Base, SessionLocal, engine, migrate_user_table
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

# Serve the site itself so ONE ngrok tunnel covers frontend + API (same origin).
app.mount("/static", StaticFiles(directory=SITE_DIR), name="site-static")


@app.get("/", include_in_schema=False)
def site_index():
    return FileResponse(os.path.join(SITE_DIR, "index.html"))


@app.on_event("startup")
def startup():
    startup_checks()  # refuses boot in prod without JWT secret; locks test fallback
    Base.metadata.create_all(bind=engine)
    migrate_user_table()
    db = SessionLocal()
    try:
        for c in SEED_CHALLENGES:
            if not db.get(Challenge, c["id"]):
                db.add(Challenge(**c))
        db.commit()
    finally:
        db.close()


@app.get("/api/health")
def health():
    return {"ok": True, "service": "fitquest-api"}
