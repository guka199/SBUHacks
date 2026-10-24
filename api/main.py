"""PostPilot backend. Run from the repo root: uvicorn api.main:app --reload"""

import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

load_dotenv()

from api.routers import contribute, dashboard, ingest, predict, score, voice  # noqa: E402

app = FastAPI(title="PostPilot API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ingest.router)
app.include_router(dashboard.router)
app.include_router(predict.router)
app.include_router(score.router)
app.include_router(voice.router)
app.include_router(contribute.router)

# Generated audio (ElevenLabs) is served from here
STATIC_DIR = Path(__file__).parent / "static"
STATIC_DIR.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
