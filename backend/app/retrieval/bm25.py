"""In-memory BM25 over chunks (bm25s)."""

import asyncio

import bm25s
import numpy as np

from app.retrieval.base import ChunkDoc, Hit, to_hits
from app.retrieval.tokenizer import tokenize


class BM25Retriever:
    name = "bm25"

    def __init__(self, docs: list[ChunkDoc], stem: bool = False) -> None:
        if not docs:
            raise ValueError("BM25Retriever needs at least one chunk")
        self.stem = stem
        self.ids = [d.chunk_id for d in docs]
        corpus = [tokenize(f"{d.label} {d.text}", stem=stem) for d in docs]
        self._index = bm25s.BM25()
        self._index.index(corpus, show_progress=False)

    def search(self, query: str, k: int) -> list[tuple[str, float]]:
        toks = tokenize(query, stem=self.stem)
        if not toks:
            return []
        k = min(k, len(self.ids))
        # Score all documents so unknown query tokens cannot break retrieval.
        scores = np.asarray(self._index.get_scores(toks), dtype=float)
        order = np.argsort(-scores, kind="stable")[:k]
        return [(self.ids[i], float(scores[i])) for i in order if scores[i] > 0]

    async def retrieve(self, query: str, k: int) -> list[Hit]:
        return to_hits(await asyncio.to_thread(self.search, query, k), k)
