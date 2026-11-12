"""Dense retrieval over pgvector (cosine distance, HNSW index where one exists)."""

import re

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.retrieval.base import Hit, to_hits
from app.retrieval.embeddings import CachedQueryEmbedder

_MODEL_OK = re.compile(r"^[\w./:\-]+$")
HNSW_MODEL = "baai/bge-m3"
HNSW_DIM = 1024
OVERFETCH = 5


def _vec_literal(v: list[float]) -> str:
    return "[" + ",".join(f"{x:.7g}" for x in v) + "]"


def build_query(model: str, dim: int, exclude_kinds: list[str]) -> str:
    """SQL for top-k by cosine distance.

    The partial HNSW index is `(vector::vector(1024)) WHERE model = 'baai/bge-m3'`; the planner
    only uses it when the query repeats both the cast and a *constant* model predicate, so the
    (validated) model name is inlined. Other models fall back to an exact scan, which is fine
    for a corpus of a few hundred chunks.
    """
    if not _MODEL_OK.match(model):
        raise ValueError(f"unsafe model name: {model!r}")
    if model == HNSW_MODEL and dim == HNSW_DIM:
        dist = f"(e.vector::vector({HNSW_DIM})) <=> CAST(:q AS vector({HNSW_DIM}))"
    else:
        dist = "e.vector <=> CAST(:q AS vector)"
    kinds = ""
    if exclude_kinds:
        kinds = "AND COALESCE(c.hierarchy->>'kind','') <> ALL(:excl)"
    # 1) nearest neighbours on `embeddings` alone so the HNSW index is usable;
    # 2) join/filter afterwards (over-fetch :n candidates, then keep :k).
    return (
        "WITH nn AS ("
        f"SELECT e.chunk_id, {dist} AS d FROM embeddings e "
        f"WHERE e.model = '{model}' ORDER BY {dist} LIMIT :n) "
        "SELECT nn.chunk_id, 1 - nn.d AS score FROM nn "
        "JOIN chunks c ON c.chunk_id = nn.chunk_id JOIN documents doc ON doc.id = c.doc_id "
        f"WHERE doc.index {kinds} ORDER BY nn.d LIMIT :k"
    )


class DenseRetriever:
    name = "dense"

    def __init__(
        self,
        session: AsyncSession,
        embedder: CachedQueryEmbedder,
        dim: int,
        exclude_kinds: list[str] | None = None,
    ) -> None:
        self.session, self.embedder, self.dim = session, embedder, dim
        self.exclude_kinds = exclude_kinds or []

    async def retrieve(self, query: str, k: int) -> list[Hit]:
        qv = await self.embedder.embed_query(query)
        sql = build_query(self.embedder.provider.model, self.dim, self.exclude_kinds)
        params: dict[str, object] = {"q": _vec_literal(qv), "k": k, "n": max(OVERFETCH * k, 100)}
        if self.exclude_kinds:
            params["excl"] = self.exclude_kinds
        # HNSW returns at most ef_search rows; raise it so over-fetching is honoured.
        await self.session.execute(text("SET LOCAL hnsw.ef_search = 400"))
        rows = (await self.session.execute(text(sql), params)).all()
        return to_hits([(r[0], float(r[1])) for r in rows], k)
