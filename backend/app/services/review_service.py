"""Expert review: blinded items, scores (idempotent per item + reviewer), CSV export, seeding."""

import csv
import io
import json
import random
from pathlib import Path
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import ReviewItem, ReviewScore
from app.services.context import load_chunks


def blind_answer(answer: dict[str, Any]) -> dict[str, Any]:
    """Keep only what a reviewer needs; never any config/model name."""
    return {
        "answer": answer["answer"],
        "abstained": bool(answer.get("abstained", False)),
        "citations": answer.get("citations", []),
    }


async def seed_from_runs(
    session: AsyncSession, run_dirs: list[Path], n: int, seed: int = 42
) -> tuple[int, int]:
    """Create review items from generation runs (results.jsonl). Returns (created, skipped)."""
    candidates: list[tuple[str, str, str, dict[str, Any]]] = []  # run_id, qid, config, row
    for d in run_dirs:
        cfg = json.loads((d / "config.json").read_text(encoding="utf-8"))["config"]["id"]
        for line in (d / "results.jsonl").read_text(encoding="utf-8").splitlines():
            if line.strip():
                row = json.loads(line)
                candidates.append((d.name, row["question_id"], cfg, row))
    random.Random(seed).shuffle(candidates)  # blinding: no config grouping in item order
    chosen = candidates[:n]

    needed = sorted({c["chunk_id"] for *_, r in chosen for c in r["answer"]["citations"]})
    chunks = await load_chunks(session, needed)
    created = skipped = 0
    for run_id, qid, cfg, row in chosen:
        exists = (
            await session.execute(
                select(ReviewItem.item_id).where(
                    ReviewItem.run_id == run_id, ReviewItem.question_id == qid
                )
            )
        ).first()
        if exists:
            skipped += 1
            continue
        answer = dict(row["answer"])
        answer["citations"] = [
            {
                **c,
                "ref": chunks[c["chunk_id"]].ref if c["chunk_id"] in chunks else c["chunk_id"],
                "doc_title": chunks[c["chunk_id"]].doc_title if c["chunk_id"] in chunks else "",
                "page_start": chunks[c["chunk_id"]].page_start if c["chunk_id"] in chunks else None,
                "text": chunks[c["chunk_id"]].text if c["chunk_id"] in chunks else "",
            }
            for c in answer.get("citations", [])
        ]
        session.add(
            ReviewItem(
                question=row["question"],
                answer=answer,
                config_id=cfg,
                run_id=run_id,
                question_id=qid,
            )
        )
        created += 1
    await session.commit()
    return created, skipped


async def progress(session: AsyncSession, reviewer: str) -> dict[str, int]:
    total = (await session.execute(select(func.count()).select_from(ReviewItem))).scalar() or 0
    done = (
        await session.execute(
            select(func.count()).select_from(ReviewScore).where(ReviewScore.reviewer == reviewer)
        )
    ).scalar() or 0
    return {"done": int(done), "total": int(total)}


async def next_item(session: AsyncSession, reviewer: str) -> dict[str, Any] | None:
    reviewed = select(ReviewScore.item_id).where(ReviewScore.reviewer == reviewer)
    item = (
        await session.execute(
            select(ReviewItem)
            .where(ReviewItem.item_id.not_in(reviewed))
            .order_by(ReviewItem.item_id)
            .limit(1)
        )
    ).scalar_one_or_none()
    if item is None:
        return None
    return {
        "item_id": item.item_id,
        "question": item.question,
        "answer": blind_answer(item.answer),  # config_id is intentionally absent
    }


async def save_score(
    session: AsyncSession,
    *,
    item_id: int,
    reviewer: str,
    correctness: int,
    completeness: int,
    usefulness: int,
    citation_ok: bool,
    comment: str | None,
) -> bool:
    """Upsert one score per (item, reviewer). Returns False if the item does not exist."""
    if await session.get(ReviewItem, item_id) is None:
        return False
    values = {
        "item_id": item_id,
        "reviewer": reviewer,
        "correctness": correctness,
        "completeness": completeness,
        "usefulness": usefulness,
        "citation_ok": citation_ok,
        "comment": comment,
    }
    stmt = insert(ReviewScore).values(**values)
    stmt = stmt.on_conflict_do_update(
        constraint="uq_review_score_per_reviewer",
        set_={k: v for k, v in values.items() if k not in ("item_id", "reviewer")},
    )
    await session.execute(stmt)
    await session.commit()
    return True


async def export_csv(session: AsyncSession, reviewer: str | None, include_config: bool) -> str:
    """CSV of scores. Reviewers export only their own rows and never see config ids."""
    q = select(ReviewScore, ReviewItem).join(ReviewItem, ReviewItem.item_id == ReviewScore.item_id)
    if reviewer:
        q = q.where(ReviewScore.reviewer == reviewer)
    rows = (await session.execute(q.order_by(ReviewScore.item_id, ReviewScore.reviewer))).all()
    buf = io.StringIO()
    fields = [
        "item_id",
        "reviewer",
        "question",
        "answer",
        "correctness",
        "completeness",
        "usefulness",
        "citation_ok",
        "comment",
    ]
    if include_config:
        fields.insert(2, "config_id")
    w = csv.DictWriter(buf, fieldnames=fields)
    w.writeheader()
    for score, item in rows:
        row = {
            "item_id": item.item_id,
            "reviewer": score.reviewer,
            "question": item.question,
            "answer": item.answer.get("answer", ""),
            "correctness": score.correctness,
            "completeness": score.completeness,
            "usefulness": score.usefulness,
            "citation_ok": int(score.citation_ok),
            "comment": score.comment or "",
        }
        if include_config:
            row["config_id"] = item.config_id
        w.writerow(row)
    return buf.getvalue()
