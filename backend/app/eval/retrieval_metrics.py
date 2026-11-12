"""Retrieval metrics (binary relevance): Recall@k, MRR, nDCG@5.

Unanswerable questions have no gold chunks and are excluded from retrieval metrics.
Recall@k is the fraction of gold chunks found in the top k (so multi-hop questions can score
partially); `hit@k` (any gold in top k) is also reported.
"""

import math
from collections import defaultdict
from collections.abc import Sequence

from pydantic import BaseModel

KS = (1, 3, 5, 10)


def recall_at_k(retrieved: Sequence[str], gold: Sequence[str], k: int) -> float:
    g = set(gold)
    if not g:
        raise ValueError("recall needs at least one gold id")
    return len(g & set(retrieved[:k])) / len(g)


def hit_at_k(retrieved: Sequence[str], gold: Sequence[str], k: int) -> float:
    return 1.0 if set(gold) & set(retrieved[:k]) else 0.0


def reciprocal_rank(retrieved: Sequence[str], gold: Sequence[str]) -> float:
    g = set(gold)
    for i, cid in enumerate(retrieved, 1):
        if cid in g:
            return 1.0 / i
    return 0.0


def ndcg_at_k(retrieved: Sequence[str], gold: Sequence[str], k: int = 5) -> float:
    g = set(gold)
    dcg = sum(1.0 / math.log2(i + 1) for i, cid in enumerate(retrieved[:k], 1) if cid in g)
    ideal = sum(1.0 / math.log2(i + 1) for i in range(1, min(len(g), k) + 1))
    return dcg / ideal if ideal else 0.0


class QuestionScore(BaseModel):
    question_id: str
    type: str
    recall: dict[int, float]
    hit: dict[int, float]
    mrr: float
    ndcg5: float


def score_question(
    question_id: str, qtype: str, retrieved: Sequence[str], gold: Sequence[str]
) -> QuestionScore:
    return QuestionScore(
        question_id=question_id,
        type=qtype,
        recall={k: recall_at_k(retrieved, gold, k) for k in KS},
        hit={k: hit_at_k(retrieved, gold, k) for k in KS},
        mrr=reciprocal_rank(retrieved, gold),
        ndcg5=ndcg_at_k(retrieved, gold, 5),
    )


def aggregate(scores: list[QuestionScore]) -> dict[str, dict[str, float]]:
    """Mean metrics overall and per question type."""

    def mean(group: list[QuestionScore]) -> dict[str, float]:
        n = len(group)
        out: dict[str, float] = {"n": float(n)}
        for k in KS:
            out[f"recall@{k}"] = sum(s.recall[k] for s in group) / n
            out[f"hit@{k}"] = sum(s.hit[k] for s in group) / n
        out["mrr"] = sum(s.mrr for s in group) / n
        out["ndcg@5"] = sum(s.ndcg5 for s in group) / n
        return out

    result: dict[str, dict[str, float]] = {}
    if scores:
        result["all"] = mean(scores)
    by_type: dict[str, list[QuestionScore]] = defaultdict(list)
    for s in scores:
        by_type[s.type].append(s)
    for t, group in sorted(by_type.items()):
        result[t] = mean(group)
    return result
