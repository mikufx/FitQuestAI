from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import NutritionLog, Profile, Suggestion, User, UserChallenge, Workout
from ..schemas import ProfileIn, UserOut
from .auth_router import _user_out
from .deps import current_user

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("/me", response_model=UserOut)
def get_me(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return _user_out(user, db)


@router.delete("/me")
def delete_me(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Permanently delete the account and ALL of its data."""
    uid = user.id
    db.query(UserChallenge).filter_by(user_id=uid).delete()
    db.query(Workout).filter_by(user_id=uid).delete()
    db.query(NutritionLog).filter_by(user_id=uid).delete()
    db.query(Profile).filter_by(user_id=uid).delete()
    db.query(Suggestion).filter_by(user_id=uid).delete()
    db.delete(user)
    db.commit()
    return {"ok": True}


@router.put("/me/profile", response_model=UserOut)
def update_profile(body: ProfileIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    prof = db.query(Profile).filter_by(user_id=user.id).first()
    if not prof:
        prof = Profile(user_id=user.id)
        db.add(prof)
    for k, v in body.model_dump().items():
        setattr(prof, k, v)
    db.commit()
    db.refresh(user)
    return _user_out(user, db)


@router.get("/me/dashboard")
def dashboard(user: User = Depends(current_user), db: Session = Depends(get_db)):
    from sqlalchemy import func
    from ..models import UserChallenge, Workout
    rank_row = db.query(User).order_by(User.xp.desc()).all()
    rank = next((i + 1 for i, u in enumerate(rank_row) if u.id == user.id), 1)
    week = db.query(func.sum(Workout.xp_earned)).filter_by(user_id=user.id).scalar() or 0
    return {
        "xp": user.xp, "streak": user.streak,
        "workoutsCompleted": user.workouts_completed,
        "totalReps": user.total_reps, "totalCalories": user.total_calories,
        "rank": rank, "totalAthletes": len(rank_row), "weekXp": int(week),
        "badges": user.badges or {},
    }
