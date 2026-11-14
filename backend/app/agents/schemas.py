"""Typed contracts shared by agents, services and the API."""

from dataclasses import dataclass, field
from typing import Any, Literal

from pydantic import BaseModel, Field


class Citation(BaseModel):
    label: int = Field(description="Context label n of [n] used in the answer text")
    chunk_id: str = Field(description="chunk_id of the cited context chunk")
    quote: str = Field(description="Short verbatim quote from that chunk supporting the claim")


class CitedAnswer(BaseModel):
    answer: str = Field(description="Answer text; every claim is followed by its [n] label")
    citations: list[Citation] = Field(default_factory=list)
    abstained: bool = Field(default=False, description="True when the context is insufficient")
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)


class ContextChunk(BaseModel):
    """A chunk placed in the prompt (label is the [n] shown to the model)."""

    label: int
    chunk_id: str
    doc_id: str
    doc_title: str
    ref: str  # e.g. "Pasal 15 ayat (2)"
    text: str
    page_start: int
    api_allowed: bool = False


class ClaimAudit(BaseModel):
    claim: str = Field(description="Sentence copied verbatim from the answer")
    supported: bool
    chunk_id: str | None = None
    note: str = ""


class AuditResult(BaseModel):
    claims: list[ClaimAudit] = Field(default_factory=list)


class JudgeVerdict(BaseModel):
    score: float = Field(ge=0.0, le=1.0)
    reasoning: str = ""


@dataclass
class Step:
    """One recorded agent step (tool call) shown in the UI."""

    tool: str
    args: dict[str, Any]
    found: list[str] = field(default_factory=list)  # chunk_ids returned
    summary: str = ""


@dataclass
class AnswerDeps:
    """Per-run dependencies: what the model may cite, and tool plumbing for agentic mode."""

    context: dict[str, ContextChunk] = field(default_factory=dict)  # chunk_id -> chunk (allowed)
    closed_book: bool = False
    steps: list[Step] = field(default_factory=list)
    retriever: Any = None  # app.retrieval.base.Retriever (agentic mode)
    chunk_loader: Any = None  # async (ids) -> dict[str, ContextChunk] (agentic mode)
    doc_lister: Any = None  # async () -> list[dict]
    top_k: int = 5
    on_step: Any = None  # optional callback(Step) for live streaming


AbstainReason = Literal["insufficient_context", "validation_failed", "cost_limit", "timeout", ""]
