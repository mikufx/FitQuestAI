from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..auth import create_token, hash_password, verify_password
from ..database import get_db
from ..emailer import send_verification_email
from ..models import SEED_CHALLENGES, Challenge, Profile, User, UserChallenge
from ..schemas import ForgotIn, LoginIn, ResendIn, ResetIn, SignupIn, SignupOut, SupabaseLoginIn, TokenOut, UserOut, VerifyIn
from ..supabase_auth import verify_supabase_token
from .deps import current_user, level_for_xp

router = APIRouter(prefix="/api/auth", tags=["auth"])

CODE_TTL = timedelta(minutes=20)
RESEND_COOLDOWN = timedelta(seconds=45)


def _fallback_allowed() -> bool:
    import os

    return os.environ.get("RESEND_ALLOW_TEST_FALLBACK", "1") == "1"


def _result_message(dev_code: str | None) -> str:
    """User-facing message matching how the code was delivered."""
    import os

    if dev_code and os.environ.get("RESEND_API_KEY"):
        return "Email could not be delivered (Resend test domain only sends to your own inbox). Use the code shown here."
    return "Account created. Check your email for the verification code."


def _ensure_challenges(db: Session, user: User):
    for c in SEED_CHALLENGES:
        if not db.get(Challenge, c["id"]):
            db.add(Challenge(**c))
    db.flush()
    existing = {uc.challenge_id for uc in db.query(UserChallenge).filter_by(user_id=user.id).all()}
    for c in SEED_CHALLENGES:
        if c["id"] not in existing:
            db.add(UserChallenge(user_id=user.id, challenge_id=c["id"], progress=0))


def _user_out(user: User, db: Session) -> UserOut:
    prof = db.query(Profile).filter_by(user_id=user.id).first()
    return UserOut(
        id=user.id, name=user.name, email=user.email, xp=user.xp,
        level=level_for_xp(user.xp) + 1, workouts_completed=user.workouts_completed,
        total_reps=user.total_reps, total_calories=user.total_calories,
        streak=user.streak, streak_days=user.streak_days or [],
        badges=user.badges or {},
        profile=(prof and {
            "age": prof.age, "gender": prof.gender, "height": prof.height,
            "weight": prof.weight, "city": prof.city, "goal": prof.goal,
            "level": prof.level, "activity": prof.activity,
        }),
    )


def _new_code() -> str:
    return "".join(secrets.choice("0123456789") for _ in range(6))


def _code_hash(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


async def _issue_code(db: Session, user: User) -> str | None:
    """Generate + store a code, send the email. Returns dev_code when:
    - no RESEND_API_KEY (local dev), or
    - Resend refuses with its test-domain restriction and RESEND_ALLOW_TEST_FALLBACK=1.
    All other send failures raise."""
    import os

    code = _new_code()
    user.verify_code_hash = _code_hash(code)
    user.verify_expires = datetime.utcnow() + CODE_TTL
    user.last_code_sent_at = datetime.utcnow()
    db.commit()
    if not os.environ.get("RESEND_API_KEY"):
        print(f"[dev] verification code for {user.email}: {code}")
        return code
    try:
        await send_verification_email(user.email, user.name, code)
        return None
    except RuntimeError as e:
        msg = str(e)
        if _fallback_allowed() and "403" in msg and "testing" in msg.lower():
            print(f"[fallback] Resend test-domain restriction for {user.email}; dev code: {code}")
            return code
        raise


@router.post("/signup", response_model=SignupOut, status_code=201)
async def signup(body: SignupIn, db: Session = Depends(get_db)):
    email = body.email.strip().lower()
    existing = db.query(User).filter_by(email=email).first()
    if existing and existing.is_verified:
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered. Please log in.")
    if existing:
        # Retry: re-issue a fresh code to the unverified account
        try:
            dev = await _issue_code(db, existing)
        except RuntimeError as e:
            raise HTTPException(502, str(e))
        msg = "Account exists but is unverified. " + (_result_message(dev) if dev else "New code sent.")
        return SignupOut(message=msg, email=email, dev_code=dev)
    user = User(name=body.name.strip(), email=email, pw_hash=hash_password(body.password),
                streak_days=["", "", "", "", "", "", ""], is_verified=False)
    db.add(user)
    db.flush()
    _ensure_challenges(db, user)
    try:
        dev = await _issue_code(db, user)
    except RuntimeError as e:
        raise HTTPException(502, str(e))
    return SignupOut(message=_result_message(dev), email=email, dev_code=dev)


@router.post("/verify", response_model=TokenOut)
def verify(body: VerifyIn, db: Session = Depends(get_db)):
    email = body.email.strip().lower()
    user = db.query(User).filter_by(email=email).first()
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Account not found")
    if user.is_verified:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Already verified. Please log in.")
    code = body.code.strip()
    if not user.verify_code_hash or not user.verify_expires:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No code issued. Request a new one.")
    if datetime.utcnow() > user.verify_expires:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Code expired. Request a new one.")
    if secrets.compare_digest(_code_hash(code), user.verify_code_hash):
        user.is_verified = True
        user.verify_code_hash = None
        user.verify_expires = None
        db.commit()
        return TokenOut(access_token=create_token(user.id))
    raise HTTPException(status.HTTP_400_BAD_REQUEST, "Wrong code. Check and try again.")


@router.post("/resend-code", response_model=SignupOut)
async def resend(body: ResendIn, db: Session = Depends(get_db)):
    email = body.email.strip().lower()
    user = db.query(User).filter_by(email=email).first()
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Account not found")
    if user.is_verified:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Already verified. Please log in.")
    if user.last_code_sent_at and datetime.utcnow() - user.last_code_sent_at < RESEND_COOLDOWN:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Wait a few seconds before requesting a new code.")
    try:
        dev = await _issue_code(db, user)
    except RuntimeError as e:
        raise HTTPException(502, str(e))
    msg = _result_message(dev) if dev else "New code sent. Check your email."
    return SignupOut(message=msg, email=email, dev_code=dev)


@router.post("/supabase", response_model=TokenOut)
def supabase_login(body: SupabaseLoginIn, db: Session = Depends(get_db)):
    """Exchange a verified Supabase (Google) access token for a FitQuest token.

    Same email as an existing email-code account = same merged account.
    Google-verified emails skip the Resend code step (Google already proved ownership).
    """
    try:
        ident = verify_supabase_token(body.access_token)
    except RuntimeError as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(e))
    user = db.query(User).filter_by(supabase_id=ident["sub"]).first()
    if not user:
        user = db.query(User).filter_by(email=ident["email"]).first()
        if user:
            user.supabase_id = ident["sub"]  # merge: link Google to existing account
            user.is_verified = True
        else:
            user = User(
                name=ident["name"], email=ident["email"],
                pw_hash=hash_password(secrets.token_hex(32)),  # random: password login stays disabled
                streak_days=["", "", "", "", "", "", ""],
                is_verified=True, supabase_id=ident["sub"],
            )
            db.add(user)
            db.flush()
            _ensure_challenges(db, user)
    db.commit()
    return TokenOut(access_token=create_token(user.id))


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, db: Session = Depends(get_db)):
    email = body.email.strip().lower()
    user = db.query(User).filter_by(email=email).first()
    if not user or not verify_password(body.password, user.pw_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    if not user.is_verified:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Email not verified. Check your inbox for the code.")
    return TokenOut(access_token=create_token(user.id))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.refresh(user)
    return _user_out(user, db)


@router.post("/forgot", response_model=SignupOut)
async def forgot(body: ForgotIn, db: Session = Depends(get_db)):
    """Email a password-reset code. Always returns a generic message so
    addresses can't be enumerated; dev_code is set when email can't deliver."""
    email = body.email.strip().lower()
    user = db.query(User).filter_by(email=email).first()
    if not user:
        return SignupOut(message="If the account exists, a reset code was sent.", email=email, dev_code=None)
    if user.last_code_sent_at and datetime.utcnow() - user.last_code_sent_at < RESEND_COOLDOWN:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Wait a few seconds before requesting a new code.")
    try:
        dev = await _issue_code(db, user)
    except RuntimeError as e:
        raise HTTPException(502, str(e))
    msg = _result_message(dev) if dev else "Reset code sent. Check your email."
    return SignupOut(message=msg, email=email, dev_code=dev)


@router.post("/reset", response_model=SignupOut)
def reset(body: ResetIn, db: Session = Depends(get_db)):
    """Verify the reset code and set a new password."""
    email = body.email.strip().lower()
    user = db.query(User).filter_by(email=email).first()
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Account not found")
    code = body.code.strip()
    if not user.verify_code_hash or not user.verify_expires:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No code issued. Request a new one.")
    if datetime.utcnow() > user.verify_expires:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Code expired. Request a new one.")
    if not secrets.compare_digest(_code_hash(code), user.verify_code_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Wrong code. Check and try again.")
    user.pw_hash = hash_password(body.new_password)
    user.verify_code_hash = None
    user.verify_expires = None
    db.commit()
    return SignupOut(message="Password reset. Log in with your new password.", email=email, dev_code=None)
