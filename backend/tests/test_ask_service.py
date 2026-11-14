"""Answer agent + ask_service tests. No network: Pydantic AI FunctionModel scripts the LLM."""

from pathlib import Path
from typing import Any

import pytest
from pydantic_ai.messages import ModelMessage, ModelResponse, ToolCallPart
from pydantic_ai.models.function import AgentInfo, FunctionModel

from app.agents.answer_agent import build_user_prompt, quote_in_text, validate_citations
from app.agents.auditor import apply_audit
from app.agents.schemas import AuditResult, Citation, CitedAnswer, ClaimAudit, ContextChunk
from app.core.config import Settings
from app.retrieval.base import ExperimentConfig, Hit
from app.services import ask_service
from app.services.ask_service import answer_question
from app.services.context import filter_api_allowed, relabel

P2_TEXT = (
    "(1) Setiap kegiatan usaha ketenagalistrikan wajib memenuhi Keselamatan Ketenagalistrikan."
)
P3_TEXT = "Pemilik Instalasi Tenaga Listrik wajib memiliki sertifikat laik operasi."
SECRET_TEXT = "DOKUMEN INTERNAL RAHASIA jangan dikirim."


def _chunk(cid: str, text: str, allowed: bool = True) -> ContextChunk:
    return ContextChunk(
        label=0,
        chunk_id=cid,
        doc_id=cid.split("-")[0],
        doc_title="Permen ESDM 10/2021",
        ref=cid,
        text=text,
        page_start=5,
        api_allowed=allowed,
    )


CHUNKS = {
    "D2-P2": _chunk("D2-P2", P2_TEXT),
    "D2-P3": _chunk("D2-P3", P3_TEXT),
    "D7-P1": _chunk("D7-P1", SECRET_TEXT, allowed=False),
}


async def loader(ids: list[str]) -> dict[str, ContextChunk]:
    return {i: CHUNKS[i].model_copy() for i in ids if i in CHUNKS}


class FakeRetriever:
    name = "fake"

    def __init__(self, ids: list[str]) -> None:
        self.ids = ids

    async def retrieve(self, query: str, k: int) -> list[Hit]:
        return [Hit(chunk_id=c, score=1.0, rank=i) for i, c in enumerate(self.ids[:k], 1)]


def _final(info: AgentInfo, payload: dict[str, Any]) -> ModelResponse:
    return ModelResponse(parts=[ToolCallPart(info.output_tools[0].name, payload)])


GOOD = {
    "answer": "Setiap kegiatan usaha wajib memenuhi keselamatan [1].",
    "citations": [
        {"label": 1, "chunk_id": "D2-P2", "quote": "wajib memenuhi Keselamatan Ketenagalistrikan"}
    ],
    "abstained": False,
    "confidence": 0.9,
}
BAD_ID = {**GOOD, "citations": [{"label": 1, "chunk_id": "D9-P99", "quote": "apa saja"}]}
BAD_QUOTE = {
    **GOOD,
    "citations": [{"label": 1, "chunk_id": "D2-P2", "quote": "kalimat karangan yang tidak ada"}],
}
SETTINGS = Settings(_env_file=None)
STD = ExperimentConfig(id="M1", retriever="hybrid", top_k=5)


async def _ask(
    model: FunctionModel, cfg: ExperimentConfig = STD, **kw: Any
) -> ask_service.AskResult:
    return await answer_question(
        "Apa kewajiban kegiatan usaha?",
        cfg,
        session=None,
        settings=SETTINGS,
        retriever=kw.pop("retriever", FakeRetriever(["D2-P2", "D2-P3"])),
        chunk_loader=loader,
        model=model,
        **kw,
    )


# ---- pure helpers ----------------------------------------------------------------------


def test_quote_check_tolerates_whitespace_case_and_ocr_spaces() -> None:
    assert quote_in_text("wajib memenuhi keselamatan", P2_TEXT)
    assert quote_in_text("wajib   memenuhi\nKeselamatan", P2_TEXT)
    assert quote_in_text("K3yang meliputi", "persyaratan K3 yang meliputi: a.")  # OCR lost a space
    assert not quote_in_text("kalimat karangan", P2_TEXT)
    assert not quote_in_text("   ", P2_TEXT)


def test_validate_citations_rules() -> None:
    allowed = {"D2-P2": CHUNKS["D2-P2"]}
    ok = CitedAnswer.model_validate(GOOD)
    assert validate_citations(ok, allowed) == []
    assert validate_citations(CitedAnswer.model_validate(BAD_ID), allowed)
    assert validate_citations(CitedAnswer.model_validate(BAD_QUOTE), allowed)
    assert validate_citations(CitedAnswer(answer="tanpa sitasi"), allowed)  # no citations
    assert validate_citations(CitedAnswer(answer="tidak ada", abstained=True), allowed) == []


def test_api_allowed_filter_and_relabel() -> None:
    chunks = [CHUNKS["D2-P2"].model_copy(), CHUNKS["D7-P1"].model_copy()]
    kept = relabel(filter_api_allowed(chunks))
    assert [c.chunk_id for c in kept] == ["D2-P2"] and kept[0].label == 1
    prompt = build_user_prompt("q?", kept)
    assert "[1] chunk_id=D2-P2" in prompt and "RAHASIA" not in prompt


# ---- standard mode ---------------------------------------------------------------------


@pytest.mark.asyncio
async def test_valid_answer_passes_without_retry() -> None:
    calls: list[int] = []

    def fn(msgs: list[ModelMessage], info: AgentInfo) -> ModelResponse:
        calls.append(1)
        return _final(info, GOOD)

    res = await _ask(FunctionModel(fn))
    assert not res.answer.abstained and res.answer.citations[0].chunk_id == "D2-P2"
    assert len(calls) == 1 and res.abstain_reason == ""
    assert res.retrieved_ids == ["D2-P2", "D2-P3"]


@pytest.mark.asyncio
async def test_invalid_citation_triggers_retry_then_succeeds() -> None:
    seq = [BAD_ID, BAD_QUOTE, GOOD]
    calls: list[int] = []

    def fn(msgs: list[ModelMessage], info: AgentInfo) -> ModelResponse:
        calls.append(1)
        return _final(info, seq[min(len(calls) - 1, 2)])

    res = await _ask(FunctionModel(fn))
    assert len(calls) == 3  # two retries (the maximum) then a valid answer
    assert not res.answer.abstained and res.abstain_reason == ""


@pytest.mark.asyncio
async def test_persistent_invalid_citations_fall_back_to_abstain() -> None:
    def fn(msgs: list[ModelMessage], info: AgentInfo) -> ModelResponse:
        return _final(info, BAD_QUOTE)

    res = await _ask(FunctionModel(fn))
    assert res.answer.abstained and res.abstain_reason == "validation_failed"
    assert res.answer.citations == [] and "tidak dapat memastikan" in res.answer.answer


@pytest.mark.asyncio
async def test_model_abstention_is_accepted() -> None:
    def fn(msgs: list[ModelMessage], info: AgentInfo) -> ModelResponse:
        return _final(
            info,
            {"answer": "Tidak ditemukan.", "citations": [], "abstained": True, "confidence": 0.1},
        )

    res = await _ask(FunctionModel(fn))
    assert res.answer.abstained and res.abstain_reason == "insufficient_context"


@pytest.mark.asyncio
async def test_non_api_allowed_chunk_never_reaches_the_prompt() -> None:
    seen: list[str] = []

    def fn(msgs: list[ModelMessage], info: AgentInfo) -> ModelResponse:
        seen.append(repr(msgs))
        return _final(info, GOOD)

    res = await _ask(FunctionModel(fn), retriever=FakeRetriever(["D7-P1", "D2-P2"]))
    assert "RAHASIA" not in "".join(seen) and "D7-P1" not in "".join(seen)
    assert [c.chunk_id for c in res.context] == ["D2-P2"]
    assert res.context[0].label == 1  # relabelled after filtering


@pytest.mark.asyncio
async def test_closed_book_b0_has_no_citation_requirement() -> None:
    def fn(msgs: list[ModelMessage], info: AgentInfo) -> ModelResponse:
        return _final(info, {"answer": "Menurut saya ...", "citations": [], "confidence": 0.3})

    b0 = ExperimentConfig(id="B0", retriever="none")
    res = await _ask(FunctionModel(fn), cfg=b0, retriever=None)
    assert (
        res.answer.answer.startswith("Menurut") and res.context == [] and res.abstain_reason == ""
    )


# ---- agentic mode ----------------------------------------------------------------------


@pytest.mark.asyncio
async def test_agentic_tools_are_recorded_and_enforce_api_allowed() -> None:
    state = {"n": 0}

    def fn(msgs: list[ModelMessage], info: AgentInfo) -> ModelResponse:
        state["n"] += 1
        if state["n"] == 1:
            return ModelResponse(
                parts=[ToolCallPart("search_regulations", {"query": "kewajiban", "top_k": 5})]
            )
        return _final(info, GOOD)

    m3 = ExperimentConfig(id="M3", retriever="agentic", mode="agentic")
    res = await _ask(
        FunctionModel(fn), cfg=m3, retriever=FakeRetriever(["D7-P1", "D2-P2"]), timeout_s=10
    )
    assert [s.tool for s in res.steps] == ["search_regulations"]
    assert res.steps[0].found == ["D2-P2"]  # the non-api_allowed chunk was filtered out
    assert not res.answer.abstained
    assert [c.chunk_id for c in res.context] == ["D2-P2"]


@pytest.mark.asyncio
async def test_agentic_request_limit_leads_to_abstain() -> None:
    def fn(msgs: list[ModelMessage], info: AgentInfo) -> ModelResponse:
        return ModelResponse(parts=[ToolCallPart("list_documents", {})])  # never finishes

    m3 = ExperimentConfig(id="M3", retriever="agentic", mode="agentic")
    res = await _ask(FunctionModel(fn), cfg=m3, timeout_s=10)
    assert res.answer.abstained and res.abstain_reason == "usage_limit"
    assert len(res.steps) <= 6


# ---- cache and auditor -----------------------------------------------------------------


@pytest.mark.asyncio
async def test_llm_cache_avoids_second_call(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(ask_service, "LLM_CACHE_DIR", tmp_path)
    calls: list[int] = []

    def fn(msgs: list[ModelMessage], info: AgentInfo) -> ModelResponse:
        calls.append(1)
        return _final(info, GOOD)

    r1 = await _ask(FunctionModel(fn), use_cache=True)
    r2 = await _ask(FunctionModel(fn), use_cache=True)
    assert len(calls) == 1 and not r1.cached and r2.cached
    assert r2.answer == r1.answer and r2.context[0].chunk_id == "D2-P2"


def test_apply_audit_removes_unsupported_sentence() -> None:
    ans = CitedAnswer(
        answer="Wajib memiliki sertifikat [1]. Denda sepuluh juta rupiah [1].",
        citations=[Citation(label=1, chunk_id="D2-P3", quote="sertifikat laik operasi")],
        confidence=0.8,
    )
    audit = AuditResult(
        claims=[
            ClaimAudit(claim="Wajib memiliki sertifikat [1].", supported=True, chunk_id="D2-P3"),
            ClaimAudit(claim="Denda sepuluh juta rupiah [1].", supported=False, chunk_id="D2-P3"),
        ]
    )
    new, removed = apply_audit(ans, audit)
    assert "Denda" not in new.answer and "sertifikat" in new.answer
    assert removed == ["Denda sepuluh juta rupiah [1]."] and new.confidence < ans.confidence


def test_apply_audit_all_unsupported_becomes_abstain() -> None:
    ans = CitedAnswer(answer="Klaim palsu satu.", citations=[], confidence=0.9)
    audit = AuditResult(claims=[ClaimAudit(claim="Klaim palsu satu.", supported=False)])
    new, removed = apply_audit(ans, audit)
    assert new.abstained and removed
