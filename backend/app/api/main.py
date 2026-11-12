from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.telemetry import setup_telemetry
from app.db.session import get_session


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    setup_telemetry(get_settings())
    yield


app = FastAPI(title="K2-RAG API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in get_settings().cors_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.get("/api/health")
async def health(session: AsyncSession = Depends(get_session)) -> dict[str, str]:
    """Health check. Phase 0 checks the database only; LLM check arrives with /api/ask."""
    await session.execute(text("SELECT 1"))
    return {"status": "ok", "db": "ok"}
