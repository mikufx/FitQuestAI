from __future__ import annotations

import base64
from datetime import date
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..food_vision import analyze_food_image
from ..models import NutritionLog, User
from ..schemas import MealIn, MealOut
from ..security import acquire_vision_slot, release_vision_slot
from .deps import current_user

router = APIRouter(prefix="/api/nutrition", tags=["nutrition"])
GOALS = {"calGoal": 2200, "pGoal": 100, "cGoal": 250, "fGoal": 70}
MAX_UPLOAD_BYTES = 6 * 1024 * 1024


@router.post("/log", response_model=MealOut)
def add_meal(body: MealIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    day = body.date or date.today().isoformat()
    row = NutritionLog(user_id=user.id, date=day, meal=body.meal, name=body.name,
                       kcal=body.kcal, p=body.p, c=body.c, f=body.f, qty=body.qty)
    db.add(row)
    db.commit()
    db.refresh(row)
    return MealOut(id=row.id, date=row.date, meal=row.meal, name=row.name, kcal=row.kcal,
                   p=row.p, c=row.c, f=row.f, qty=row.qty)


@router.get("/today")
def today(date_: str | None = Query(None, alias="date"), user: User = Depends(current_user), db: Session = Depends(get_db)):
    day = date_ or date.today().isoformat()
    rows = db.query(NutritionLog).filter_by(user_id=user.id, date=day).all()
    totals = {"kcal": 0, "p": 0.0, "c": 0.0, "f": 0.0}
    items = []
    for r in rows:
        totals["kcal"] += r.kcal
        totals["p"] += r.p
        totals["c"] += r.c
        totals["f"] += r.f
        items.append({"id": r.id, "meal": r.meal, "name": r.name, "kcal": r.kcal, "p": r.p, "c": r.c, "f": r.f, "qty": r.qty})
    return {"date": day, "goals": GOALS, "totals": totals, "log": items}


@router.delete("/{meal_id}")
def delete_meal(meal_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    row = db.query(NutritionLog).filter_by(id=meal_id, user_id=user.id).first()
    if row:
        db.delete(row)
        db.commit()
    return {"ok": True}


class AnalyzeUrlIn(BaseModel):
    image_url: str


@router.post("/analyze")
async def analyze_url(body: AnalyzeUrlIn, user: User = Depends(current_user)):
    """Analyze a publicly reachable image URL with the NVIDIA vision model."""
    await acquire_vision_slot()
    try:
        return await analyze_food_image(body.image_url)
    except ValueError:
        raise HTTPException(422, "No food detected in image")
    except RuntimeError as e:
        raise HTTPException(503, str(e))
    except Exception as e:
        detail = str(e) or repr(e)
        raise HTTPException(502, f"Vision API error: {detail[:200]}")
    finally:
        release_vision_slot()


@router.post("/analyze-upload")
async def analyze_upload(file: UploadFile = File(...), user: User = Depends(current_user)):
    """Analyze an uploaded photo. Auth required so the paid API key isn't openly abusable."""
    if file.content_type and not file.content_type.startswith("image/"):
        raise HTTPException(400, "File must be an image")
    raw = await file.read()
    if not raw:
        raise HTTPException(400, "Empty file")
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "Image too large (max 6MB)")
    mime = file.content_type or "image/jpeg"
    data_url = f"data:{mime};base64," + base64.b64encode(raw).decode()
    await acquire_vision_slot()
    try:
        return await analyze_food_image(data_url)
    except ValueError:
        raise HTTPException(422, "No food detected in image")
    except RuntimeError as e:
        raise HTTPException(503, str(e))
    except Exception as e:
        detail = str(e) or repr(e)
        raise HTTPException(502, f"Vision API error: {detail[:200]}")
    finally:
        release_vision_slot()
