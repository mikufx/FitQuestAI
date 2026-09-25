"""Pydantic request/response schemas."""
from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field


class SignupIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class SupabaseLoginIn(BaseModel):
    """Short-lived Supabase access token (from Google OAuth) to exchange for a FitQuest token."""
    access_token: str = Field(min_length=10, max_length=8000)


class SignupOut(BaseModel):
    message: str
    email: str
    dev_code: str | None = None  # only set when no RESEND_API_KEY (local dev)


class VerifyIn(BaseModel):
    email: EmailStr
    code: str = Field(min_length=4, max_length=12)


class ResendIn(BaseModel):
    email: EmailStr


class ForgotIn(BaseModel):
    email: EmailStr


class ResetIn(BaseModel):
    email: EmailStr
    code: str = Field(min_length=4, max_length=12)
    new_password: str = Field(min_length=6, max_length=128)


class SuggestionIn(BaseModel):
    text: str = Field(min_length=1, max_length=500)


class SuggestionOut(BaseModel):
    ok: bool = True
    mailed: bool = False


class ProfileIn(BaseModel):
    age: int | None = None
    gender: str | None = None
    height: float | None = None
    weight: float | None = None
    city: str | None = None
    goal: str | None = None
    level: str | None = None
    activity: str | None = None


class ProfileOut(ProfileIn):
    pass


class UserOut(BaseModel):
    id: int
    name: str
    email: str
    xp: int
    level: int
    workouts_completed: int
    total_reps: int
    total_calories: int
    streak: int
    streak_days: list = []
    badges: dict = {}
    profile: ProfileOut | None = None


class WorkoutIn(BaseModel):
    exercise_id: str = ""
    exercise_name: str = ""
    reps: int = 0
    sets: int = 1
    xp_earned: int = 0
    calories: int = 0
    form_score: int = 0
    seconds: int = 0
    date: str | None = None  # YYYY-MM-DD, defaults to today


class WorkoutOut(BaseModel):
    id: int
    date: str
    exercise_id: str
    exercise_name: str
    reps: int
    sets: int
    xp_earned: int
    calories: int
    form_score: int
    seconds: int


class HistoryDay(BaseModel):
    date: str
    workouts: int
    reps: int
    xp: int
    calories: int
    formScore: int


class MealIn(BaseModel):
    meal: str = "Snack"
    name: str
    kcal: int = 0
    p: float = 0
    c: float = 0
    f: float = 0
    qty: float = 1
    date: str | None = None


class MealOut(MealIn):
    id: int
    date: str


class ChallengeOut(BaseModel):
    id: str
    icon: str
    name: str
    desc: str
    target: int
    progress: int = 0
    xp: int
    participants: int
    unit: str
    completed: bool = False


class LeaderRow(BaseModel):
    name: str
    xp: int
    level: int
    workouts: int
    me: bool = False
