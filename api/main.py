"""PostPilot backend. Run from the repo root: uvicorn api.main:app --reload"""

import os
import asyncio
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from contextlib import asynccontextmanager  # noqa: E402

from api.routers import accounts, analyses, auth, post_analyses, contribute, dashboard, data, drafts, ideas, ingest, predict, score, social_accounts, voice  # noqa: E402
from api.services import db  # noqa: E402
from api.services.errors import ServiceError  # noqa: E402


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init()  # create tables (Snowflake if configured, else data/local.db)
    stop = asyncio.Event()
    worker = None
    if os.getenv('SOCIAL_WORKER_ENABLED', 'false').lower() == 'true':
        if int(os.getenv('WEB_CONCURRENCY', '1')) != 1:
            raise RuntimeError('Social imports require one API worker; see docs/social-data-integration.md')
        from api.services.social_jobs import run
        worker = asyncio.create_task(run(stop), name='social-refresh-poller')
    try:
        yield
    finally:
        stop.set()
        if worker:
            worker.cancel()
            try:
                await worker
            except asyncio.CancelledError:
                pass
        db.close()


app = FastAPI(title="PostPilot API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",") if origin.strip()],
    allow_credentials=True,  # the sign-in cookie
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(analyses.router)
app.include_router(ideas.router)
app.include_router(post_analyses.router)
app.include_router(social_accounts.router)
app.include_router(accounts.router)
app.include_router(drafts.router)
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
