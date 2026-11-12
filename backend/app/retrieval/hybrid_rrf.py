"""Reciprocal Rank Fusion (Cormack et al., 2009), written from scratch."""

from collections.abc import Sequence

from app.retrieval.base import Hit, Retriever, to_hits


def rrf(rankings: Sequence[Sequence[str]], k: int = 60) -> list[tuple[str, float]]:
    """Fuse ranked id lists: score(d) = sum over lists of 1 / (k + rank_in_list(d)), rank from 1.

    Ties are broken by best (lowest) rank in any list, then by id for determinism.
    """
    scores: dict[str, float] = {}
    best_rank: dict[str, int] = {}
    for ranking in rankings:
        seen: set[str] = set()
        for rank, cid in enumerate(ranking, 1):
            if cid in seen:  # a duplicate within one list counts once
                continue
            seen.add(cid)
            scores[cid] = scores.get(cid, 0.0) + 1.0 / (k + rank)
            best_rank[cid] = min(best_rank.get(cid, rank), rank)
    return sorted(scores.items(), key=lambda kv: (-kv[1], best_rank[kv[0]], kv[0]))


class HybridRetriever:
    name = "hybrid"

    def __init__(self, retrievers: list[Retriever], rrf_k: int = 60, candidate_k: int = 50) -> None:
        self.retrievers = retrievers
        self.rrf_k = rrf_k
        self.candidate_k = candidate_k

    async def retrieve(self, query: str, k: int) -> list[Hit]:
        lists = [
            [h.chunk_id for h in await r.retrieve(query, self.candidate_k)] for r in self.retrievers
        ]
        return to_hits(rrf(lists, self.rrf_k), k)
