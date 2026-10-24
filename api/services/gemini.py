"""Gemini content review: judges the actual draft (image/video + caption) and writes suggestions.

The standard trained model sees caption statistics, timing and account context; opt-in YouTube
models also use CLIP thumbnail features. Gemini looks at the
content itself and also receives the model's findings, so it can write ONE merged suggestion list.

Config (.env): GEMINI_API_KEY (required); GEMINI_MODEL and GEMINI_THINKING (optional, defaults below).
Uses the google-genai SDK's Interactions API with structured JSON output.
"""

import base64
import copy
import io
import os
import time

from pydantic import BaseModel, Field

DEFAULT_MODEL = "gemini-3.5-flash-lite"  # ~3 s per review; 3.8-flash took 2-5 min in testing
DEFAULT_THINKING = ""  # e.g. "low"; empty = the model's own default
INLINE_LIMIT_BYTES = 18 * 1024 * 1024  # Gemini's inline limit is 20 MB per request; bigger files go via the Files API
UPLOAD_TIMEOUT_S = 120


class GeminiPlatformScore(BaseModel):
    platform: str = Field(description="one of the platforms you were asked to judge")
    score: int = Field(description="0-100 percentile vs. typical posts on that platform; 50 = typical")
    reason: str = Field(description="one sentence: why this score on this platform")


class GeminiAnalysis(BaseModel):
    summary: str = Field(description="one sentence describing what the post shows and says")
    hook: int = Field(description="0-100: how strongly the first second / first line grabs attention")
    visual_quality: int = Field(description="0-100: lighting, framing, legibility (50 if there is no media)")
    clarity: int = Field(description="0-100: how quickly the message is understood")
    trend_fit: int = Field(description="0-100: fit with formats that currently perform on these platforms")
    platform_scores: list[GeminiPlatformScore]
    strengths: list[str] = Field(description="up to 3 short things the post does well")
    suggestions: list[str] = Field(description="exactly 3 specific, actionable edits, most impactful first")


PROMPT = """You are an expert social media strategist reviewing a DRAFT post before it is published.

Platforms to judge: {platforms}
Caption / title: {caption}
Planned posting time: {planned}
Account context: {context}
Attached media: {media}

Our statistical model was trained on historical post outcomes. Its inputs: {model_inputs}.
Its scores (0-100 percentile vs. posts in its platform training dataset):
{model_scores}
Factors the model says hurt the score most:
{factors}

Score the CONTENT itself for each platform on the same scale: 50 = a typical post on that platform, 75 = top quarter,
90+ = exceptional. Judge the hook (first second / first line), visual quality, clarity of the message, and fit with
what currently performs on each platform. Be calibrated and honest: most drafts land between 30 and 70.

Then write exactly 3 suggestions, most impactful first. Each must be a concrete edit to THIS post (what to cut, what
to show first, what to say, when to post), merging in the model's factors where they matter. No generic advice."""


def is_configured() -> bool:
    return bool(os.getenv("GEMINI_API_KEY"))


def _inline_refs(schema: dict) -> dict:
    """Pydantic puts nested models in $defs/$ref; inline them so the schema is self-contained."""
    schema = copy.deepcopy(schema)
    defs = schema.pop("$defs", {})

    def resolve(node):
        if isinstance(node, dict):
            if "$ref" in node:
                return resolve(defs[node["$ref"].split("/")[-1]])
            return {k: resolve(v) for k, v in node.items()}
        if isinstance(node, list):
            return [resolve(v) for v in node]
        return node

    return resolve(schema)


def _upload(client, media: bytes, mime_type: str):
    """Upload a large file with the Files API and wait until Gemini has processed it."""
    uploaded = client.files.upload(file=io.BytesIO(media), config={"mime_type": mime_type})
    deadline = time.time() + UPLOAD_TIMEOUT_S
    while not uploaded.state or uploaded.state.name != "ACTIVE":
        if uploaded.state and uploaded.state.name == "FAILED":
            raise RuntimeError("Gemini could not process the uploaded file")
        if time.time() > deadline:
            raise TimeoutError("Gemini took too long to process the uploaded file")
        time.sleep(2)
        uploaded = client.files.get(name=uploaded.name)
    return uploaded


def analyze(
    platforms: list[str],
    caption: str,
    planned_time: str | None,
    context: dict,
    model_scores: dict[str, float],
    model_factors: list[str],
    media: bytes | None = None,
    mime_type: str | None = None,
    thumbnail: bytes | None = None,
    thumbnail_mime_type: str | None = None,
    model_uses_thumbnail: bool = False,
) -> GeminiAnalysis:
    """Ask Gemini to review the draft. Raises on any failure (the caller falls back to model-only)."""
    from google import genai

    client = genai.Client()  # reads GEMINI_API_KEY from the environment
    prompt = PROMPT.format(
        platforms=", ".join(platforms),
        caption=repr(caption),
        planned=planned_time or "not specified",
        context=", ".join(f"{k}={v}" for k, v in context.items() if v is not None) or "not specified",
        media=(f"yes ({mime_type})" + (" plus a selected YouTube thumbnail" if thumbnail and thumbnail != media else ""))
              if media else "yes (selected YouTube thumbnail)" if thumbnail else "none - judge the caption only",
        model_scores="\n".join(f"- {p}: {s:.0f}" for p, s in model_scores.items()),
        factors="\n".join(f"- {f}" for f in model_factors) or "- none stood out",
        model_inputs="caption statistics/topics, timing, account context, and YouTube thumbnail features" if model_uses_thumbnail
                     else "caption statistics/topics, timing and account context; no visual inputs",
    )

    items: list[dict] = [{"type": "text", "text": prompt}]
    uploaded = []
    try:
        attachments = [(media, mime_type, "Draft media")]
        if thumbnail and thumbnail != media:
            attachments.append((thumbnail, thumbnail_mime_type or "image/jpeg", "Selected YouTube thumbnail"))
        inline_bytes = 0
        for content, content_type, label in attachments:
            if not content:
                continue
            items.append({"type": "text", "text": label})
            kind = "video" if content_type.startswith("video/") else "image"
            if inline_bytes + len(content) <= INLINE_LIMIT_BYTES:
                items.append({"type": kind, "data": base64.b64encode(content).decode("utf-8"), "mime_type": content_type})
                inline_bytes += len(content)
            else:
                remote = _upload(client, content, content_type)
                uploaded.append(remote)
                items.append({"type": kind, "uri": remote.uri, "mime_type": remote.mime_type})
        thinking = os.getenv("GEMINI_THINKING", DEFAULT_THINKING).strip()
        interaction = client.interactions.create(
            model=os.getenv("GEMINI_MODEL") or DEFAULT_MODEL,
            input=items,
            # Default "medium" thinking takes ~2 min on Flash; "low" keeps a live demo responsive
            **({"generation_config": {"thinking_level": thinking}} if thinking else {}),
            response_format={
                "type": "text",
                "mime_type": "application/json",
                "schema": _inline_refs(GeminiAnalysis.model_json_schema()),
            },
        )
        return GeminiAnalysis.model_validate_json(interaction.output_text)
    finally:
        for remote in uploaded:
            try:
                client.files.delete(name=remote.name)
            except Exception:
                pass
