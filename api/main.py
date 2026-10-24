"""PostPilot backend. Run from the repo root: uvicorn api.main:app --reload"""

import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

load_dotenv()

from contextlib import asynccontextmanager  # noqa: E402

from api.routers import accounts, auth, contribute, dashboard, drafts, ingest, predict, score, voice  # noqa: E402
from api.services import db  # noqa: E402


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init()  # create tables (Snowflake if configured, else data/local.db)
    yield


app = FastAPI(title="PostPilot API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000").split(","),
    allow_credentials=True,  # the sign-in cookie
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(accounts.router)
app.include_router(drafts.router)
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
