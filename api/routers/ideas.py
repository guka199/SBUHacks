"""Private channel context and personalized follow-up content ideas."""

import logging
import re

from fastapi import APIRouter, Depends, HTTPException, Response

from api.idea_schemas import (ChannelContext, ContentIdea, CreatorPreferences, CreatorPreferencesResponse,
                              GeneratedIdeasResponse, GenerateIdeasRequest, IdeaTarget, IdeaStatus,
                              IdeaStatusRequest, RefreshMemoryRequest, IdeaFeedbackRequest)
from api.services import channel_context, creator_memory, gemini, ideas, idea_trends
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
def context(platform: IdeaTarget | None = None, user_id: str = Depends(require_user_id)):
    return _context(user_id, platform)


@router.get("/preferences", response_model=CreatorPreferencesResponse)
def preferences(user_id: str = Depends(require_user_id)):
    try:
        return creator_memory.get_preferences(user_id)
    except Exception as exc:
        log.warning("Creator preferences unavailable: %s", type(exc).__name__)
        raise HTTPException(503, "Could not load your idea preferences. Please try again") from None


@router.put("/preferences", response_model=CreatorPreferencesResponse)
def save_preferences(request: CreatorPreferences, user_id: str = Depends(require_user_id)):
    try:
        return creator_memory.save_preferences(user_id, request)
    except Exception as exc:
        log.warning("Creator preferences could not be saved: %s", type(exc).__name__)
        raise HTTPException(503, "Could not save your idea preferences. Please try again") from None


def _require_history_and_gemini(context: ChannelContext):
    if not context.can_generate:
        raise HTTPException(422, "Add at least two different captions or video analyses, or connect a channel with recent posts")
    if not gemini.is_configured():
        raise HTTPException(503, "Gemini is not configured for content ideas")


@router.post("/memory/refresh", response_model=ChannelContext)
def refresh_memory(request: RefreshMemoryRequest, user_id: str = Depends(require_user_id)):
    context = _context(user_id, None)
    _require_history_and_gemini(context)
    try:
        creator_memory.refresh_memory(user_id, context)
    except Exception as exc:
        log.warning("Channel memory refresh failed: %s", type(exc).__name__)
        raise HTTPException(502, "Could not build and save channel memory from your history. Please try again") from None
    # Recheck freshness and read the latest preferences after a slow provider call.
    return _context(user_id, None)


@router.get("", response_model=list[ContentIdea])
def list_ideas(platform: IdeaTarget | None = None, status: IdeaStatus | None = None,
               user_id: str = Depends(require_user_id)):
    return ideas.list_ideas(user_id, platform, status)


@router.post("/generate", response_model=GeneratedIdeasResponse)
def generate(request: GenerateIdeasRequest, user_id: str = Depends(require_user_id)):
    context = _context(user_id, request.platform)
    _require_history_and_gemini(context)
    try:
        if context.memory is None or context.memory.is_stale:
            global_context = context if request.platform is None else _context(user_id, None)
            creator_memory.refresh_memory(user_id, global_context)
            context = _context(user_id, request.platform)
            if context.memory is None or context.memory.is_stale:
                raise creator_memory.InvalidMemory("Channel history changed during memory refresh; retry")
            _require_history_and_gemini(context)
        context.trend_research = idea_trends.research(user_id, context, request)
        if request.platform == "all_platforms" and context.trend_research.platform and request.use_trends:
            context.trend_research.notes.append(
                "Research covers " + context.trend_research.platform + " only; it does not establish trends on every platform."
            )
        context.warnings.extend(context.trend_research.notes)
        generated = ideas.generate_ideas(user_id, context, request.count)
    except HTTPException:
        raise
    except ideas.InvalidIdeas as exc:
        # These are fixed application validation messages, never provider text
        # or user content. Keep enough detail to diagnose a rejected batch.
        log.warning("Content idea validation failed: %s", str(exc))
        raise HTTPException(502, "The AI returned an incomplete or repeated idea batch. Please try generating again") from None
    except Exception as exc:
        if getattr(exc, "status_code", None) == 400:
            detail = str(exc).lower()
            log.warning("Idea provider rejected request: schema=%s, complexity=%s, array_bounds=%s",
                        "schema" in detail, "complex" in detail or "states" in detail,
                        "minitems" in detail or "maxitems" in detail)
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


@router.patch("/{idea_id}/feedback", response_model=ContentIdea)
def feedback(idea_id: str, request: IdeaFeedbackRequest, user_id: str = Depends(require_user_id)):
    if not re.fullmatch(r"[0-9a-f]{32}", idea_id):
        raise HTTPException(404, "Idea not found")
    result = ideas.change_feedback(user_id, idea_id, request.feedback)
    if result is None:
        raise HTTPException(404, "Idea not found")
    return result
