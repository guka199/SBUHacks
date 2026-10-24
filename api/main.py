"""PostPilot backend. Run from the repo root: uvicorn api.main:app --reload"""

import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from api.routers import contribute, dashboard, data, ingest, predict, score, voice  # noqa: E402
from api.services.errors import ServiceError  # noqa: E402

app = FastAPI(title="PostPilot API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",") if origin.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ingest.router)
app.include_router(dashboard.router)
app.include_router(data.router)
app.include_router(predict.router)
app.include_router(score.router)
app.include_router(voice.router)
app.include_router(contribute.router)


@app.exception_handler(ServiceError)
async def service_error_handler(request, exc: ServiceError):
    return JSONResponse(status_code=exc.status_code, content={"detail": str(exc)})

# Generated audio (ElevenLabs) is served from here
STATIC_DIR = Path(__file__).parent / "static"
STATIC_DIR.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
