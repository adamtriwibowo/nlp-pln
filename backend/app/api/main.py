import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import routes_ask, routes_auth, routes_content, routes_feedback
from app.api.security import SlidingWindowLimiter
from app.core.config import Settings, get_settings
from app.core.telemetry import setup_telemetry
from app.db.session import get_session
from app.retrieval.factory import CorpusCache

LLM_CHECK_TTL_S = 60.0
_llm_check: tuple[float, str] = (0.0, "unconfigured")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    setup_telemetry(settings)
    app.state.corpus_cache = CorpusCache()
    app.state.ask_limiter = SlidingWindowLimiter(settings.ask_rate_per_min)
    app.state.login_limiter = SlidingWindowLimiter(settings.login_rate_per_min)
    yield


app = FastAPI(title="K2-RAG API", version="0.3.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in get_settings().cors_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)
for r in (routes_ask.router, routes_auth.router, routes_content.router, routes_feedback.router):
    app.include_router(r)


async def check_llm(settings: Settings) -> str:
    """Cheap key validity check against OpenRouter, cached for 60 s (no tokens consumed)."""
    global _llm_check
    if not settings.openrouter_api_key or not settings.llm_model:
        return "unconfigured"
    now = time.monotonic()
    if now - _llm_check[0] < LLM_CHECK_TTL_S:
        return _llm_check[1]
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(
                "https://openrouter.ai/api/v1/auth/key",
                headers={"Authorization": f"Bearer {settings.openrouter_api_key}"},
            )
        state = "ok" if r.status_code == 200 else "error"
    except httpx.HTTPError:
        state = "error"
    _llm_check = (now, state)
    return state


@app.get("/api/health")
async def health(
    session: AsyncSession = Depends(get_session), settings: Settings = Depends(get_settings)
) -> dict[str, str]:
    """DB failure -> 500 (container unhealthy). LLM trouble only reports 'degraded'."""
    await session.execute(text("SELECT 1"))
    llm = await check_llm(settings)
    return {"status": "ok" if llm in ("ok", "unconfigured") else "degraded", "db": "ok", "llm": llm}
