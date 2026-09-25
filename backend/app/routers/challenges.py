from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import SEED_CHALLENGES, Challenge, User, UserChallenge
from ..schemas import ChallengeOut
from .deps import current_user

router = APIRouter(prefix="/api/challenges", tags=["challenges"])

TARGETS = {c["id"]: c["target"] for c in SEED_CHALLENGES}
REWARDS = {c["id"]: c["xp"] for c in SEED_CHALLENGES}


def _ensure(db: Session, user: User):
    for c in SEED_CHALLENGES:
        if not db.get(Challenge, c["id"]):
            db.add(Challenge(**c))
    db.flush()
    have = {r.challenge_id for r in db.query(UserChallenge).filter_by(user_id=user.id).all()}
    for c in SEED_CHALLENGES:
        if c["id"] not in have:
            db.add(UserChallenge(user_id=user.id, challenge_id=c["id"], progress=0))
    db.commit()


@router.get("", response_model=list[ChallengeOut])
def list_challenges(user: User = Depends(current_user), db: Session = Depends(get_db)):
    _ensure(db, user)
    rows = db.query(Challenge, UserChallenge).join(
        UserChallenge, (UserChallenge.challenge_id == Challenge.id) & (UserChallenge.user_id == user.id)).all()
    return [ChallengeOut(id=c.id, icon=c.icon, name=c.name, desc=c.desc, target=c.target,
                         progress=uc.progress, xp=c.xp, participants=c.participants, unit=c.unit,
                         completed=uc.progress >= c.target) for c, uc in rows]


@router.post("/{cid}/progress", response_model=ChallengeOut)
def bump(cid: str, increment: int = 1, user: User = Depends(current_user), db: Session = Depends(get_db)):
    _ensure(db, user)
    chal = db.get(Challenge, cid)
    if not chal:
        raise HTTPException(404, "Challenge not found")
    uc = db.query(UserChallenge).filter_by(user_id=user.id, challenge_id=cid).first()
    was_done = uc.progress >= chal.target
    uc.progress = min(chal.target, uc.progress + max(1, increment))
    if uc.progress >= chal.target and not was_done:
        user.badges = {**(user.badges or {}), "challenge": True}
        user.xp += chal.xp
    db.commit()
    return ChallengeOut(id=chal.id, icon=chal.icon, name=chal.name, desc=chal.desc, target=chal.target,
                        progress=uc.progress, xp=chal.xp, participants=chal.participants, unit=chal.unit,
                        completed=uc.progress >= chal.target)
