"""Admin 'lab': candidate search for gold ids, question playground, read-only config summary,
and background evaluation jobs (dev split only; the frozen test split stays CLI-only)."""

import time
from pathlib import Path
from typing import Any

import yaml
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.answer_agent import PROMPT_VERSION, quote_in_text
from app.core.config import Settings
from app.db.models import Chunk, Document, Embedding
from app.eval.generation import JUDGE_PROMPT_VERSION, assert_judge_differs
from app.retrieval.base import ExperimentConfig, Retriever, load_config
from app.retrieval.factory import CorpusCache, build_retriever
from app.services.admin_service import Job
from app.services.ask_service import answer_question
from app.services.context import load_chunks
from app.services.qa_store import QAError, QAStore
from app.services.query_log import daily_cost_usd, log_query

CONFIGS_DIR = Path(__file__).resolve().parents[3] / "configs"
RANKING_DEPTH = 10
SNIPPET_CHARS = 280
# Rough per-question cost used only for the confirmation prompt (generator + 3 judge calls).
EST_COST_PER_Q = {"standard": 0.0025, "agentic": 0.007}


class LabError(ValueError):
    """User-facing problem (bad config, missing key...). `status` is the HTTP code to use."""

    def __init__(self, message: str, status: int = 422) -> None:
        super().__init__(message)
        self.status = status


def has_retriever(cfg: ExperimentConfig) -> bool:
    return cfg.retriever in ("bm25", "dense", "hybrid", "hybrid_rerank")


async def _retriever(
    cfg: ExperimentConfig, session: AsyncSession, settings: Settings, cache: CorpusCache
) -> Retriever:
    try:
        return await build_retriever(cfg, session, settings, cache)
    except RuntimeError as exc:  # e.g. reranker needs sentence-transformers / no embeddings yet
        raise LabError(str(exc)) from exc


def _config(config_id: str) -> ExperimentConfig:
    try:
        return load_config(config_id)
    except FileNotFoundError as exc:
        raise LabError(f"Konfigurasi '{config_id}' tidak ada.", 404) from exc


# ---- candidate search -------------------------------------------------------------------


async def candidates(
    session: AsyncSession, settings: Settings, cache: CorpusCache, query: str, k: int = 8
) -> list[dict[str, Any]]:
    """Hybrid search (M1) to help the team pick gold_chunk_ids. Not a judgement of relevance."""
    cfg = load_config("M1")
    retriever = await _retriever(cfg, session, settings, cache)
    hits = await retriever.retrieve(query, k)
    chunks = await load_chunks(session, [h.chunk_id for h in hits])
    return [
        {
            "rank": h.rank,
            "chunk_id": h.chunk_id,
            "ref": chunks[h.chunk_id].ref,
            "doc_title": chunks[h.chunk_id].doc_title,
            "page_start": chunks[h.chunk_id].page_start,
            "score": round(h.score, 4),
            "snippet": chunks[h.chunk_id].text[:SNIPPET_CHARS],
        }
        for h in hits
        if h.chunk_id in chunks
    ]


# ---- playground -------------------------------------------------------------------------


async def playground(
    session: AsyncSession,
    settings: Settings,
    cache: CorpusCache,
    *,
    question: str,
    config_id: str,
    generate: bool,
    gold_ids: list[str],
    audit: bool = False,
) -> dict[str, Any]:
    cfg = _config(config_id)
    needs_llm = generate or cfg.retriever in ("none", "agentic")
    if needs_llm and not (settings.llm_model and settings.openrouter_api_key):
        raise LabError("Layanan LLM belum dikonfigurasi (LLM_MODEL / OPENROUTER_API_KEY).", 503)

    # Ranking: the configured retriever; the agentic variant shows hybrid (M1) as a reference.
    ref_cfg = load_config("M1") if cfg.retriever == "agentic" else cfg
    retriever: Retriever | None = None
    ranking: list[dict[str, Any]] = []
    retrieval_ms = 0
    if has_retriever(ref_cfg):
        retriever = await _retriever(ref_cfg, session, settings, cache)
        t0 = time.perf_counter()
        hits = await retriever.retrieve(question, RANKING_DEPTH)
        retrieval_ms = int((time.perf_counter() - t0) * 1000)
        loaded = await load_chunks(session, [h.chunk_id for h in hits])
        gold = set(gold_ids)
        for h in hits:
            c = loaded.get(h.chunk_id)
            if c is None:
                continue
            ranking.append(
                {
                    "rank": h.rank,
                    "chunk_id": h.chunk_id,
                    "ref": c.ref,
                    "doc_title": c.doc_title,
                    "page_start": c.page_start,
                    "score": round(h.score, 5),
                    "api_allowed": c.api_allowed,
                    "is_gold": h.chunk_id in gold,
                    "snippet": c.text[:SNIPPET_CHARS],
                }
            )

    gold_result: dict[str, Any] | None = None
    if gold_ids:
        positions = {r["chunk_id"]: r["rank"] for r in ranking}
        found = {g: positions.get(g) for g in gold_ids}
        ranks = [r for r in found.values() if r is not None]
        gold_result = {
            "ids": gold_ids,
            "found": found,
            "best_rank": min(ranks) if ranks else None,
            "depth": RANKING_DEPTH,
        }

    answer: dict[str, Any] | None = None
    usage: dict[str, Any] | None = None
    steps: list[dict[str, Any]] = []
    if needs_llm:
        res = await answer_question(
            question,
            cfg,
            session=session,
            settings=settings,
            retriever=retriever,
            audit=audit and cfg.mode == "agentic",
        )
        by_id = {c.chunk_id: c for c in res.context}
        answer = {
            "answer": res.answer.answer,
            "abstained": res.answer.abstained,
            "confidence": res.answer.confidence,
            "abstain_reason": res.abstain_reason,
            "audit_removed": res.audit_removed,
            "citations": [
                {
                    "label": c.label,
                    "chunk_id": c.chunk_id,
                    "quote": c.quote,
                    "ref": by_id[c.chunk_id].ref if c.chunk_id in by_id else c.chunk_id,
                    "in_context": c.chunk_id in by_id,
                    "quote_verified": c.chunk_id in by_id
                    and quote_in_text(c.quote, by_id[c.chunk_id].text),
                    "is_gold": c.chunk_id in set(gold_ids),
                }
                for c in res.answer.citations
            ],
        }
        steps = [
            {"tool": s.tool, "args": s.args, "found": s.found, "summary": s.summary}
            for s in res.steps
        ]
        usage = {
            "model": res.model,
            "input_tokens": res.input_tokens,
            "output_tokens": res.output_tokens,
            "cost_usd": round(res.cost_usd, 6),
            "latency_ms": res.latency_ms,
        }
        await log_query(  # counted by the daily cost limit; tagged so it is easy to filter out
            session,
            question=question,
            mode="playground",
            config_id=cfg.id,
            answer=res.answer.model_dump(),
            citations=[c.model_dump() for c in res.answer.citations],
            latency_ms=res.latency_ms,
            tokens=res.input_tokens + res.output_tokens,
            cost_usd=res.cost_usd,
            model=res.model,
            trace_id=res.trace_id,
        )
    return {
        "question": question,
        "config": cfg.id,
        "generated": needs_llm,
        "retrieval_ms": retrieval_ms,
        "ranking": ranking,
        "gold": gold_result,
        "answer": answer,
        "steps": steps,
        "usage": usage,
    }


# ---- read-only configuration ------------------------------------------------------------


def load_all_configs() -> list[dict[str, Any]]:
    out = []
    for path in sorted(CONFIGS_DIR.glob("*.yaml")):
        out.append(
            ExperimentConfig.model_validate(yaml.safe_load(path.read_text("utf-8"))).model_dump()
        )
    return out


async def config_summary(session: AsyncSession, settings: Settings) -> dict[str, Any]:
    versions = (await session.execute(select(Chunk.corpus_version).distinct())).scalars().all()
    n_chunks = (await session.execute(select(func.count()).select_from(Chunk))).scalar() or 0
    n_docs = (
        await session.execute(
            select(func.count()).select_from(Document).where(Document.index.is_(True))
        )
    ).scalar() or 0
    emb = (
        await session.execute(select(Embedding.model, func.count()).group_by(Embedding.model))
    ).all()
    used = await daily_cost_usd(session)
    warnings: list[str] = []
    if not settings.llm_model or not settings.openrouter_api_key:
        warnings.append("LLM belum dikonfigurasi (LLM_MODEL / OPENROUTER_API_KEY).")
    try:
        assert_judge_differs(settings)
    except Exception as exc:
        warnings.append(f"Evaluasi generasi tidak bisa jalan: {exc}.")
    if len(versions) > 1:
        warnings.append("Korpus memuat lebih dari satu corpus_version; jalankan re-index.")
    if settings.embedding_model and not any(m == settings.embedding_model for m, _ in emb):
        warnings.append(f"Belum ada embedding untuk model {settings.embedding_model}.")
    return {
        "configs": load_all_configs(),
        "models": {
            "llm_model": settings.llm_model,
            "judge_model": settings.judge_model,
            "embedding_provider": settings.embedding_provider,
            "embedding_model": settings.embedding_model,
            "reranker_model": ExperimentConfig(id="x", retriever="none").reranker_model,
        },
        "secrets_set": {  # booleans only: values are never exposed
            "openrouter_api_key": bool(settings.openrouter_api_key),
            "admin_token": bool(settings.admin_token),
            "review_token": bool(settings.review_token),
            "jwt_secret": bool(settings.jwt_secret),
        },
        "limits": {
            "daily_cost_limit_usd": settings.daily_cost_limit_usd,
            "daily_cost_used_usd": round(used, 6),
            "ask_rate_per_min": settings.ask_rate_per_min,
            "login_rate_per_min": settings.login_rate_per_min,
        },
        "corpus": {
            "versions": list(versions),
            "chunks": int(n_chunks),
            "documents_indexed": int(n_docs),
            "embeddings": [{"model": m, "count": int(c)} for m, c in emb],
        },
        "prompts": {"answer": PROMPT_VERSION, "judge": JUDGE_PROMPT_VERSION},
        "tracing_enabled": bool(settings.logfire_token or settings.otel_exporter_otlp_endpoint),
        "warnings": warnings,
    }


# ---- evaluation jobs (dev split only) ---------------------------------------------------


def _eval_items(store: QAStore, split: str) -> list[Any]:
    if split != "dev":
        raise LabError("Split test dibekukan dan hanya dijalankan lewat CLI (`k2 eval --final`).")
    items = [i for i in store.load() if i.split == split]
    if not items:
        raise LabError("Belum ada pertanyaan di split dev. Tambahkan di tab Dataset.")
    return items


async def eval_estimate(
    session: AsyncSession, settings: Settings, store: QAStore, config_id: str, kind: str, split: str
) -> dict[str, Any]:
    cfg = _config(config_id)
    items = _eval_items(store, split)
    if kind == "retrieval":
        if not has_retriever(cfg):
            raise LabError(
                f"{config_id} tidak punya retrieval mandiri (gunakan evaluasi generasi)."
            )
        return {
            "n_questions": len(items),
            "est_cost_usd": 0.0,
            "note": "Hanya embedding query; hampir gratis.",
        }
    if kind != "generation":
        raise LabError("kind harus retrieval atau generation.")
    try:
        assert_judge_differs(settings)
    except Exception as exc:
        raise LabError(str(exc)) from exc
    if not (settings.llm_model and settings.openrouter_api_key):
        raise LabError("Layanan LLM belum dikonfigurasi.", 503)
    est = round(len(items) * EST_COST_PER_Q[cfg.mode], 4)
    used = await daily_cost_usd(session)
    if settings.daily_cost_limit_usd > 0 and used + est > settings.daily_cost_limit_usd:
        raise LabError(
            f"Perkiraan biaya ${est} melebihi sisa batas harian "
            f"(${settings.daily_cost_limit_usd - used:.4f}).",
            429,
        )
    return {
        "n_questions": len(items),
        "est_cost_usd": est,
        "note": "Perkiraan kasar (generator + 3 panggilan juri); biaya sebenarnya tercatat di run.",
    }


async def run_eval_job(
    job: Job,
    settings: Settings,
    cache: CorpusCache,
    store: QAStore,
    config_id: str,
    kind: str,
    split: str,
) -> None:
    from app.db.session import SessionLocal
    from app.eval.generation import run_generation_eval
    from app.eval.retrieval_runner import run_retrieval_eval

    cfg = _config(config_id)
    items = _eval_items(store, split)
    async with SessionLocal() as session:
        known = set((await session.execute(select(Chunk.chunk_id))).scalars().all())
        missing = [g for i in items for g in i.gold_chunk_ids if g not in known]
        if missing:
            raise QAError(f"gold_chunk_ids tidak ada di korpus: {sorted(set(missing))[:5]}")
        job.log.append(f"Menjalankan {kind} {config_id} pada {len(items)} pertanyaan ({split})...")
        base = load_config("M1") if cfg.mode == "agentic" else cfg
        retriever = (
            await build_retriever(base, session, settings, cache) if has_retriever(base) else None
        )
        if kind == "retrieval":
            assert retriever is not None
            run = await run_retrieval_eval(cfg, retriever, items, session, settings, split)
            metrics = run.metrics.get("all", {})
            job.log.append(
                f"Selesai: Recall@5={metrics.get('recall@5', 0):.3f} MRR={metrics.get('mrr', 0):.3f} "
                f"(n={int(metrics.get('n', 0))}). Hasil: {run.directory.name}"
            )
        else:
            directory, m = await run_generation_eval(
                cfg, items, session=session, settings=settings, split=split, retriever=retriever
            )
            a = m.get("all", {})
            job.log.append(
                f"Selesai: faithfulness={a.get('faithfulness', 0):.3f} "
                f"citation={a.get('citation_correctness', 0):.3f} "
                f"abstain={a.get('abstain_accuracy', 0):.3f}. Hasil: {directory.name}"
            )
