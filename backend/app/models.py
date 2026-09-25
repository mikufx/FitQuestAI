"""SQLAlchemy models. Mirrors the frontend `state` shape."""
from __future__ import annotations

from datetime import datetime
from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow():
    return datetime.utcnow()


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    pw_hash: Mapped[str] = mapped_column(String(512), nullable=False)
    xp: Mapped[int] = mapped_column(Integer, default=0)
    workouts_completed: Mapped[int] = mapped_column(Integer, default=0)
    total_reps: Mapped[int] = mapped_column(Integer, default=0)
    total_calories: Mapped[int] = mapped_column(Integer, default=0)
    streak: Mapped[int] = mapped_column(Integer, default=0)
    streak_days: Mapped[list] = mapped_column(JSON, default=list)  # 7 entries Mon..Sun
    badges: Mapped[dict] = mapped_column(JSON, default=dict)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    verify_code_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    verify_expires: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_code_sent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    profile: Mapped["Profile | None"] = relationship("Profile", back_populates="user", uselist=False, cascade="all, delete-orphan")
    workouts: Mapped[list["Workout"]] = relationship("Workout", back_populates="user", cascade="all, delete-orphan")
    meals: Mapped[list["NutritionLog"]] = relationship("NutritionLog", back_populates="user", cascade="all, delete-orphan")
    challenges: Mapped[list["UserChallenge"]] = relationship("UserChallenge", back_populates="user", cascade="all, delete-orphan")


class Profile(Base):
    __tablename__ = "profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, nullable=False)
    age: Mapped[int | None] = mapped_column(Integer, nullable=True)
    gender: Mapped[str | None] = mapped_column(String(40), nullable=True)
    height: Mapped[float | None] = mapped_column(Float, nullable=True)
    weight: Mapped[float | None] = mapped_column(Float, nullable=True)
    city: Mapped[str | None] = mapped_column(String(120), nullable=True)
    goal: Mapped[str | None] = mapped_column(String(120), nullable=True)
    level: Mapped[str | None] = mapped_column(String(40), nullable=True)
    activity: Mapped[str | None] = mapped_column(String(40), nullable=True)

    user: Mapped[User] = relationship("User", back_populates="profile")


class Workout(Base):
    __tablename__ = "workouts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    date: Mapped[str] = mapped_column(String(10), index=True)  # YYYY-MM-DD
    exercise_id: Mapped[str] = mapped_column(String(60), default="")
    exercise_name: Mapped[str] = mapped_column(String(120), default="")
    reps: Mapped[int] = mapped_column(Integer, default=0)
    sets: Mapped[int] = mapped_column(Integer, default=1)
    xp_earned: Mapped[int] = mapped_column(Integer, default=0)
    calories: Mapped[int] = mapped_column(Integer, default=0)
    form_score: Mapped[int] = mapped_column(Integer, default=0)
    seconds: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    user: Mapped[User] = relationship("User", back_populates="workouts")


class NutritionLog(Base):
    __tablename__ = "nutrition_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    date: Mapped[str] = mapped_column(String(10), index=True)
    meal: Mapped[str] = mapped_column(String(40), default="Snack")
    name: Mapped[str] = mapped_column(String(120), default="")
    kcal: Mapped[int] = mapped_column(Integer, default=0)
    p: Mapped[float] = mapped_column(Float, default=0)
    c: Mapped[float] = mapped_column(Float, default=0)
    f: Mapped[float] = mapped_column(Float, default=0)
    qty: Mapped[float] = mapped_column(Float, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    user: Mapped[User] = relationship("User", back_populates="meals")


class Challenge(Base):
    __tablename__ = "challenges"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    icon: Mapped[str] = mapped_column(String(16), default="")
    name: Mapped[str] = mapped_column(String(160), default="")
    desc: Mapped[str] = mapped_column(String(500), default="")
    target: Mapped[int] = mapped_column(Integer, default=1)
    xp: Mapped[int] = mapped_column(Integer, default=0)
    participants: Mapped[int] = mapped_column(Integer, default=0)
    unit: Mapped[str] = mapped_column(String(40), default="")


class UserChallenge(Base):
    __tablename__ = "user_challenges"
    __table_args__ = (UniqueConstraint("user_id", "challenge_id", name="uq_user_challenge"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    challenge_id: Mapped[str] = mapped_column(ForeignKey("challenges.id"), nullable=False)
    progress: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    user: Mapped[User] = relationship("User", back_populates="challenges")
    challenge: Mapped[Challenge] = relationship("Challenge")


class Suggestion(Base):
    __tablename__ = "suggestions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    text: Mapped[str] = mapped_column(String(500), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


SEED_CHALLENGES = [
    {"id": "sq7", "icon": "🦵", "name": "7-Day Squat Challenge", "desc": "Complete squat sets every day for a week.", "target": 7, "xp": 150, "participants": 214, "unit": "days"},
    {"id": "fit30", "icon": "📅", "name": "30-Day Fitness Challenge", "desc": "Complete at least one workout for 30 days.", "target": 30, "xp": 600, "participants": 512, "unit": "days"},
    {"id": "pu100", "icon": "💪", "name": "100 Push-up Challenge", "desc": "Accumulate 100 push-up reps.", "target": 100, "xp": 200, "participants": 341, "unit": "reps"},
    {"id": "daily10", "icon": "⏱️", "name": "Daily 10-Minute Challenge", "desc": "Complete a 10-minute session daily.", "target": 10, "xp": 120, "participants": 178, "unit": "sessions"},
    {"id": "college", "icon": "🎓", "name": "College Fitness Challenge", "desc": "Represent your college on the national leaderboard.", "target": 20, "xp": 300, "participants": 96, "unit": "workouts"},
]
