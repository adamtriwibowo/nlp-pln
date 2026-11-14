"""Validate the LLM judge against manual labels (>= 20 answers, PRD F6)."""

import csv
import json
import random
from pathlib import Path

from app.eval.agreement import cohens_kappa, percent_agreement

METRICS = {
    "faithfulness": "human_faithfulness",
    "citation_correctness": "human_citation",
    "answer_correctness": "human_correctness",
}
THRESHOLD = 0.5  # judge score >= 0.5 counts as "pass"
FIELDS = [
    "question_id",
    "question",
    "reference_answer",
    "answer",
    "citations",
    "judge_faithfulness",
    "judge_citation",
    "judge_correctness",
    "human_faithfulness",
    "human_citation",
    "human_correctness",
]


def export_sample(run_dir: Path, out_csv: Path, n: int = 20, seed: int = 42) -> int:
    rows = [
        json.loads(x)
        for x in (run_dir / "results.jsonl").read_text(encoding="utf-8").splitlines()
        if x
    ]
    rng = random.Random(seed)
    sample = rng.sample(rows, min(n, len(rows)))
    with out_csv.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        for r in sample:
            s = r["scores"]
            w.writerow(
                {
                    "question_id": r["question_id"],
                    "question": r["question"],
                    "reference_answer": r["reference_answer"],
                    "answer": r["answer"]["answer"],
                    "citations": "; ".join(
                        f"[{c['label']}] {c['chunk_id']}: {c['quote']}"
                        for c in r["answer"]["citations"]
                    ),
                    "judge_faithfulness": s.get("faithfulness", ""),
                    "judge_citation": s.get("citation_correctness", ""),
                    "judge_correctness": s.get("answer_correctness", ""),
                    "human_faithfulness": "",
                    "human_citation": "",
                    "human_correctness": "",
                }
            )
    return len(sample)


def compute_agreement(csv_path: Path) -> dict[str, dict[str, float]]:
    """Per metric: n labelled, percent agreement and Cohen's kappa (judge >= 0.5 vs human 1/0)."""
    with csv_path.open(encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f))
    judge_col = {
        "faithfulness": "judge_faithfulness",
        "citation_correctness": "judge_citation",
        "answer_correctness": "judge_correctness",
    }
    out: dict[str, dict[str, float]] = {}
    for metric, human_col in METRICS.items():
        pairs = [
            (float(r[judge_col[metric]]) >= THRESHOLD, r[human_col].strip() in ("1", "true", "ya"))
            for r in rows
            if r[human_col].strip() and r[judge_col[metric]].strip()
        ]
        if not pairs:
            continue
        judge, human = [p[0] for p in pairs], [p[1] for p in pairs]
        out[metric] = {
            "n": float(len(pairs)),
            "agreement": percent_agreement(judge, human),
            "kappa": cohens_kappa(judge, human),
        }
    return out
