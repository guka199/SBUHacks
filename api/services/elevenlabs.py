"""ElevenLabs text-to-speech via the REST API."""

import os
import uuid
from pathlib import Path

import httpx

AUDIO_DIR = Path(__file__).resolve().parents[1] / "static" / "audio"
AUDIO_DIR.mkdir(parents=True, exist_ok=True)


def text_to_speech(text: str, voice_id: str | None = None) -> str:
    """Generate speech, save it as an mp3, and return its path relative to the API (/static/...)."""
    voice_id = voice_id or os.environ["ELEVENLABS_VOICE_ID"]
    resp = httpx.post(
        f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}",
        headers={"xi-api-key": os.environ["ELEVENLABS_API_KEY"], "accept": "audio/mpeg"},
        json={"text": text, "model_id": "eleven_multilingual_v2"},
        timeout=60,
    )
    resp.raise_for_status()
    name = f"{uuid.uuid4().hex}.mp3"
    (AUDIO_DIR / name).write_bytes(resp.content)
    return f"/static/audio/{name}"
