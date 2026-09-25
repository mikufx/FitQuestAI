from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User
from ..schemas import LeaderRow
from .deps import current_user, level_for_xp

router = APIRouter(prefix="/api/leaderboard", tags=["leaderboard"])


@router.get("", response_model=list[LeaderRow])
def board(limit: int = Query(50, ge=1, le=200), user: User = Depends(current_user), db: Session = Depends(get_db)):
    users = db.query(User).order_by(User.xp.desc()).limit(limit).all()
    return [LeaderRow(name=u.name, xp=u.xp or 0, level=level_for_xp(u.xp or 0) + 1,
                      workouts=u.workouts_completed or 0, me=(u.id == user.id)) for u in users]
