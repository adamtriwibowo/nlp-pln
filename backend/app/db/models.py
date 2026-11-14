"""SQLAlchemy models following PRD section 9.3."""

from datetime import datetime
from typing import Any

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

JsonB = JSON().with_variant(JSONB(), "postgresql")


class Base(DeclarativeBase):
    pass


class Document(Base):
    __tablename__ = "documents"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    title: Mapped[str] = mapped_column(Text)
    publisher: Mapped[str | None] = mapped_column(Text)
    source_url: Mapped[str | None] = mapped_column(Text)
    downloaded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str | None] = mapped_column(String(64))
    license: Mapped[str | None] = mapped_column(Text)
    lang: Mapped[str] = mapped_column(String(8), default="id")
    api_allowed: Mapped[bool] = mapped_column(Boolean, default=False)
    index: Mapped[bool] = mapped_column(Boolean, default=True)
    sha256: Mapped[str | None] = mapped_column(String(64))


class Chunk(Base):
    __tablename__ = "chunks"
    chunk_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    doc_id: Mapped[str] = mapped_column(ForeignKey("documents.id"), index=True)
    hierarchy: Mapped[dict[str, Any]] = mapped_column(JsonB, default=dict)
    page_start: Mapped[int] = mapped_column(Integer)
    page_end: Mapped[int] = mapped_column(Integer)
    bbox: Mapped[list[Any] | None] = mapped_column(JsonB)
    text: Mapped[str] = mapped_column(Text)
    n_tokens: Mapped[int] = mapped_column(Integer)
    corpus_version: Mapped[str] = mapped_column(String(64))


class Embedding(Base):
    __tablename__ = "embeddings"
    chunk_id: Mapped[str] = mapped_column(ForeignKey("chunks.chunk_id"), primary_key=True)
    model: Mapped[str] = mapped_column(String(128), primary_key=True)
    dim: Mapped[int] = mapped_column(Integer)
    text_sha: Mapped[str | None] = mapped_column(String(16))
    # Dimension is model dependent; the HNSW index needs a fixed dim and is added in phase 2.
    vector: Mapped[Any] = mapped_column(Vector())


class Query(Base):
    __tablename__ = "queries"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    question: Mapped[str] = mapped_column(Text)
    mode: Mapped[str] = mapped_column(String(16))
    config_id: Mapped[str | None] = mapped_column(String(16))
    answer: Mapped[dict[str, Any] | None] = mapped_column(JsonB)
    citations: Mapped[list[Any] | None] = mapped_column(JsonB)
    latency_ms: Mapped[int | None] = mapped_column(Integer)
    tokens: Mapped[int | None] = mapped_column(Integer)
    cost_usd: Mapped[float | None] = mapped_column(Float)
    model: Mapped[str | None] = mapped_column(String(128))
    trace_id: Mapped[str | None] = mapped_column(String(64))


class Feedback(Base):
    __tablename__ = "feedback"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    query_id: Mapped[int] = mapped_column(ForeignKey("queries.id"), index=True)
    thumbs: Mapped[int] = mapped_column(Integer)
    comment: Mapped[str | None] = mapped_column(Text)


class ReviewItem(Base):
    __tablename__ = "review_items"
    __table_args__ = (UniqueConstraint("run_id", "question_id", name="uq_review_item_source"),)
    item_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    question: Mapped[str] = mapped_column(Text)
    answer: Mapped[dict[str, Any]] = mapped_column(JsonB)  # blinded: no config name shown
    config_id: Mapped[str] = mapped_column(String(16))
    run_id: Mapped[str | None] = mapped_column(String(64))
    question_id: Mapped[str | None] = mapped_column(String(64))


class ReviewScore(Base):
    __tablename__ = "review_scores"
    __table_args__ = (UniqueConstraint("item_id", "reviewer", name="uq_review_score_per_reviewer"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("review_items.item_id"), index=True)
    reviewer: Mapped[str] = mapped_column(String(64))
    correctness: Mapped[int] = mapped_column(Integer)
    completeness: Mapped[int] = mapped_column(Integer)
    usefulness: Mapped[int] = mapped_column(Integer)
    citation_ok: Mapped[bool] = mapped_column(Boolean)
    comment: Mapped[str | None] = mapped_column(Text)


class EvalRun(Base):
    __tablename__ = "eval_runs"
    run_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    config: Mapped[str] = mapped_column(String(16))
    corpus_version: Mapped[str | None] = mapped_column(String(64))
    models: Mapped[dict[str, Any] | None] = mapped_column(JsonB)
    metrics: Mapped[dict[str, Any] | None] = mapped_column(JsonB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class EvalResult(Base):
    __tablename__ = "eval_results"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("eval_runs.run_id"), index=True)
    question_id: Mapped[str] = mapped_column(String(64))
    retrieved_ids: Mapped[list[Any] | None] = mapped_column(JsonB)
    output: Mapped[dict[str, Any] | None] = mapped_column(JsonB)
    scores: Mapped[dict[str, Any] | None] = mapped_column(JsonB)
