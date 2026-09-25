"""Password hashing (PBKDF2, stdlib only) + JWT helpers."""
from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta

import jwt

from .security import get_jwt_secret

SECRET = get_jwt_secret()
ALGO = "HS256"
TOKEN_DAYS = 7


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 200_000)
    return salt.hex() + "$" + dk.hex()


def verify_password(password: str, stored: str) -> bool:
    try:
        salt_hex, hash_hex = stored.split("$", 1)
        salt = bytes.fromhex(salt_hex)
        dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 200_000)
        return secrets.compare_digest(dk.hex(), hash_hex)
    except Exception:
        return False


def create_token(user_id: int) -> str:
    payload = {"sub": str(user_id), "exp": datetime.utcnow() + timedelta(days=TOKEN_DAYS)}
    return jwt.encode(payload, SECRET, algorithm=ALGO)


def decode_token(token: str) -> int | None:
    try:
        data = jwt.decode(token, SECRET, algorithms=[ALGO])
        return int(data["sub"])
    except Exception:
        return None
