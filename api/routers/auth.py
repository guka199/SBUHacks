"""Sign up, sign in, sign out, current user. Users are stored in the app database (Snowflake / local SQLite)."""

import re

from fastapi import APIRouter, Depends, HTTPException, Response

from api.schemas import DeleteAccountRequest, LoginRequest, PasswordChange, ProfileUpdate, SignupRequest, UserOut
from api.services import accounts, auth

router = APIRouter(prefix="/auth", tags=["auth"])
EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _user_out(user: dict) -> UserOut:
    return UserOut(**{k: user.get(k) for k in UserOut.model_fields})


@router.post("/signup", response_model=UserOut)
def signup(req: SignupRequest, response: Response) -> UserOut:
    email = req.email.strip().lower()
    if not EMAIL.match(email):
        raise HTTPException(422, "Enter a valid email address")
    if len(req.password) < 8:
        raise HTTPException(422, "Password must be at least 8 characters")
    if not req.display_name.strip():
        raise HTTPException(422, "Enter your name")
    if accounts.get_user_by_email(email):
        raise HTTPException(409, "An account with this email already exists - sign in instead")
    user = accounts.create_user(email, auth.hash_password(req.password), req.display_name.strip(),
                                req.account_type, (req.niche or "").strip() or None)
    response.set_cookie(value=auth.create_session(user["id"]), **auth.cookie_settings())
    return _user_out(user)


@router.post("/login", response_model=UserOut)
def login(req: LoginRequest, response: Response) -> UserOut:
    user = accounts.get_user_by_email(req.email.strip().lower())
    if not user or not auth.verify_password(req.password, user["password_hash"]):
        raise HTTPException(401, "Wrong email or password")
    response.set_cookie(value=auth.create_session(user["id"]), **auth.cookie_settings())
    return _user_out(user)


@router.post("/logout")
def logout(response: Response) -> dict:
    response.delete_cookie(auth.COOKIE_NAME)
    return {"ok": True}


@router.get("/me", response_model=UserOut | None)
def me(user_id: str | None = Depends(auth.current_user_id)) -> UserOut | None:
    """The signed-in user, or null (not an error: the site asks this on every page load)."""
    user = accounts.get_user(user_id) if user_id else None
    return _user_out(user) if user else None


def _user_or_401(user_id: str) -> dict:
    user = accounts.get_user(user_id)
    if not user:
        raise HTTPException(401, "Please sign in")
    return user


@router.patch("/me", response_model=UserOut)
def update_profile(req: ProfileUpdate, user_id: str = Depends(auth.require_user_id)) -> UserOut:
    _user_or_401(user_id)
    fields = req.model_dump(exclude_unset=True)
    if "display_name" in fields:
        fields["display_name"] = (fields["display_name"] or "").strip()
        if not fields["display_name"]:
            raise HTTPException(422, "Name can't be empty")
    if "niche" in fields:
        fields["niche"] = (fields["niche"] or "").strip() or None
    return _user_out(accounts.update_user(user_id, fields))


@router.post("/password")
def change_password(req: PasswordChange, user_id: str = Depends(auth.require_user_id)) -> dict:
    user = _user_or_401(user_id)
    if not auth.verify_password(req.current_password, user["password_hash"]):
        raise HTTPException(403, "Current password is wrong")
    if len(req.new_password) < 8:
        raise HTTPException(422, "New password must be at least 8 characters")
    accounts.set_password_hash(user_id, auth.hash_password(req.new_password))
    return {"ok": True}


@router.post("/delete-account")
def delete_account(req: DeleteAccountRequest, response: Response, user_id: str = Depends(auth.require_user_id)) -> dict:
    user = _user_or_401(user_id)
    if not auth.verify_password(req.password, user["password_hash"]):
        raise HTTPException(403, "Password is wrong")
    accounts.delete_user(user_id)
    response.delete_cookie(auth.COOKIE_NAME)
    return {"ok": True}
