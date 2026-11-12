"""Retrieval evaluation run: metrics + persistence (DB tables and runs/<timestamp>_<config>/)."""

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.db.models import Chunk, EvalResult, EvalRun
from app.eval.qa_schema import QAItem
from app.eval.retrieval_metrics import KS, QuestionScore, aggregate, score_question
from app.retrieval.base import ExperimentConfig, Retriever

REPO_ROOT = Path(__file__).resolve().parents[3]
RUNS_DIR = REPO_ROOT / "runs"


class RetrievalRun:
    def __init__(
        self,
        run_id: str,
        directory: Path,
        metrics: dict[str, dict[str, float]],
        per_question: list[dict[str, Any]],
    ) -> None:
        self.run_id, self.directory, self.metrics, self.per_question = (
            run_id,
            directory,
            metrics,
            per_question,
        )


async def run_retrieval_eval(
    cfg: ExperimentConfig,
    retriever: Retriever,
    items: list[QAItem],
    session: AsyncSession,
    settings: Settings,
    split: str,
    runs_dir: Path = RUNS_DIR,
) -> RetrievalRun:
    depth = max(KS)
    per_q: list[dict[str, Any]] = []
    scores: list[QuestionScore] = []
    for it in items:
        hits = await retriever.retrieve(it.question, depth)
        ids = [h.chunk_id for h in hits]
        row: dict[str, Any] = {
            "question_id": it.id,
            "type": it.type,
            "question": it.question,
            "gold_chunk_ids": it.gold_chunk_ids,
            "retrieved": [{"chunk_id": h.chunk_id, "score": round(h.score, 6)} for h in hits],
        }
        if it.gold_chunk_ids:  # unanswerable questions have no gold -> no retrieval score
            s = score_question(it.id, it.type, ids, it.gold_chunk_ids)
            scores.append(s)
            row["scores"] = s.model_dump()
        per_q.append(row)
    metrics = aggregate(scores)

    version = (await session.execute(select(Chunk.corpus_version).limit(1))).scalar() or "unknown"
    stamp = datetime.now(UTC).strftime("%Y%m%d-%H%M%S")
    run_id = f"{stamp}_{cfg.id}_{split}"
    directory = runs_dir / f"{stamp}_{cfg.id}_{split}"
    directory.mkdir(parents=True, exist_ok=True)
    models = {
        "embedding": cfg.embedding_model or settings.embedding_model,
        "reranker": cfg.reranker_model,
    }
    (directory / "config.json").write_text(
        json.dumps(
            {
                "config": cfg.model_dump(),
                "split": split,
                "corpus_version": version,
                "models": models,
            },
            indent=2,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    with (directory / "results.jsonl").open("w", encoding="utf-8", newline="\n") as f:
        for row in per_q:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
    (directory / "metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    (directory / "summary.md").write_text(
        render_summary(cfg, split, version, metrics, len(items)), encoding="utf-8"
    )

    session.add(
        EvalRun(
            run_id=run_id, config=cfg.id, corpus_version=version, models=models, metrics=metrics
        )
    )
    await session.flush()  # EvalRun must exist before EvalResult rows (FK, no relationship)
    for row in per_q:
        session.add(
            EvalResult(
                run_id=run_id,
                question_id=row["question_id"],
                retrieved_ids=[r["chunk_id"] for r in row["retrieved"]],
                output=None,
                scores=row.get("scores"),
            )
        )
    await session.commit()
    return RetrievalRun(run_id, directory, metrics, per_q)


def render_summary(
    cfg: ExperimentConfig,
    split: str,
    version: str,
    metrics: dict[str, dict[str, float]],
    n_items: int,
) -> str:
    cols = [f"recall@{k}" for k in KS] + ["mrr", "ndcg@5"]
    lines = [
        f"# Retrieval run {cfg.id} ({cfg.retriever}) · split={split}",
        "",
        f"corpus_version `{version}` · {n_items} questions ({int(metrics.get('all', {}).get('n', 0))} scored)",
        "",
        "| group | n | " + " | ".join(cols) + " |",
        "|---|---|" + "---|" * len(cols),
    ]
    for group, m in metrics.items():
        lines.append(
            f"| {group} | {int(m['n'])} | " + " | ".join(f"{m[c]:.3f}" for c in cols) + " |"
        )
    lines.append("")
    return "\n".join(lines)
