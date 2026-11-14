"""Build retrievers from an ExperimentConfig."""

import asyncio

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.db.models import Chunk, Document, Embedding
from app.retrieval.base import ChunkDoc, ExperimentConfig, Hit, Retriever, to_hits
from app.retrieval.bm25 import BM25Retriever
from app.retrieval.dense import DenseRetriever
from app.retrieval.embeddings import CachedQueryEmbedder, build_provider
from app.retrieval.hybrid_rrf import HybridRetriever


async def load_corpus(session: AsyncSession, exclude_kinds: list[str]) -> list[ChunkDoc]:
    """Chunks of indexed documents, minus excluded kinds (e.g. raw lampiran tables)."""
    rows = (
        await session.execute(
            select(Chunk.chunk_id, Chunk.text, Chunk.hierarchy)
            .join(Document, Document.id == Chunk.doc_id)
            .where(Document.index.is_(True))
            .order_by(Chunk.chunk_id)
        )
    ).all()
    docs = []
    for cid, text, hier in rows:
        kind = str(hier.get("kind", "pasal"))
        if kind in exclude_kinds:
            continue
        docs.append(
            ChunkDoc(
                chunk_id=cid,
                text=text,
                label=str(hier.get("label", "")),
                kind=kind,
                api_allowed=bool(hier.get("api_allowed", False)),
            )
        )
    return docs


class RerankRetriever:
    """Cross-encoder reranking of a candidate retriever (variant M2; optional dependency)."""

    name = "hybrid_rerank"

    def __init__(
        self, base: Retriever, docs: dict[str, ChunkDoc], model: str, candidate_k: int
    ) -> None:
        try:
            from sentence_transformers import CrossEncoder
        except ImportError as exc:  # pragma: no cover - optional dependency
            raise RuntimeError(
                "Reranking needs sentence-transformers. Run: uv sync --extra local"
            ) from exc
        self.base, self.docs, self.candidate_k = base, docs, candidate_k
        self._model = CrossEncoder(model)

    async def retrieve(self, query: str, k: int) -> list[Hit]:
        cands = await self.base.retrieve(query, self.candidate_k)
        pairs = [
            (query, f"{self.docs[h.chunk_id].label}\n{self.docs[h.chunk_id].text}") for h in cands
        ]
        scores = await asyncio.to_thread(self._model.predict, pairs)
        ranked = sorted(zip(cands, scores, strict=True), key=lambda x: -float(x[1]))
        return to_hits([(h.chunk_id, float(s)) for h, s in ranked], k)


async def embedding_dim(session: AsyncSession, model: str) -> int:
    dim = (
        await session.execute(select(func.max(Embedding.dim)).where(Embedding.model == model))
    ).scalar()
    if not dim:
        raise RuntimeError(f"No embeddings for model {model!r}. Run `k2 index` first.")
    return int(dim)


class CorpusCache:
    """Process-wide cache of corpus docs and BM25 indexes (rebuilt only on invalidate())."""

    def __init__(self) -> None:
        self._docs: dict[tuple[str, ...], list[ChunkDoc]] = {}
        self._bm25: dict[tuple[bool, tuple[str, ...]], BM25Retriever] = {}

    def invalidate(self) -> None:
        self._docs.clear()
        self._bm25.clear()

    async def docs(self, session: AsyncSession, exclude_kinds: list[str]) -> list[ChunkDoc]:
        key = tuple(sorted(exclude_kinds))
        if key not in self._docs:
            self._docs[key] = await load_corpus(session, exclude_kinds)
        return self._docs[key]

    async def bm25(
        self, session: AsyncSession, exclude_kinds: list[str], stem: bool
    ) -> BM25Retriever:
        key = (stem, tuple(sorted(exclude_kinds)))
        if key not in self._bm25:
            self._bm25[key] = BM25Retriever(await self.docs(session, exclude_kinds), stem=stem)
        return self._bm25[key]


async def build_retriever(
    cfg: ExperimentConfig,
    session: AsyncSession,
    settings: Settings,
    cache: CorpusCache | None = None,
) -> Retriever:
    if cfg.retriever in ("none", "agentic"):
        raise ValueError(f"config {cfg.id} has no standalone retriever ({cfg.retriever})")
    cache = cache or CorpusCache()
    docs = await cache.docs(session, cfg.exclude_kinds)
    parts: list[Retriever] = []
    if cfg.retriever in ("bm25", "hybrid", "hybrid_rerank"):
        parts.append(await cache.bm25(session, cfg.exclude_kinds, cfg.stem))
    if cfg.retriever in ("dense", "hybrid", "hybrid_rerank"):
        model = cfg.embedding_model or settings.embedding_model
        embedder = CachedQueryEmbedder(build_provider(settings, model))
        dim = await embedding_dim(session, model)
        parts.append(DenseRetriever(session, embedder, dim, cfg.exclude_kinds))
    if cfg.retriever in ("bm25", "dense"):
        return parts[0]
    hybrid = HybridRetriever(parts, rrf_k=cfg.rrf_k, candidate_k=cfg.candidate_k)
    if cfg.retriever == "hybrid":
        return hybrid
    return RerankRetriever(
        hybrid, {d.chunk_id: d for d in docs}, cfg.reranker_model, cfg.candidate_k
    )
