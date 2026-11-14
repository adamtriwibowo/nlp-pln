"""Tools for the agentic variant (M3). Every call is recorded as a Step and only
api_allowed chunks are ever returned to the model."""

from typing import Any

from pydantic_ai import Agent, RunContext

from app.agents.schemas import AnswerDeps, CitedAnswer, ContextChunk, Step

SNIPPET_CHARS = 700


def _record(deps: AnswerDeps, step: Step) -> None:
    deps.steps.append(step)
    if deps.on_step is not None:
        deps.on_step(step)


def _remember(deps: AnswerDeps, chunks: list[ContextChunk]) -> list[ContextChunk]:
    """Keep only api_allowed chunks and make them citable (validator allows deps.context)."""
    allowed = [c for c in chunks if c.api_allowed]
    for c in allowed:
        if c.chunk_id not in deps.context:
            c.label = len(deps.context) + 1
            deps.context[c.chunk_id] = c
    return allowed


def register_tools(agent: Agent[AnswerDeps, CitedAnswer]) -> None:
    @agent.tool
    async def search_regulations(
        ctx: RunContext[AnswerDeps], query: str, top_k: int = 5
    ) -> list[dict[str, Any]]:
        """Search the regulation corpus (hybrid BM25 + dense). Returns chunk_id, ref and text."""
        deps = ctx.deps
        hits = await deps.retriever.retrieve(query, max(1, min(top_k, 10)))
        loaded = await deps.chunk_loader([h.chunk_id for h in hits])
        chunks = _remember(deps, [loaded[h.chunk_id] for h in hits if h.chunk_id in loaded])
        _record(
            deps,
            Step(
                tool="search_regulations",
                args={"query": query, "top_k": top_k},
                found=[c.chunk_id for c in chunks],
                summary=", ".join(c.ref for c in chunks) or "tidak ada hasil",
            ),
        )
        return [
            {
                "chunk_id": c.chunk_id,
                "ref": c.ref,
                "doc": c.doc_title,
                "page": c.page_start,
                "text": c.text[:SNIPPET_CHARS],
            }
            for c in chunks
        ]

    @agent.tool
    async def get_chunk(ctx: RunContext[AnswerDeps], chunk_id: str) -> dict[str, Any]:
        """Read the full text of one chunk (and its parent Pasal for ayat chunks)."""
        deps = ctx.deps
        loaded = await deps.chunk_loader([chunk_id])
        chunks = _remember(deps, list(loaded.values()))
        _record(
            deps,
            Step(
                tool="get_chunk",
                args={"chunk_id": chunk_id},
                found=[c.chunk_id for c in chunks],
                summary=chunks[0].ref if chunks else "tidak ditemukan atau tidak boleh dikirim",
            ),
        )
        if not chunks:
            return {"error": f"chunk '{chunk_id}' tidak tersedia"}
        c = chunks[0]
        return {
            "chunk_id": c.chunk_id,
            "ref": c.ref,
            "doc": c.doc_title,
            "page": c.page_start,
            "text": c.text,
        }

    @agent.tool
    async def list_documents(ctx: RunContext[AnswerDeps]) -> list[dict[str, Any]]:
        """List the documents available in the corpus."""
        docs: list[dict[str, Any]] = await ctx.deps.doc_lister()
        _record(
            ctx.deps,
            Step(tool="list_documents", args={}, summary=f"{len(docs)} dokumen"),
        )
        return docs
