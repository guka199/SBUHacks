# Backend (FastAPI + trained models) for Hugging Face Spaces, Railway, Render or any container host.
# Only api/, shared/ and models/ are needed at runtime; the frontend is deployed separately (Vercel, frontend/).
FROM python:3.14-slim

# CatBoost / XGBoost need the OpenMP runtime
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 && rm -rf /var/lib/apt/lists/*

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app

COPY api/requirements.txt api/constraints.txt api/
RUN pip install -r api/requirements.txt -c api/constraints.txt

# Hugging Face Spaces runs containers as user 1000 (not root): give it the app folder and a home for caches.
RUN useradd -m -u 1000 user
COPY --chown=user shared/ shared/
COPY --chown=user models/ models/
COPY --chown=user api/ api/
RUN mkdir -p api/static && chown -R user /app
USER user
ENV HOME=/home/user

# One worker: the social import poller must run in exactly one process. Hosts that set $PORT (Railway, Render) win.
CMD ["sh", "-c", "uvicorn api.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1 --proxy-headers --forwarded-allow-ips='*'"]
