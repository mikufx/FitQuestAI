"""Feature suggestions: users submit, owner gets them by email (Resend).

Inbox comes from env SUGGEST_TO. Suggestions are always stored in the DB;
email is best-effort — the endpoint still returns ok:true with mailed:false
when no inbox is configured or Resend fails.
"""
from __future__ import annotations

import logging
import os

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..emailer import send_suggestion_email
from ..models import Suggestion, User
from ..schemas import SuggestionIn, SuggestionOut
from .deps import current_user

log = logging.getLogger("fitquest.suggestions")

router = APIRouter(prefix="/api/suggestions", tags=["suggestions"])


@router.post("", response_model=SuggestionOut)
async def submit_suggestion(
    body: SuggestionIn,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    text = body.text.strip()[:500]
    db.add(Suggestion(user_id=user.id, text=text))
    db.commit()

    inbox = os.environ.get("SUGGEST_TO", "").strip()
    if not inbox:
        log.warning("SUGGEST_TO not set — suggestion #%s stored but not emailed", user.id)
        return SuggestionOut(ok=True, mailed=False)
    try:
        await send_suggestion_email(inbox, user.name, user.email, text)
        return SuggestionOut(ok=True, mailed=True)
    except Exception as e:  # Resend down / bad key — suggestion is still stored
        log.warning("Suggestion email failed: %s", e)
        return SuggestionOut(ok=True, mailed=False)
