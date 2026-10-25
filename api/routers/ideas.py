"""Private channel context and personalized follow-up content ideas."""

import logging
import re

from fastapi import APIRouter, Depends, HTTPException, Response

from api.idea_schemas import (ChannelContext, ContentIdea, GeneratedIdeasResponse, GenerateIdeasRequest,
                              IdeaPlatform, IdeaStatus, IdeaStatusRequest)
from api.services import channel_context, gemini, ideas
from api.services.auth import require_user_id

log = logging.getLogger(__name__)


def private_response(response: Response):
    response.headers["Cache-Control"] = "private, no-store"


router = APIRouter(prefix="/ideas", tags=["ideas"], dependencies=[Depends(private_response)])


def _context(user_id, platform):
    try:
        return channel_context.build_context(user_id, platform)
    except Exception as exc:
        log.warning("Channel context unavailable: %s", type(exc).__name__)
        raise HTTPException(503, "Could not load your channel history. Please try again") from None


@router.get("/context", response_model=ChannelContext)
def context(platform: IdeaPlatform | None = None, user_id: str = Depends(require_user_id)):
    return _context(user_id, platform)


@router.get("", response_model=list[ContentIdea])
def list_ideas(platform: IdeaPlatform | None = None, status: IdeaStatus | None = None,
               user_id: str = Depends(require_user_id)):
    return ideas.list_ideas(user_id, platform, status)


@router.post("/generate", response_model=GeneratedIdeasResponse)
def generate(request: GenerateIdeasRequest, user_id: str = Depends(require_user_id)):
    context = _context(user_id, request.platform)
    if not context.can_generate:
        raise HTTPException(422, "Add at least two different captions or video analyses, or connect a channel with recent posts")
    if not gemini.is_configured():
        raise HTTPException(503, "Gemini is not configured for content ideas")
    try:
        generated = ideas.generate_ideas(user_id, context, request.count)
    except Exception as exc:
        log.warning("Content idea generation failed: %s", type(exc).__name__)
        raise HTTPException(502, "Could not generate and save ideas grounded in your history. Please try again") from None
    return GeneratedIdeasResponse(context=context, ideas=generated)


@router.patch("/{idea_id}", response_model=ContentIdea)
def status(idea_id: str, request: IdeaStatusRequest, user_id: str = Depends(require_user_id)):
    if not re.fullmatch(r"[0-9a-f]{32}", idea_id):
        raise HTTPException(404, "Idea not found")
    result = ideas.change_status(user_id, idea_id, request.status)
    if result is None:
        raise HTTPException(404, "Idea not found")
    return result
