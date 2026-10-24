"""Email/password accounts with a signed session cookie (standard library only).

Passwords: scrypt with a random salt per user. Sessions: "<user_id>.<expiry>.<HMAC-SHA256 signature>" in an
httpOnly cookie, signed with SESSION_SECRET from .env (changing it signs everyone out).
"""

import base64
import hashlib
import hmac
import os
import secrets
import time

from fastapi import HTTPException, Request

COOKIE_NAME = "pp_session"
SESSION_DAYS = 7
_SCRYPT = dict(n=2**14, r=8, p=1, dklen=32)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, **_SCRYPT)
    return "scrypt$" + base64.b64encode(salt).decode() + "$" + base64.b64encode(digest).decode()


def verify_password(password: str, stored: str) -> bool:
    try:
        _, salt_b64, digest_b64 = stored.split("$")
        digest = hashlib.scrypt(password.encode(), salt=base64.b64decode(salt_b64), **_SCRYPT)
        return hmac.compare_digest(digest, base64.b64decode(digest_b64))
    except (ValueError, TypeError):
        return False


def _secret() -> bytes:
    secret = os.getenv("SESSION_SECRET")
    if not secret:
        raise RuntimeError("SESSION_SECRET is not set in .env")
    return secret.encode()


def _sign(payload: str) -> str:
    return hmac.new(_secret(), payload.encode(), hashlib.sha256).hexdigest()


def create_session(user_id: str) -> str:
    payload = f"{user_id}.{int(time.time()) + SESSION_DAYS * 86400}"
    return f"{payload}.{_sign(payload)}"


def read_session(token: str | None) -> str | None:
    """User id from a valid, unexpired session token, else None."""
    if not token or token.count(".") != 2:
        return None
    user_id, expires, signature = token.split(".")
    if not hmac.compare_digest(signature, _sign(f"{user_id}.{expires}")):
        return None
    if not expires.isdigit() or int(expires) < time.time():
        return None
    return user_id


def current_user_id(request: Request) -> str | None:
    """FastAPI dependency: the signed-in user's id, or None."""
    return read_session(request.cookies.get(COOKIE_NAME))


def require_user_id(request: Request) -> str:
    """FastAPI dependency: the signed-in user's id, or 401 (also if the account was deleted meanwhile)."""
    from api.services.accounts import get_user

    user_id = current_user_id(request)
    if not user_id or not get_user(user_id):
        raise HTTPException(401, "Please sign in")
    return user_id


def cookie_settings() -> dict:
    return dict(
        key=COOKIE_NAME, httponly=True, samesite="lax", max_age=SESSION_DAYS * 86400,
        secure=os.getenv("COOKIE_SECURE", "false").lower() == "true",  # set true when served over HTTPS
    )
