"""Build/refresh dense embeddings in pgvector (idempotent via text_sha)."""

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Chunk, Document, Embedding
from app.retrieval.embeddings import EmbeddingProvider, text_sha


def embedding_text(label: str, text: str) -> str:
    """Text that is embedded: the chunk label (e.g. 'Pasal 15 ayat (2)') gives context."""
    return f"{label}\n{text}"


def select_wanted(rows: Sequence[Any], external_api: bool) -> tuple[dict[str, str], int]:
    """Texts to embed per chunk_id. Privacy rule: with an external API only api_allowed chunks."""
    wanted: dict[str, str] = {}
    skipped = 0
    for cid, text, hier, doc_api_allowed in rows:
        if external_api and not (doc_api_allowed and hier.get("api_allowed", False)):
            skipped += 1
            continue
        wanted[cid] = embedding_text(str(hier.get("label", cid)), text)
    return wanted, skipped


@dataclass
class IndexStats:
    model: str
    total: int
    embedded: int
    unchanged: int
    skipped_not_api_allowed: int
    removed: int


async def build_index(
    session: AsyncSession, provider: EmbeddingProvider, *, external_api: bool, batch: int = 64
) -> IndexStats:
    rows = (
        await session.execute(
            select(Chunk.chunk_id, Chunk.text, Chunk.hierarchy, Document.api_allowed)
            .join(Document, Document.id == Chunk.doc_id)
            .where(Document.index.is_(True))
        )
    ).all()
    wanted, skipped = select_wanted(rows, external_api)

    existing = dict(
        (
            await session.execute(
                select(Embedding.chunk_id, Embedding.text_sha).where(
                    Embedding.model == provider.model
                )
            )
        ).all()
    )
    stale_ids = [c for c in existing if c not in wanted]
    if stale_ids:
        await session.execute(
            delete(Embedding).where(
                Embedding.model == provider.model, Embedding.chunk_id.in_(stale_ids)
            )
        )
    todo = [c for c, t in wanted.items() if existing.get(c) != text_sha(t)]

    for i in range(0, len(todo), batch):
        ids = todo[i : i + batch]
        vectors = await provider.embed([wanted[c] for c in ids], is_query=False)
        for cid, vec in zip(ids, vectors, strict=True):
            await session.merge(
                Embedding(
                    chunk_id=cid,
                    model=provider.model,
                    dim=len(vec),
                    text_sha=text_sha(wanted[cid]),
                    vector=vec,
                )
            )
        await session.commit()
    await session.commit()
    return IndexStats(
        model=provider.model,
        total=len(wanted),
        embedded=len(todo),
        unchanged=len(wanted) - len(todo),
        skipped_not_api_allowed=skipped,
        removed=len(stale_ids),
    )
