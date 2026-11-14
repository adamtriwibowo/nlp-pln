"""The cited-answer agent (Pydantic AI): prompt, context building and the citation validator."""

import re
from pathlib import Path

from pydantic_ai import Agent, ModelRetry, RunContext
from pydantic_ai.models import Model

from app.agents.schemas import AnswerDeps, CitedAnswer, ContextChunk

PROMPT_DIR = Path(__file__).parent / "prompts"
PROMPT_VERSION = "v1"
OUTPUT_RETRIES = 2  # PRD F3: at most 2 ModelRetry before falling back to abstain


def load_prompt(name: str) -> str:
    return (PROMPT_DIR / f"{name}_{PROMPT_VERSION}.md").read_text(encoding="utf-8").strip()


_WS = re.compile(r"\s+")


def normalize(text: str) -> str:
    return _WS.sub(" ", text).strip().casefold()


def quote_in_text(quote: str, text: str) -> bool:
    """Verbatim check tolerant to whitespace/case (and to OCR-lost spaces in noisy documents)."""
    q = normalize(quote).strip(" .;:\"'“”‘’…")
    if not q:
        return False
    t = normalize(text)
    if q in t:
        return True
    return q.replace(" ", "") in t.replace(" ", "")


def build_user_prompt(question: str, context: list[ContextChunk]) -> str:
    if not context:
        return f"PERTANYAAN: {question}"
    blocks = [
        f"[{c.label}] chunk_id={c.chunk_id} | {c.ref} | {c.doc_title} | hal. {c.page_start}\n{c.text}"
        for c in context
    ]
    return "KONTEKS:\n\n" + "\n\n".join(blocks) + f"\n\nPERTANYAAN: {question}"


def validate_citations(out: CitedAnswer, allowed: dict[str, ContextChunk]) -> list[str]:
    """Return a list of problems; empty means the answer's citations are acceptable."""
    problems: list[str] = []
    if out.abstained:
        return problems
    if not out.citations:
        return ["Jawaban tanpa sitasi: tambahkan `citations` atau set abstained=true."]
    for c in out.citations:
        chunk = allowed.get(c.chunk_id)
        if chunk is None:
            problems.append(
                f"chunk_id '{c.chunk_id}' tidak ada di konteks. Gunakan hanya: {sorted(allowed)}"
            )
        elif not quote_in_text(c.quote, chunk.text):
            problems.append(
                f"kutipan untuk {c.chunk_id} tidak ditemukan di teksnya; salin persis dari teks chunk"
            )
    return problems


def build_answer_agent(
    model: Model | str, *, agentic: bool = False, closed_book: bool = False
) -> Agent[AnswerDeps, CitedAnswer]:
    if closed_book:
        instructions = load_prompt("closed_book")
    elif agentic:
        instructions = load_prompt("answer_agentic")
    else:
        instructions = load_prompt("answer")
    agent: Agent[AnswerDeps, CitedAnswer] = Agent(
        model,
        output_type=CitedAnswer,
        deps_type=AnswerDeps,
        instructions=instructions,
        retries=OUTPUT_RETRIES,
    )

    @agent.output_validator
    async def _check(ctx: RunContext[AnswerDeps], out: CitedAnswer) -> CitedAnswer:
        if ctx.deps.closed_book:
            return out
        problems = validate_citations(out, ctx.deps.context)
        if problems:
            raise ModelRetry("Perbaiki sitasi: " + "; ".join(problems))
        return out

    if agentic:
        from app.agents.tools import register_tools

        register_tools(agent)
    return agent
