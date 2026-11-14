"""Answer a question: retrieve (by code or by agent tools), generate a cited answer, validate,
optionally audit. Used by the API (/api/ask), the CLI and the evaluation harness."""

import asyncio
import hashlib
import json
import time
from collections.abc import Awaitable, Callable
from dataclasses import asdict, dataclass, field, fields
from pathlib import Path
from typing import Any

from opentelemetry import trace
from pydantic_ai import Agent
from pydantic_ai.exceptions import UnexpectedModelBehavior, UsageLimitExceeded
from pydantic_ai.messages import ModelResponse
from pydantic_ai.models import Model
from pydantic_ai.usage import UsageLimits
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.answer_agent import PROMPT_VERSION, build_answer_agent, build_user_prompt
from app.agents.auditor import apply_audit, build_audit_prompt, build_auditor
from app.agents.llm import build_model
from app.agents.schemas import AnswerDeps, CitedAnswer, ContextChunk, Step
from app.core.config import Settings
from app.retrieval.base import ExperimentConfig, Retriever
from app.services.context import filter_api_allowed, list_documents, load_chunks, relabel

ChunkLoader = Callable[[list[str]], Awaitable[dict[str, ContextChunk]]]
DocLister = Callable[[], Awaitable[list[dict[str, Any]]]]


async def _no_docs() -> list[dict[str, Any]]:
    return []


REPO_ROOT = Path(__file__).resolve().parents[3]
LLM_CACHE_DIR = REPO_ROOT / "runs" / "cache" / "llm"
STANDARD_REQUEST_LIMIT = 4  # first call + up to 2 validator retries (+1 spare)
AGENTIC_REQUEST_LIMIT = 6  # PRD F4
AGENTIC_TIMEOUT_S = 30.0

ABSTAIN_TEXT = {
    "validation_failed": (
        "Maaf, sistem tidak dapat memastikan bahwa jawaban didukung langsung oleh pasal sumber, "
        "sehingga jawaban tidak ditampilkan. Coba rumuskan ulang pertanyaan atau rujuk dokumen aslinya."
    ),
    "timeout": "Maaf, pencarian memakan waktu terlalu lama. Silakan coba lagi atau persempit pertanyaan.",
    "usage_limit": (
        "Maaf, sistem tidak berhasil menemukan bukti yang cukup dalam batas pencarian yang tersedia."
    ),
}


@dataclass
class AskResult:
    answer: CitedAnswer
    steps: list[Step] = field(default_factory=list)
    context: list[ContextChunk] = field(default_factory=list)  # chunks the model could cite
    retrieved_ids: list[str] = field(default_factory=list)
    model: str = ""
    config_id: str = ""
    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: float = 0.0
    latency_ms: int = 0
    abstain_reason: str = ""
    audit_removed: list[str] = field(default_factory=list)
    trace_id: str | None = None
    cached: bool = False

    def to_json(self) -> dict[str, Any]:
        data: dict[str, Any] = {
            f.name: getattr(self, f.name)
            for f in fields(self)
            if f.name not in ("answer", "steps", "context")
        }
        data["answer"] = self.answer.model_dump()
        data["steps"] = [asdict(s) for s in self.steps]
        data["context"] = [c.model_dump() for c in self.context]
        out: dict[str, Any] = json.loads(json.dumps(data, default=str))
        return out

    @classmethod
    def from_json(cls, data: dict[str, Any]) -> "AskResult":
        return cls(
            answer=CitedAnswer.model_validate(data["answer"]),
            steps=[Step(**s) for s in data.get("steps", [])],
            context=[ContextChunk.model_validate(c) for c in data.get("context", [])],
            **{k: v for k, v in data.items() if k not in ("answer", "steps", "context")},
        )


def _abstain(reason: str) -> CitedAnswer:
    return CitedAnswer(answer=ABSTAIN_TEXT[reason], citations=[], abstained=True, confidence=0.0)


def _cost_of(messages: list[Any]) -> float:
    total = 0.0
    for m in messages:
        if isinstance(m, ModelResponse):
            try:
                total += float(m.cost().total_price)
            except Exception:  # price unknown for some models
                continue
    return total


def _cache_key(model_name: str, cfg: ExperimentConfig, prompt: str) -> str:
    raw = json.dumps([model_name, cfg.id, cfg.mode, PROMPT_VERSION, prompt], ensure_ascii=False)
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


def _trace_id() -> str | None:
    ctx = trace.get_current_span().get_span_context()
    return format(ctx.trace_id, "032x") if ctx.is_valid else None


async def answer_question(
    question: str,
    cfg: ExperimentConfig,
    *,
    session: AsyncSession | None,
    settings: Settings,
    chunk_loader: ChunkLoader | None = None,
    doc_lister: DocLister | None = None,
    retriever: Retriever | None = None,
    model: Model | str | None = None,
    audit: bool = False,
    auditor_model: Model | str | None = None,
    use_cache: bool = False,
    on_step: Callable[[Step], None] | None = None,
    timeout_s: float = AGENTIC_TIMEOUT_S,
) -> AskResult:
    """Run one question through config `cfg` (loaders default to DB lookups via `session`)."""
    started = time.perf_counter()
    if chunk_loader is None:
        assert session is not None, "session or chunk_loader is required"
        chunk_loader = lambda ids: load_chunks(session, ids)  # noqa: E731
    if doc_lister is None and session is not None:
        doc_lister = lambda: list_documents(session)  # noqa: E731
    agentic = cfg.mode == "agentic"
    closed_book = cfg.retriever == "none" and not agentic
    model_obj = model if model is not None else build_model(settings)
    model_name = getattr(model_obj, "model_name", str(model_obj))

    deps = AnswerDeps(closed_book=closed_book, top_k=cfg.top_k, on_step=on_step)
    retrieved_ids: list[str] = []
    prompt = f"PERTANYAAN: {question}"

    if agentic:
        if retriever is None:
            raise ValueError("agentic mode needs a retriever for search_regulations")
        deps.retriever = retriever
        deps.chunk_loader = chunk_loader
        deps.doc_lister = doc_lister or _no_docs
    elif not closed_book:
        if retriever is None:
            raise ValueError(f"config {cfg.id} needs a retriever")
        hits = await retriever.retrieve(question, cfg.top_k)
        retrieved_ids = [h.chunk_id for h in hits]
        loaded = await chunk_loader(retrieved_ids)
        ordered = [loaded[i] for i in retrieved_ids if i in loaded]
        context = relabel(filter_api_allowed(ordered))  # privacy rule BEFORE building the prompt
        deps.context = {c.chunk_id: c for c in context}
        prompt = build_user_prompt(question, context)

    key = _cache_key(model_name, cfg, prompt)
    cache_file = LLM_CACHE_DIR / f"{key}.json"
    if use_cache and cache_file.exists():
        cached = AskResult.from_json(json.loads(cache_file.read_text(encoding="utf-8")))
        cached.cached = True
        return cached

    agent: Agent[AnswerDeps, CitedAnswer] = build_answer_agent(
        model_obj, agentic=agentic, closed_book=closed_book
    )
    limits = UsageLimits(request_limit=AGENTIC_REQUEST_LIMIT if agentic else STANDARD_REQUEST_LIMIT)
    tracer = trace.get_tracer("k2rag")
    out: CitedAnswer
    reason = ""
    in_tok = out_tok = 0
    cost = 0.0
    with tracer.start_as_current_span("k2rag.ask") as span:
        span.set_attribute("k2.config", cfg.id)
        trace_id = _trace_id()
        try:
            async with asyncio.timeout(timeout_s if agentic else None):
                run = await agent.run(
                    prompt,
                    deps=deps,
                    usage_limits=limits,
                    model_settings={"temperature": 0.0},
                )
            out = run.output
            in_tok, out_tok = run.usage.input_tokens, run.usage.output_tokens
            cost = _cost_of(run.all_messages())
            if out.abstained:
                reason = "insufficient_context"
        except UnexpectedModelBehavior:
            out, reason = _abstain("validation_failed"), "validation_failed"
        except UsageLimitExceeded:
            out, reason = _abstain("usage_limit"), "usage_limit"
        except TimeoutError:
            out, reason = _abstain("timeout"), "timeout"

        removed: list[str] = []
        if audit and not out.abstained and deps.context:
            auditor = build_auditor(auditor_model or model_obj)
            audit_run = await auditor.run(build_audit_prompt(out, deps.context))
            out, removed = apply_audit(out, audit_run.output)
            in_tok += audit_run.usage.input_tokens
            out_tok += audit_run.usage.output_tokens
            cost += _cost_of(audit_run.all_messages())

    # Only chunks that were really available to the model; agentic labels follow discovery order.
    context_list = sorted(deps.context.values(), key=lambda c: c.label)
    result = AskResult(
        answer=out,
        steps=deps.steps,
        context=context_list,
        retrieved_ids=retrieved_ids or [c.chunk_id for c in context_list],
        model=model_name,
        config_id=cfg.id,
        input_tokens=in_tok,
        output_tokens=out_tok,
        cost_usd=cost,
        latency_ms=int((time.perf_counter() - started) * 1000),
        abstain_reason=reason,
        audit_removed=removed,
        trace_id=trace_id,
    )
    if use_cache and not reason == "timeout":
        cache_file.parent.mkdir(parents=True, exist_ok=True)
        cache_file.write_text(json.dumps(result.to_json(), ensure_ascii=False), encoding="utf-8")
    return result
