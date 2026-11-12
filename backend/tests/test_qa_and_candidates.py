import json
from pathlib import Path

import pytest

from app.eval.qa_schema import QAItem, check_gold_exist, load_qa
from app.ingest.candidates import top_candidates
from app.ingest.chunker import chunk_units
from app.ingest.legal_parser import parse_legal_id
from tests.helpers import lines_from_pages
from tests.test_legal_parser import EXCERPT


def _item(**kw: object) -> dict[str, object]:
    base: dict[str, object] = {
        "id": "q1",
        "question": "Apa itu contoh pertanyaan?",
        "reference_answer": "jawaban",
        "gold_chunk_ids": ["D2-P2"],
        "type": "factual",
        "split": "dev",
        "source_note": "Permen 10/2021 Pasal 2",
    }
    base.update(kw)
    return base


def test_qa_schema_rules() -> None:
    QAItem.model_validate(_item())
    with pytest.raises(ValueError):
        QAItem.model_validate(_item(gold_chunk_ids=[]))
    with pytest.raises(ValueError):
        QAItem.model_validate(_item(type="unanswerable"))
    with pytest.raises(ValueError):
        QAItem.model_validate(_item(type="multihop", gold_chunk_ids=["D2-P2"]))
    QAItem.model_validate(_item(type="unanswerable", gold_chunk_ids=[]))


def test_load_qa_detects_duplicates_and_unknown_gold(tmp_path: Path) -> None:
    p = tmp_path / "qa.jsonl"
    p.write_text(json.dumps(_item()) + "\n" + json.dumps(_item()) + "\n", encoding="utf-8")
    with pytest.raises(ValueError):
        load_qa(p)
    p.write_text(json.dumps(_item()) + "\n", encoding="utf-8")
    items = load_qa(p)
    assert check_gold_exist(items, {"D2-P2"}) == []
    assert check_gold_exist(items, set()) == ["q1: unknown chunk_id D2-P2"]


def test_candidates_rank_relevant_chunk_first() -> None:
    chunks = chunk_units("D9", parse_legal_id(lines_from_pages(EXCERPT)).units, "id", True)
    top = top_candidates("pengawasan", chunks, k=3)
    assert top and top[0][1].chunk_id == "D9-P5"
