"""Schema and validation for data/eval/qa.jsonl. Questions are written by the team, not generated."""

import json
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class QAItem(BaseModel):
    id: str = Field(min_length=1)
    question: str = Field(min_length=5)
    reference_answer: str = Field(min_length=1)
    gold_chunk_ids: list[str] = Field(default_factory=list)
    type: Literal["factual", "multihop", "unanswerable"]
    split: Literal["dev", "test"]
    source_note: str = Field(min_length=1)

    @model_validator(mode="after")
    def _check_gold(self) -> "QAItem":
        if self.type == "unanswerable" and self.gold_chunk_ids:
            raise ValueError("unanswerable items must have empty gold_chunk_ids")
        if self.type != "unanswerable" and not self.gold_chunk_ids:
            raise ValueError("answerable items need at least one gold_chunk_id")
        if self.type == "multihop" and len(set(self.gold_chunk_ids)) < 2:
            raise ValueError("multihop items need >= 2 distinct gold_chunk_ids")
        return self


def load_qa(path: Path) -> list[QAItem]:
    items: list[QAItem] = []
    if not path.exists():
        return items
    for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        try:
            items.append(QAItem.model_validate(json.loads(line)))
        except Exception as exc:
            raise ValueError(f"{path.name}:{n}: {exc}") from exc
    ids = [i.id for i in items]
    if len(ids) != len(set(ids)):
        raise ValueError("duplicate ids in qa.jsonl")
    return items


def check_gold_exist(items: list[QAItem], chunk_ids: set[str]) -> list[str]:
    """Return human-readable problems for gold ids that do not exist in the corpus."""
    return [
        f"{i.id}: unknown chunk_id {g}"
        for i in items
        for g in i.gold_chunk_ids
        if g not in chunk_ids
    ]
