"""POST /api/ask -> Server-Sent Events: agent_steps, token, citations, done (or error)."""

import asyncio
import json
import re
from collections.abc import AsyncIterator
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.schemas import Step
from app.api.security import rate_limited
from app.core.config import Settings, get_settings
from app.db.session import SessionLocal, get_session
from app.retrieval.base import ExperimentConfig, Retriever, load_config
from app.retrieval.factory import CorpusCache, build_retriever
from app.services.ask_service import AskResult, answer_question
from app.services.query_log import log_query, over_daily_limit

router = APIRouter(prefix="/api", tags=["ask"])

PUBLIC_STANDARD = {"B1", "B2", "M1"}
TOKEN_CHARS = 24


class AskRequest(BaseModel):
    question: str = Field(min_length=3, max_length=1000)
    mode: Literal["standard", "agentic"] = "standard"
    config_id: str | None = Field(default=None, description="B1, B2 or M1 (standard mode only)")


def text_pieces(text: str, size: int = TOKEN_CHARS) -> list[str]:
    """Split on word boundaries into ~size-char pieces; "".join(pieces) == text."""
    pieces: list[str] = []
    cur = ""
    for word in re.findall(r"\S+\s*|\s+", text):
        if cur and len(cur) + len(word) > size:
            pieces.append(cur)
            cur = ""
        cur += word
    if cur:
        pieces.append(cur)
    return pieces


def sse(event: str, data: Any) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def confidence_badge(res: AskResult) -> str:
    """UI badge: supported | limited | not_found."""
    if res.answer.abstained:
        return "not_found" if res.abstain_reason in ("insufficient_context", "") else "limited"
    return "supported" if res.answer.confidence >= 0.5 else "limited"


def citation_payload(res: AskResult) -> list[dict[str, Any]]:
    by_id = {c.chunk_id: c for c in res.context}
    out = []
    for c in res.answer.citations:
        chunk = by_id.get(c.chunk_id)
        out.append(
            {
                "label": c.label,
                "chunk_id": c.chunk_id,
                "quote": c.quote,
                "ref": chunk.ref if chunk else c.chunk_id,
                "doc_id": chunk.doc_id if chunk else None,
                "doc_title": chunk.doc_title if chunk else None,
                "page_start": chunk.page_start if chunk else None,
            }
        )
    return out


def step_payload(step: Step) -> dict[str, Any]:
    return {"tool": step.tool, "args": step.args, "found": step.found, "summary": step.summary}


def resolve_config(body: AskRequest) -> ExperimentConfig:
    if body.mode == "agentic":
        return load_config("M3")
    cid = body.config_id or "M1"
    if cid not in PUBLIC_STANDARD:
        raise HTTPException(
            422,
            f"config_id harus salah satu {sorted(PUBLIC_STANDARD)}",
        )
    return load_config(cid)


async def _retriever_for(
    cfg: ExperimentConfig, session: AsyncSession, settings: Settings, cache: CorpusCache
) -> Retriever:
    base = load_config("M1") if cfg.mode == "agentic" else cfg  # agent tools use hybrid search
    return await build_retriever(base, session, settings, cache)


async def ask_events(
    body: AskRequest, cfg: ExperimentConfig, settings: Settings, cache: CorpusCache
) -> AsyncIterator[str]:
    """Own DB session: dependencies with `yield` would be closed before a streamed body is read."""
    queue: asyncio.Queue[Step] = asyncio.Queue()
    async with SessionLocal() as session:
        try:
            retriever = await _retriever_for(cfg, session, settings, cache)
            task = asyncio.create_task(
                answer_question(
                    body.question,
                    cfg,
                    session=session,
                    settings=settings,
                    retriever=retriever,
                    audit=cfg.mode == "agentic" and bool(settings.judge_model),
                    auditor_model=None,
                    on_step=queue.put_nowait,
                )
            )
            while not task.done():
                try:
                    step = await asyncio.wait_for(queue.get(), timeout=0.2)
                    yield sse("agent_steps", step_payload(step))
                except TimeoutError:
                    continue
            while not queue.empty():
                yield sse("agent_steps", step_payload(queue.get_nowait()))
            res = task.result()
        except Exception as exc:  # surfaced to the client as an error event, never a half response
            yield sse(
                "error",
                {"message": "Terjadi galat saat memproses pertanyaan.", "type": type(exc).__name__},
            )
            return

        for piece in text_pieces(res.answer.answer):
            yield sse("token", {"text": piece})
        citations = citation_payload(res)
        yield sse("citations", citations)
        query_id = await log_query(
            session,
            question=body.question,
            mode=body.mode,
            config_id=cfg.id,
            answer=res.answer.model_dump(),
            citations=citations,
            latency_ms=res.latency_ms,
            tokens=res.input_tokens + res.output_tokens,
            cost_usd=res.cost_usd,
            model=res.model,
            trace_id=res.trace_id,
        )
        yield sse(
            "done",
            {
                "query_id": query_id,
                "abstained": res.answer.abstained,
                "abstain_reason": res.abstain_reason,
                "confidence": res.answer.confidence,
                "badge": confidence_badge(res),
                "latency_ms": res.latency_ms,
                "config": cfg.id,
            },
        )


@router.post("/ask", dependencies=[Depends(rate_limited("ask_limiter"))])
async def ask(
    body: AskRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> StreamingResponse:
    cfg = resolve_config(body)
    if not settings.llm_model or not settings.openrouter_api_key:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Layanan LLM belum dikonfigurasi.")
    if await over_daily_limit(session, settings.daily_cost_limit_usd):
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Batas biaya harian layanan telah tercapai. Coba lagi besok.",
        )
    cache: CorpusCache = request.app.state.corpus_cache
    return StreamingResponse(
        ask_events(body, cfg, settings, cache),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
