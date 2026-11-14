"""Persist asked questions (anonymous) and enforce the daily cost limit."""

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Query


async def daily_cost_usd(session: AsyncSession) -> float:
    start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    total = (
        await session.execute(
            select(func.coalesce(func.sum(Query.cost_usd), 0.0)).where(Query.created_at >= start)
        )
    ).scalar()
    return float(total or 0.0)


async def over_daily_limit(session: AsyncSession, limit_usd: float) -> bool:
    return limit_usd > 0 and await daily_cost_usd(session) >= limit_usd


async def log_query(
    session: AsyncSession,
    *,
    question: str,
    mode: str,
    config_id: str,
    answer: dict[str, Any],
    citations: list[dict[str, Any]],
    latency_ms: int,
    tokens: int,
    cost_usd: float,
    model: str,
    trace_id: str | None,
) -> int:
    """Insert one row. No IP/user data is stored (questions are anonymous)."""
    row = Query(
        question=question,
        mode=mode,
        config_id=config_id,
        answer=answer,
        citations=citations,
        latency_ms=latency_ms,
        tokens=tokens,
        cost_usd=cost_usd,
        model=model,
        trace_id=trace_id,
    )
    session.add(row)
    await session.commit()
    return int(row.id)
