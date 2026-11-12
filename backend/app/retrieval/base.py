"""Common retrieval types and the experiment config (loaded from configs/*.yaml)."""

from pathlib import Path
from typing import Literal, Protocol

import yaml
from pydantic import BaseModel, Field


class Hit(BaseModel):
    chunk_id: str
    score: float
    rank: int  # 1-based


class ChunkDoc(BaseModel):
    """The minimal chunk view retrievers need."""

    chunk_id: str
    text: str
    label: str = ""
    kind: str = "pasal"
    api_allowed: bool = True


class Retriever(Protocol):
    name: str

    async def retrieve(self, query: str, k: int) -> list[Hit]: ...


class ExperimentConfig(BaseModel):
    id: str
    retriever: Literal["none", "bm25", "dense", "hybrid", "hybrid_rerank", "agentic"]
    mode: Literal["standard", "agentic"] = "standard"
    top_k: int = 5
    seed: int = 42
    # retrieval options
    stem: bool = False  # Sastrawi stemming for BM25
    rrf_k: int = 60
    candidate_k: int = 50  # per-retriever depth before fusion / rerank
    exclude_kinds: list[str] = Field(default_factory=lambda: ["lampiran"])
    embedding_model: str | None = None  # defaults to EMBEDDING_MODEL env
    reranker_model: str = "BAAI/bge-reranker-v2-m3"


def load_config(config_id: str, directory: Path | None = None) -> ExperimentConfig:
    directory = directory or Path(__file__).resolve().parents[3] / "configs"
    path = directory / f"{config_id}.yaml"
    if not path.exists():
        raise FileNotFoundError(f"No config {path}")
    return ExperimentConfig.model_validate(yaml.safe_load(path.read_text(encoding="utf-8")))


def to_hits(ranked: list[tuple[str, float]], k: int) -> list[Hit]:
    return [Hit(chunk_id=cid, score=s, rank=i) for i, (cid, s) in enumerate(ranked[:k], 1)]
