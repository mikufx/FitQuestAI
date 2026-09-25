"""DB engine + session helpers. Postgres (Supabase) only — SQLite was removed.

DATABASE_URL is required. The app refuses to boot without it so we never
silently fall back to an ephemeral local database (data loss on Render).
"""
from __future__ import annotations

import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()

if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is not set. Point it at your Supabase pooler URI "
        "(Supabase dashboard → Connect → Transaction/Session pooler → URI)."
    )
if not DATABASE_URL.startswith("postgres"):
    raise RuntimeError(f"DATABASE_URL looks invalid (must start with 'postgres'): {DATABASE_URL[:12]}...")

# Pool sized for Render free + Supabase free. pool_pre_ping drops dead
# pooled connections (pooler timeouts) instead of failing requests.
engine = create_engine(DATABASE_URL, pool_size=5, max_overflow=10, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
