"""DB engine + session helpers. SQLite locally, Postgres (Supabase) when DATABASE_URL is set."""
from __future__ import annotations

import os
from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.environ.get("FITQUEST_DB", os.path.join(BASE_DIR, "fitquest.db"))
DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()

IS_POSTGRES = DATABASE_URL.startswith("postgres")

if IS_POSTGRES:
    # Supabase Postgres (psycopg2). Pool sized for Render free + Supabase free.
    engine = create_engine(DATABASE_URL, pool_size=5, max_overflow=10, pool_pre_ping=True)
else:
    engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()


@event.listens_for(engine, "connect")
def _sqlite_pragmas(dbapi_conn, _):
    if IS_POSTGRES:
        return
    # WAL: readers never block writers (concurrent users); busy timeout
    # avoids "database is locked" under write contention.
    cur = dbapi_conn.cursor()
    cur.execute("PRAGMA journal_mode=WAL;")
    cur.execute("PRAGMA busy_timeout=10000;")
    cur.execute("PRAGMA synchronous=NORMAL;")
    cur.close()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def migrate_user_table(db_path: str = DB_PATH) -> list[str]:
    """Add email-verification columns to pre-existing users tables. Returns added columns."""
    if IS_POSTGRES:
        return []  # create_all() covers fresh Postgres; no legacy SQLite file to migrate.
    import sqlite3

    wanted = {
        "is_verified": "BOOLEAN DEFAULT 0",
        "verify_code_hash": "VARCHAR(64)",
        "verify_expires": "DATETIME",
        "last_code_sent_at": "DATETIME",
    }
    added: list[str] = []
    con = sqlite3.connect(db_path)
    try:
        tables = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if "users" not in tables:
            return added
        existing = {r[1] for r in con.execute("PRAGMA table_info(users)")}
        for col, ddl in wanted.items():
            if col not in existing:
                con.execute(f"ALTER TABLE users ADD COLUMN {col} {ddl}")
                added.append(col)
        con.commit()
    finally:
        con.close()
    return added
