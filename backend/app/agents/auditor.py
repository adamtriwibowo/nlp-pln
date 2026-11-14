"""Post-generation citation auditor (separate agent): drops claims the cited text does not support."""

import re

from pydantic_ai import Agent
from pydantic_ai.models import Model

from app.agents.answer_agent import load_prompt
from app.agents.schemas import AuditResult, CitedAnswer, ContextChunk


def build_auditor(model: Model | str) -> Agent[None, AuditResult]:
    return Agent(model, output_type=AuditResult, instructions=load_prompt("auditor"))


def build_audit_prompt(answer: CitedAnswer, context: dict[str, ContextChunk]) -> str:
    cited = {c.chunk_id for c in answer.citations}
    evidence = "\n\n".join(
        f"chunk_id={cid} | {context[cid].ref}\n{context[cid].text}"
        for cid in cited
        if cid in context
    )
    return f"JAWABAN:\n{answer.answer}\n\nCHUNK YANG DIKUTIP:\n{evidence}"


def apply_audit(answer: CitedAnswer, audit: AuditResult) -> tuple[CitedAnswer, list[str]]:
    """Remove sentences judged unsupported (only when copied verbatim); return the removed claims."""
    removed: list[str] = []
    text = answer.answer
    for claim in audit.claims:
        if claim.supported:
            continue
        sentence = claim.claim.strip()
        if sentence and sentence in text:
            text = text.replace(sentence, "").strip()
            removed.append(sentence)
        else:
            removed.append(f"(tidak dapat dihapus otomatis) {sentence}")
    text = re.sub(r"\s{2,}", " ", text).strip()
    if removed and not text:
        return (
            CitedAnswer(
                answer="Informasi pada jawaban tidak dapat diverifikasi terhadap dokumen sumber.",
                citations=[],
                abstained=True,
                confidence=0.0,
            ),
            removed,
        )
    confidence = answer.confidence * (0.7 if removed else 1.0)
    return answer.model_copy(update={"answer": text, "confidence": confidence}), removed
