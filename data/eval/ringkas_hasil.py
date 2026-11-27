"""Summarise evaluation runs (runs/) into tables and charts for the report.

Takes the newest dev run of each configuration. Writes docs/evaluasi/*.png and
docs/evaluasi/ringkasan_metrik.json (aggregates only; raw runs are not committed).

Run from backend/:  uv run --with matplotlib python ../data/eval/ringkas_hasil.py
"""

import json
import statistics
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
RUNS = ROOT / "runs"
OUT = ROOT / "docs" / "evaluasi"
COLORS = ["#a1a1aa", "#1d4ed8", "#f2b705", "#15803d", "#b91c1c"]


def latest(config: str, generation: bool) -> Path:
    pattern = f"*_{config}_dev_gen" if generation else f"*_{config}_dev"
    found = sorted(RUNS.glob(pattern))
    if not found:
        raise SystemExit(f"no run for {pattern}")
    return found[-1]


def rows(run: Path) -> list[dict]:
    text = (run / "results.jsonl").read_text(encoding="utf-8")
    return [json.loads(line) for line in text.splitlines() if line]


def retrieval_summary(config: str) -> dict:
    run = latest(config, generation=False)
    metrics = json.loads((run / "metrics.json").read_text(encoding="utf-8"))
    return {"run": run.name, "metrics": metrics}


def generation_summary(config: str) -> dict:
    run = latest(config, generation=True)
    data = rows(run)
    metrics = json.loads((run / "metrics.json").read_text(encoding="utf-8"))
    in_corpus = [r for r in data if r["type"] != "unanswerable"]
    ooc = [r for r in data if r["type"] == "unanswerable"]
    answered = [r for r in in_corpus if not r["answer"]["abstained"]]
    cited = [r["scores"]["citation_correctness"] for r in answered]
    return {
        "run": run.name,
        "all": metrics["all"],
        # a correct refusal has no citation, so also report citations on answered questions only
        "citation_on_answered": statistics.fmean(cited) if cited else 0.0,
        "confusion": {
            "answerable_answered": len(answered),
            "answerable_refused": len(in_corpus) - len(answered),
            "unanswerable_answered": sum(not r["answer"]["abstained"] for r in ooc),
            "unanswerable_refused": sum(bool(r["answer"]["abstained"]) for r in ooc),
        },
        "refused_answerable_ids": [r["question_id"] for r in in_corpus if r["answer"]["abstained"]],
        "answered_unanswerable_ids": [
            r["question_id"] for r in ooc if not r["answer"]["abstained"]
        ],
        "generator_cost_usd": sum(r["cost_usd"] for r in data),
    }


def grouped_bars(path: Path, title: str, labels: list[str], series: dict[str, list[float]]) -> None:
    fig, ax = plt.subplots(figsize=(10, 4.6), dpi=160)
    width = 0.8 / len(series)
    for i, (name, values) in enumerate(series.items()):
        x = [j + (i - (len(series) - 1) / 2) * width for j in range(len(labels))]
        bars = ax.bar(x, values, width * 0.92, label=name, color=COLORS[i % len(COLORS)])
        ax.bar_label(bars, labels=[f"{v:.2f}" for v in values], fontsize=7, rotation=90, padding=2)
    ax.set_xticks(range(len(labels)), labels)
    ax.set_ylim(0, 1.18)
    ax.set_title(title, fontsize=11)
    ax.spines[["top", "right"]].set_visible(False)
    ax.legend(
        ncols=len(series),
        fontsize=8,
        frameon=False,
        loc="upper center",
        bbox_to_anchor=(0.5, -0.09),
    )
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)


def latency_chart(path: Path, gen: dict[str, dict]) -> None:
    fig, ax = plt.subplots(figsize=(10, 3.8), dpi=160)
    names = list(gen)
    for offset, key, label, color in (
        (-0.2, "latency_p50_ms", "p50", "#1d4ed8"),
        (0.2, "latency_p95_ms", "p95", "#f2b705"),
    ):
        values = [gen[n]["all"][key] / 1000 for n in names]
        bars = ax.bar(
            [i + offset for i in range(len(names))], values, 0.38, label=label, color=color
        )
        ax.bar_label(bars, labels=[f"{v:.1f}" for v in values], fontsize=8, padding=2)
    ax.axhline(10, color="#b91c1c", linewidth=1, linestyle="--")
    ax.text(-0.45, 10.4, "target p95 mode standar: 10 s", color="#b91c1c", fontsize=8)
    ax.set_xticks(range(len(names)), names)
    ax.set_ylabel("detik")
    ax.set_title("Latensi jawaban pada split dev", fontsize=11)
    ax.spines[["top", "right"]].set_visible(False)
    ax.legend(frameon=False, fontsize=8)
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    retrieval = {c: retrieval_summary(c) for c in ("B1", "B2", "M1")}
    gen = {c: generation_summary(c) for c in ("B0", "B1", "B2", "M1", "M3")}

    keys = ["recall@1", "recall@3", "recall@5", "recall@10", "mrr", "ndcg@5"]
    grouped_bars(
        OUT / "retrieval.png",
        "Retrieval pada split dev (26 soal dalam korpus)",
        ["Recall@1", "Recall@3", "Recall@5", "Recall@10", "MRR", "nDCG@5"],
        {c: [v["metrics"]["all"][k] for k in keys] for c, v in retrieval.items()},
    )
    grouped_bars(
        OUT / "generasi.png",
        "Generasi pada split dev (33 soal)",
        ["Faithfulness", "Sitasi (semua)", "Sitasi (dijawab)", "Kebenaran", "Abstain"],
        {
            c: [
                v["all"]["faithfulness"],
                v["all"]["citation_correctness"],
                v["citation_on_answered"],
                v["all"]["answer_correctness"],
                v["all"]["abstain_accuracy"],
            ]
            for c, v in gen.items()
        },
    )
    latency_chart(OUT / "latensi.png", gen)
    (OUT / "ringkasan_metrik.json").write_text(
        json.dumps({"retrieval": retrieval, "generation": gen}, indent=2, ensure_ascii=False)
        + "\n",
        encoding="utf-8",
        newline="\n",
    )
    for c, v in gen.items():
        print(c, "citation_on_answered {:.3f}".format(v["citation_on_answered"]), v["confusion"])


if __name__ == "__main__":
    main()
