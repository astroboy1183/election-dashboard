import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware


# ───── Auto-load env from project-root .env ─────
# Avoids needing `export ANTHROPIC_API_KEY=...` in every shell. Only sets
# variables that aren't already in the environment, so existing exports win.
def _load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key, value = key.strip(), value.strip().strip('"').strip("'")
        if key and value and key not in os.environ:
            os.environ[key] = value


_PROJECT_ROOT = Path(__file__).resolve().parent.parent
_load_env_file(_PROJECT_ROOT / ".env")

from backend.routes import overview, constituencies, swing, candidates, loksabha, geojson, insights, ai, kpis  # noqa: E402
# `ai` provides ONE locally-bounded endpoint: POST /api/ai/ask. The model is
# given tool access to this dashboard's data only — no web search, no external
# lookup. Without ANTHROPIC_API_KEY the endpoint returns 503 and the rest of
# the dashboard works normally.

app = FastAPI(title="Election Dashboard API", version="1.0")

# Gzip-compress responses >1 KB. Candidate-list and geojson payloads shrink
# 60-80%, which matters a lot on the Render free tier's 0.1 CPU + India RTTs.
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Comma-separated list of allowed origins. Dev defaults to localhost:5173;
# in production set CORS_ORIGINS to your Vercel URL (e.g. https://myapp.vercel.app).
_cors_origins = [
    o.strip() for o in os.environ.get(
        "CORS_ORIGINS",
        "http://localhost:5173",
    ).split(",") if o.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(overview.router,       prefix="/api", tags=["overview"])
app.include_router(constituencies.router, prefix="/api", tags=["constituencies"])
app.include_router(swing.router,          prefix="/api", tags=["swing"])
app.include_router(candidates.router,     prefix="/api", tags=["candidates"])
app.include_router(loksabha.router,       prefix="/api", tags=["loksabha"])
app.include_router(geojson.router,        prefix="/api", tags=["geojson"])
app.include_router(insights.router,       prefix="/api", tags=["insights"])
app.include_router(kpis.router,           prefix="/api", tags=["kpis"])
app.include_router(ai.router,             prefix="/api", tags=["ai"])


@app.get("/")
def root():
    return {"status": "ok", "message": "Election Dashboard API"}
