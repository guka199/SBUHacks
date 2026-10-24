"""The signed-in user's previously scored drafts (saved automatically by POST /score)."""

from fastapi import APIRouter, Depends

from api.services import drafts
from api.services.auth import require_user_id

router = APIRouter(prefix="/drafts", tags=["drafts"])


@router.get("")
def list_drafts(user_id: str = Depends(require_user_id)) -> list[dict]:
    return drafts.list_drafts(user_id)
