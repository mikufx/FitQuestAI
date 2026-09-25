from __future__ import annotations

from datetime import date
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User, UserChallenge, Workout
from ..schemas import HistoryDay, WorkoutIn, WorkoutOut
from .deps import current_user

router = APIRouter(prefix="/api/workouts", tags=["workouts"])


def _today_idx() -> int:
    # Mon=0..Sun=6 to match frontend
    return (date.today().weekday()) % 7


def _bump_challenges(db: Session, user: User, exercise_id: str, reps: int):
    rows = db.query(UserChallenge).filter_by(user_id=user.id).all()
    by_id = {r.challenge_id: r for r in rows}
    badges = dict(user.badges or {})
    awarded_xp = 0

    def bump(cid: str, inc: int):
        nonlocal awarded_xp
        r = by_id.get(cid)
        if not r:
            return
        target = {"sq7": 7, "fit30": 30, "pu100": 100, "daily10": 10, "college": 20}[cid]
        reward = {"sq7": 150, "fit30": 600, "pu100": 200, "daily10": 120, "college": 300}[cid]
        was_done = r.progress >= target
        r.progress = min(target, r.progress + inc)
        if r.progress >= target and not was_done:
            badges["challenge"] = True
            user.xp += reward
            awarded_xp += reward

    if exercise_id == "squat":
        bump("sq7", 1)
    if exercise_id == "pushup":
        bump("pu100", reps)
    bump("daily10", 1)
    bump("fit30", 1)
    bump("college", 1)
    if awarded_xp:
        user.badges = badges
    return awarded_xp


@router.post("", response_model=WorkoutOut)
def log_workout(body: WorkoutIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    day = body.date or date.today().isoformat()
    xp = body.xp_earned or (50 + (body.form_score or 80) // 2)
    w = Workout(user_id=user.id, date=day, exercise_id=body.exercise_id,
                exercise_name=body.exercise_name, reps=body.reps, sets=body.sets,
                xp_earned=xp, calories=body.calories, form_score=body.form_score,
                seconds=body.seconds)
    db.add(w)
    user.workouts_completed += 1
    user.total_reps += body.reps
    user.total_calories += body.calories
    user.xp += xp
    if user.workouts_completed == 1:
        user.badges = {**(user.badges or {}), "first": True}
    if body.form_score >= 95:
        user.badges = {**(user.badges or {}), "perfect": True}
    if user.total_reps >= 100:
        user.badges = {**(user.badges or {}), "rep100": True}
    # streak
    days = list(user.streak_days or ["", "", "", "", "", "", ""])
    while len(days) < 7:
        days.append("")
    days[_today_idx()] = "done"
    user.streak_days = days
    user.streak = sum(1 for d in days if d)
    if user.streak >= 7:
        user.badges = {**(user.badges or {}), "streak7": True}
    bonus = _bump_challenges(db, user, body.exercise_id, body.reps)
    db.commit()
    db.refresh(w)
    return WorkoutOut(id=w.id, date=w.date, exercise_id=w.exercise_id, exercise_name=w.exercise_name,
                      reps=w.reps, sets=w.sets, xp_earned=w.xp_earned + 0, calories=w.calories,
                      form_score=w.form_score, seconds=w.seconds)


@router.get("/history", response_model=list[HistoryDay])
def history(days: int = Query(30, ge=1, le=90), user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = (db.query(
        Workout.date,
        func.count(Workout.id).label("n"),
        func.sum(Workout.reps).label("reps"),
        func.sum(Workout.xp_earned).label("xp"),
        func.sum(Workout.calories).label("cal"),
        func.avg(Workout.form_score).label("form"),
    ).filter_by(user_id=user.id).group_by(Workout.date).order_by(Workout.date.desc()).limit(days).all())
    out = [HistoryDay(date=r[0], workouts=int(r[1] or 0), reps=int(r[2] or 0), xp=int(r[3] or 0),
                      calories=int(r[4] or 0), formScore=int(round(float(r[5] or 0)))) for r in rows]
    return list(reversed(out))
