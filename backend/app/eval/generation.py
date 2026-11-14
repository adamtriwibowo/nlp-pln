"""Generation evaluation with Pydantic Evals: faithfulness, citation correctness, answer
correctness (LLM judge, JUDGE_MODEL != LLM_MODEL), abstain accuracy, latency, tokens, cost."""

import json
import statistics
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from pydantic import BaseModel
from pydantic_ai import Agent
from pydantic_evals import Case, Dataset
from pydantic_evals.evaluators import Evaluator, EvaluatorContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.llm import build_model
from app.agents.schemas import JudgeVerdict
from app.core.config import Settings
from app.db.models import Chunk, EvalResult, EvalRun
from app.eval.qa_schema import QAItem
from app.retrieval.base import ExperimentConfig, Retriever
from app.services.ask_service import AskResult, _cost_of, answer_question
from app.services.context import load_chunks

PROMPT_DIR = Path(__file__).parent / "prompts"
JUDGE_PROMPT_VERSION = "v1"
REPO_ROOT = Path(__file__).resolve().parents[3]
RUNS_DIR = REPO_ROOT / "runs"


class JudgeConfigError(RuntimeError):
    pass


def assert_judge_differs(settings: Settings) -> None:
    """PRD F6: the judge must be a different model from the generator (avoids self-preference)."""
    if not settings.judge_model:
        raise JudgeConfigError("JUDGE_MODEL is not set")
    if settings.judge_model == settings.llm_model:
        raise JudgeConfigError("JUDGE_MODEL must differ from LLM_MODEL")


def _prompt(name: str) -> str:
    return (PROMPT_DIR / f"{name}_{JUDGE_PROMPT_VERSION}.md").read_text(encoding="utf-8").strip()


class QuestionInput(BaseModel):
    id: str
    question: str


class QAMeta(BaseModel):
    type: str
    gold_chunk_ids: list[str]
    gold_texts: list[str]
    reference_answer: str


@dataclass
class Judges:
    faithfulness: Agent[None, JudgeVerdict]
    citation: Agent[None, JudgeVerdict]
    correctness: Agent[None, JudgeVerdict]
    cost_usd: float = 0.0

    @classmethod
    def build(cls, settings: Settings) -> "Judges":
        assert_judge_differs(settings)
        model = build_model(settings, settings.judge_model)

        def make(name: str) -> Agent[None, JudgeVerdict]:
            return Agent(model, output_type=JudgeVerdict, instructions=_prompt(name))

        return cls(make("judge_faithfulness"), make("judge_citation"), make("judge_correctness"))

    async def ask(self, agent: Agent[None, JudgeVerdict], prompt: str) -> JudgeVerdict:
        run = await agent.run(prompt, model_settings={"temperature": 0.0})
        self.cost_usd += _cost_of(run.all_messages())
        return run.output


def _evidence(out: AskResult, meta: QAMeta) -> str:
    """Text the answer is judged against: its context (RAG) or the gold chunks (closed-book B0)."""
    if out.context:
        cited = {c.chunk_id for c in out.answer.citations}
        chunks = [c for c in out.context if c.chunk_id in cited] or out.context
        return "\n\n".join(f"[{c.ref}] {c.text}" for c in chunks)
    return "\n\n".join(meta.gold_texts) or "(tidak ada bukti)"


@dataclass
class GenerationEvaluator(Evaluator[QuestionInput, AskResult, QAMeta]):
    judges: Judges
    collector: dict[str, dict[str, float]] = field(default_factory=dict)

    async def evaluate(
        self, ctx: EvaluatorContext[QuestionInput, AskResult, QAMeta]
    ) -> dict[str, float]:
        out, meta, q = ctx.output, ctx.metadata, ctx.inputs
        assert meta is not None
        unanswerable = meta.type == "unanswerable"
        scores: dict[str, float] = {"abstain_correct": float(out.answer.abstained == unanswerable)}
        evidence = _evidence(out, meta)
        scores["faithfulness"] = (
            await self.judges.ask(
                self.judges.faithfulness,
                f"PERTANYAAN: {q.question}\n\nJAWABAN:\n{out.answer.answer}\n\nBUKTI:\n{evidence}",
            )
        ).score
        cites = (
            "\n".join(f'[{c.label}] {c.chunk_id}: "{c.quote}"' for c in out.answer.citations)
            or "(tidak ada sitasi)"
        )
        scores["citation_correctness"] = (
            await self.judges.ask(
                self.judges.citation,
                f"JAWABAN:\n{out.answer.answer}\n\nSITASI:\n{cites}\n\nTEKS CHUNK:\n{evidence}",
            )
        ).score
        scores["answer_correctness"] = (
            await self.judges.ask(
                self.judges.correctness,
                f"PERTANYAAN: {q.question}\n\nJAWABAN ACUAN:\n{meta.reference_answer}\n\n"
                f"JAWABAN SISTEM:\n{out.answer.answer}",
            )
        ).score
        self.collector[q.id] = scores
        return scores


def percentile(values: list[float], pct: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    k = (len(ordered) - 1) * pct / 100
    lo, hi = int(k), min(int(k) + 1, len(ordered) - 1)
    return ordered[lo] + (ordered[hi] - ordered[lo]) * (k - lo)


def summarize(
    rows: list[dict[str, Any]],
) -> dict[str, dict[str, float]]:
    """Aggregate per-question rows into overall and per-type metrics."""

    def agg(group: list[dict[str, Any]]) -> dict[str, float]:
        def mean(key: str) -> float:
            vals = [r["scores"][key] for r in group if key in r.get("scores", {})]
            return statistics.fmean(vals) if vals else 0.0

        lat = [float(r["latency_ms"]) for r in group]
        return {
            "n": float(len(group)),
            "faithfulness": mean("faithfulness"),
            "citation_correctness": mean("citation_correctness"),
            "answer_correctness": mean("answer_correctness"),
            "abstain_accuracy": mean("abstain_correct"),
            "latency_p50_ms": percentile(lat, 50),
            "latency_p95_ms": percentile(lat, 95),
            "tokens_per_q": statistics.fmean(r["tokens"] for r in group),
            "cost_per_q_usd": statistics.fmean(r["cost_usd"] for r in group),
        }

    result = {"all": agg(rows)} if rows else {}
    for t in sorted({r["type"] for r in rows}):
        result[t] = agg([r for r in rows if r["type"] == t])
    return result


async def run_generation_eval(
    cfg: ExperimentConfig,
    items: list[QAItem],
    *,
    session: AsyncSession,
    settings: Settings,
    split: str,
    retriever: Retriever | None,
    audit: bool = False,
    runs_dir: Path = RUNS_DIR,
) -> tuple[Path, dict[str, dict[str, float]]]:
    judges = Judges.build(settings)
    gold_ids = sorted({g for i in items for g in i.gold_chunk_ids})
    gold = await load_chunks(session, gold_ids)
    results: dict[str, AskResult] = {}

    async def task(inp: QuestionInput) -> AskResult:
        res = await answer_question(
            inp.question,
            cfg,
            session=session,
            settings=settings,
            retriever=retriever,
            audit=audit,
            auditor_model=build_model(settings, settings.judge_model) if audit else None,
            use_cache=True,
        )
        results[inp.id] = res
        return res

    collector: dict[str, dict[str, float]] = {}
    dataset: Dataset[QuestionInput, AskResult, QAMeta] = Dataset(
        name=f"k2rag-{cfg.id}-{split}",
        cases=[
            Case(
                name=it.id,
                inputs=QuestionInput(id=it.id, question=it.question),
                expected_output=None,
                metadata=QAMeta(
                    type=it.type,
                    gold_chunk_ids=it.gold_chunk_ids,
                    gold_texts=[gold[g].text for g in it.gold_chunk_ids if g in gold],
                    reference_answer=it.reference_answer,
                ),
            )
            for it in items
        ],
        evaluators=[GenerationEvaluator(judges=judges, collector=collector)],
    )
    report = await dataset.evaluate(task, name=cfg.id, max_concurrency=1, progress=False)
    failures = [c.name for c in report.failures]

    rows: list[dict[str, Any]] = []
    for it in items:
        res = results.get(it.id)
        if res is None:
            continue
        rows.append(
            {
                "question_id": it.id,
                "type": it.type,
                "question": it.question,
                "reference_answer": it.reference_answer,
                "gold_chunk_ids": it.gold_chunk_ids,
                "answer": res.answer.model_dump(),
                "abstain_reason": res.abstain_reason,
                "steps": [s.__dict__ for s in res.steps],
                "context_ids": [c.chunk_id for c in res.context],
                "scores": collector.get(it.id, {}),
                "latency_ms": res.latency_ms,
                "tokens": res.input_tokens + res.output_tokens,
                "cost_usd": res.cost_usd,
                "cached": res.cached,
            }
        )
    metrics = summarize(rows)
    metrics["all"]["judge_cost_usd"] = judges.cost_usd
    metrics["all"]["failed_cases"] = float(len(failures))
    return await _persist(cfg, split, settings, session, rows, metrics, runs_dir), metrics


async def _persist(
    cfg: ExperimentConfig,
    split: str,
    settings: Settings,
    session: AsyncSession,
    rows: list[dict[str, Any]],
    metrics: dict[str, dict[str, float]],
    runs_dir: Path,
) -> Path:
    version = (await session.execute(select(Chunk.corpus_version).limit(1))).scalar() or "unknown"
    stamp = datetime.now(UTC).strftime("%Y%m%d-%H%M%S")
    run_id = f"{stamp}_{cfg.id}_{split}_gen"
    directory = runs_dir / run_id
    directory.mkdir(parents=True, exist_ok=True)
    models = {
        "generator": settings.llm_model,
        "judge": settings.judge_model,
        "embedding": cfg.embedding_model or settings.embedding_model,
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
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    (directory / "metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    (directory / "summary.md").write_text(
        render_summary(cfg, split, version, models, metrics), encoding="utf-8"
    )
    session.add(
        EvalRun(
            run_id=run_id, config=cfg.id, corpus_version=version, models=models, metrics=metrics
        )
    )
    await session.flush()
    for r in rows:
        session.add(
            EvalResult(
                run_id=run_id,
                question_id=r["question_id"],
                retrieved_ids=r["context_ids"],
                output=r["answer"],
                scores={**r["scores"], "latency_ms": r["latency_ms"], "cost_usd": r["cost_usd"]},
            )
        )
    await session.commit()
    return directory


def render_summary(
    cfg: ExperimentConfig,
    split: str,
    version: str,
    models: dict[str, str],
    metrics: dict[str, dict[str, float]],
) -> str:
    cols = [
        "faithfulness",
        "citation_correctness",
        "answer_correctness",
        "abstain_accuracy",
        "latency_p50_ms",
        "latency_p95_ms",
        "cost_per_q_usd",
    ]
    lines = [
        f"# Generation run {cfg.id} · split={split}",
        "",
        f"corpus `{version}` · generator `{models['generator']}` · judge `{models['judge']}`",
        "",
        "| group | n | " + " | ".join(cols) + " |",
        "|---|---|" + "---|" * len(cols),
    ]
    for g, m in metrics.items():
        vals = " | ".join(
            f"{m.get(c, 0):.3f}" if "ms" not in c else f"{m.get(c, 0):.0f}" for c in cols
        )
        lines.append(f"| {g} | {int(m['n'])} | {vals} |")
    lines.append("")
    return "\n".join(lines)
