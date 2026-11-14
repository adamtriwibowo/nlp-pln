import csv
import json
from pathlib import Path

import pytest

from app.core.config import Settings
from app.eval.agreement import cohens_kappa, percent_agreement
from app.eval.generation import (
    JudgeConfigError,
    assert_judge_differs,
    percentile,
    summarize,
)
from app.eval.judge_validation import compute_agreement, export_sample


def test_judge_must_differ_from_generator() -> None:
    assert_judge_differs(Settings(_env_file=None, llm_model="a/x", judge_model="b/y"))
    with pytest.raises(JudgeConfigError):
        assert_judge_differs(Settings(_env_file=None, llm_model="a/x", judge_model="a/x"))
    with pytest.raises(JudgeConfigError):
        assert_judge_differs(Settings(_env_file=None, llm_model="a/x", judge_model=""))


def test_percentile_hand_computed() -> None:
    assert percentile([1, 2, 3, 4, 5], 50) == 3
    assert percentile([1, 2, 3, 4, 5], 95) == pytest.approx(4.8)
    assert percentile([7], 95) == 7 and percentile([], 50) == 0.0


def _row(qid: str, qtype: str, lat: int, **scores: float) -> dict[str, object]:
    return {
        "question_id": qid,
        "type": qtype,
        "latency_ms": lat,
        "tokens": 100,
        "cost_usd": 0.002,
        "scores": scores,
    }


def test_summarize_overall_and_per_type() -> None:
    rows = [
        _row(
            "a",
            "factual",
            1000,
            faithfulness=1.0,
            citation_correctness=1.0,
            answer_correctness=1.0,
            abstain_correct=1.0,
        ),
        _row(
            "b",
            "factual",
            3000,
            faithfulness=0.5,
            citation_correctness=0.5,
            answer_correctness=0.0,
            abstain_correct=1.0,
        ),
        _row(
            "c",
            "unanswerable",
            2000,
            faithfulness=1.0,
            citation_correctness=1.0,
            answer_correctness=1.0,
            abstain_correct=0.0,
        ),
    ]
    m = summarize(rows)
    assert m["all"]["n"] == 3 and m["all"]["abstain_accuracy"] == pytest.approx(2 / 3)
    assert m["factual"]["faithfulness"] == pytest.approx(0.75)
    assert m["all"]["latency_p50_ms"] == 2000 and m["unanswerable"]["abstain_accuracy"] == 0.0
    assert m["all"]["cost_per_q_usd"] == pytest.approx(0.002)


def test_kappa_and_agreement_hand_computed() -> None:
    judge = [True, True, False, False]
    human = [True, False, False, False]
    assert percent_agreement(judge, human) == 0.75
    # po=0.75, pa=0.5, pb=0.25, pe=0.5*0.25+0.5*0.75=0.5 -> kappa=(0.75-0.5)/0.5=0.5
    assert cohens_kappa(judge, human) == pytest.approx(0.5)
    assert cohens_kappa([True, False], [True, False]) == 1.0
    assert cohens_kappa([True, True], [True, True]) == 1.0
    with pytest.raises(ValueError):
        percent_agreement([True], [])


def test_export_and_compute_agreement_roundtrip(tmp_path: Path) -> None:
    run = tmp_path / "run"
    run.mkdir()
    rows = []
    for i in range(25):
        rows.append(
            {
                "question_id": f"q{i}",
                "question": "Q?",
                "reference_answer": "ref",
                "answer": {
                    "answer": "jawaban",
                    "citations": [{"label": 1, "chunk_id": "D2-P2", "quote": "kutipan"}],
                },
                "scores": {
                    "faithfulness": 1.0 if i % 2 == 0 else 0.0,
                    "citation_correctness": 1.0,
                    "answer_correctness": 0.5,
                },
            }
        )
    (run / "results.jsonl").write_text("\n".join(json.dumps(r) for r in rows), encoding="utf-8")
    out = tmp_path / "sample.csv"
    assert export_sample(run, out, n=20, seed=1) == 20
    assert compute_agreement(out) == {}  # nothing labelled yet

    with out.open(encoding="utf-8", newline="") as f:
        data = list(csv.DictReader(f))
    for r in data:  # a human who agrees with the judge on faithfulness, always says 1 elsewhere
        r["human_faithfulness"] = "1" if float(r["judge_faithfulness"]) >= 0.5 else "0"
        r["human_citation"] = "1"
    with out.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(data[0]))
        w.writeheader()
        w.writerows(data)
    res = compute_agreement(out)
    assert res["faithfulness"]["agreement"] == 1.0 and res["faithfulness"]["kappa"] == 1.0
    assert res["citation_correctness"]["n"] == 20
    assert "answer_correctness" not in res
