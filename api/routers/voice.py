"""ElevenLabs features: weekly spoken briefing and hook tester."""

from fastapi import APIRouter

from api.schemas import AudioResponse, BriefingRequest, HooksRequest
from api.services import elevenlabs, snowflake

router = APIRouter(prefix="/voice", tags=["voice"])


@router.post("/briefing", response_model=AudioResponse)
def weekly_briefing(req: BriefingRequest) -> AudioResponse:
    df = snowflake.query_df(
        """
        SELECT platform, COUNT(*) AS posts, SUM(views) AS views
        FROM POSTS
        WHERE user_id = %s AND posted_at >= DATEADD(day, -7, CURRENT_TIMESTAMP())
        GROUP BY platform
        ORDER BY views DESC
        """,
        (req.user_id,),
    )
    if df.empty:
        script = "No new posts this week. Post something and I'll tell you how it did!"
    else:
        lines = [f"On {r['platform']}, {int(r['posts'])} posts got {int(r['views'] or 0):,} views." for r in df.to_dict("records")]
        script = "Here's your PostPilot weekly briefing. " + " ".join(lines)
    # TODO: write a richer script with Cortex COMPLETE (what improved, what to try next)
    return AudioResponse(audio_urls=[elevenlabs.text_to_speech(script)])


@router.post("/hooks", response_model=AudioResponse)
def hook_tester(req: HooksRequest) -> AudioResponse:
    voice_ids = req.voice_ids or [None]  # None = default voice from .env
    return AudioResponse(audio_urls=[elevenlabs.text_to_speech(req.hook_text, v) for v in voice_ids])
