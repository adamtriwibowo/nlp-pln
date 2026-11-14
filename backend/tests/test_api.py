"""API tests with stubs: no database, no network."""

import json
from collections.abc import AsyncIterator, Iterator
from contextlib import asynccontextmanager
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.agents.schemas import Citation, CitedAnswer, ContextChunk, Step
from app.api import routes_ask
from app.api.main import app
from app.api.security import (
    SlidingWindowLimiter,
    create_session_jwt,
    decode_session_jwt,
    resolve_role,
)
from app.core.config import Settings, get_settings
from app.db.session import get_session
from app.services.ask_service import AskResult

SETTINGS = Settings(
    _env_file=None,
    admin_token="admin-secret",
    review_token="review-secret",
    jwt_secret="x" * 40,
    openrouter_api_key="sk-test",
    llm_model="vendor/model",
    judge_model="vendor/judge",
)


async def _no_session() -> AsyncIterator[None]:
    yield None


@pytest.fixture
def client() -> Iterator[TestClient]:
    app.dependency_overrides[get_settings] = lambda: SETTINGS
    app.dependency_overrides[get_session] = _no_session
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# ---- security primitives ---------------------------------------------------------------


def test_resolve_role_constant_time_and_empty_tokens() -> None:
    assert resolve_role("admin-secret", SETTINGS) == "admin"
    assert resolve_role("review-secret", SETTINGS) == "reviewer"
    assert resolve_role("wrong", SETTINGS) is None
    empty = Settings(_env_file=None)
    assert resolve_role("", empty) is None  # unset tokens never match an empty input


def test_jwt_roundtrip_and_tamper() -> None:
    tok = create_session_jwt("reviewer", SETTINGS)
    assert decode_session_jwt(tok, SETTINGS) == "reviewer"
    assert decode_session_jwt(tok + "x", SETTINGS) is None
    other = Settings(_env_file=None, jwt_secret="y" * 40)
    assert decode_session_jwt(tok, other) is None


def test_sliding_window_limiter() -> None:
    lim = SlidingWindowLimiter(2, window_s=10)
    assert lim.allow("ip", now=0) and lim.allow("ip", now=1)
    assert not lim.allow("ip", now=2)
    assert lim.allow("other", now=2)  # separate key
    assert lim.allow("ip", now=11)  # window slid


# ---- auth routes -----------------------------------------------------------------------


def test_login_sets_httponly_cookie_and_me_reads_it(client: TestClient) -> None:
    r = client.post("/api/auth/login", json={"token": "review-secret"})
    assert r.status_code == 200 and r.json() == {"role": "reviewer"}
    cookie = r.headers["set-cookie"].lower()
    assert "k2_session=" in cookie and "httponly" in cookie and "samesite=lax" in cookie
    assert client.get("/api/auth/me").json() == {"role": "reviewer"}
    client.post("/api/auth/logout")
    assert client.get("/api/auth/me").json() == {"role": None}


def test_login_rejects_bad_token_and_unconfigured_secret(client: TestClient) -> None:
    assert client.post("/api/auth/login", json={"token": "nope"}).status_code == 401
    app.dependency_overrides[get_settings] = lambda: Settings(_env_file=None, admin_token="a")
    assert client.post("/api/auth/login", json={"token": "a"}).status_code == 503


def test_login_is_rate_limited(client: TestClient) -> None:
    app.state.login_limiter = SlidingWindowLimiter(2)
    codes = [client.post("/api/auth/login", json={"token": "nope"}).status_code for _ in range(4)]
    assert codes == [401, 401, 429, 429]


# ---- /api/ask (SSE) --------------------------------------------------------------------


def _parse_sse(body: str) -> list[tuple[str, Any]]:
    events = []
    for block in body.strip().split("\n\n"):
        lines = block.split("\n")
        events.append(
            (lines[0].removeprefix("event: "), json.loads(lines[1].removeprefix("data: ")))
        )
    return events


def _result(abstained: bool = False, reason: str = "") -> AskResult:
    chunk = ContextChunk(
        label=1,
        chunk_id="D2-P2",
        doc_id="D2",
        doc_title="Permen ESDM 10/2021",
        ref="Pasal 2",
        text="teks pasal 2",
        page_start=5,
        api_allowed=True,
    )
    ans = (
        CitedAnswer(answer="Tidak ditemukan.", abstained=True, confidence=0.0)
        if abstained
        else CitedAnswer(
            answer="Jawaban singkat yang cukup panjang untuk dipecah menjadi beberapa token [1].",
            citations=[Citation(label=1, chunk_id="D2-P2", quote="teks pasal 2")],
            confidence=0.9,
        )
    )
    return AskResult(
        answer=ans,
        context=[chunk],
        model="vendor/model",
        config_id="M1",
        input_tokens=10,
        output_tokens=5,
        cost_usd=0.001,
        latency_ms=120,
        abstain_reason=reason,
        steps=[
            Step(tool="search_regulations", args={"query": "q"}, found=["D2-P2"], summary="Pasal 2")
        ],
    )


@pytest.fixture
def stub_pipeline(monkeypatch: pytest.MonkeyPatch) -> dict[str, Any]:
    state: dict[str, Any] = {"logged": [], "result": _result(), "raise": None, "over": False}

    @asynccontextmanager
    async def fake_session_local() -> AsyncIterator[None]:
        yield None

    async def fake_retriever(*a: Any, **k: Any) -> object:
        return object()

    async def fake_answer(question: str, cfg: Any, **kw: Any) -> AskResult:
        if state["raise"]:
            raise state["raise"]
        if cfg.mode == "agentic" and kw.get("on_step"):
            for s in state["result"].steps:
                kw["on_step"](s)
        return state["result"]  # type: ignore[no-any-return]

    async def fake_log(session: Any, **kw: Any) -> int:
        state["logged"].append(kw)
        return 42

    async def fake_over(session: Any, limit: float) -> bool:
        return bool(state["over"])

    monkeypatch.setattr(routes_ask, "SessionLocal", fake_session_local)
    monkeypatch.setattr(routes_ask, "_retriever_for", fake_retriever)
    monkeypatch.setattr(routes_ask, "answer_question", fake_answer)
    monkeypatch.setattr(routes_ask, "log_query", fake_log)
    monkeypatch.setattr(routes_ask, "over_daily_limit", fake_over)
    return state


def test_ask_streams_tokens_then_citations_then_done(
    client: TestClient, stub_pipeline: dict[str, Any]
) -> None:
    r = client.post("/api/ask", json={"question": "Apa kewajibannya?"})
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/event-stream")
    events = _parse_sse(r.text)
    names = [n for n, _ in events]
    assert names[-1] == "done" and names[-2] == "citations" and set(names[:-2]) == {"token"}
    assert (
        "".join(d["text"] for n, d in events if n == "token")
        == stub_pipeline["result"].answer.answer
    )
    cites = dict(events)["citations"]
    assert (
        cites[0]["chunk_id"] == "D2-P2"
        and cites[0]["ref"] == "Pasal 2"
        and cites[0]["page_start"] == 5
    )
    done = dict(events)["done"]
    assert done["query_id"] == 42 and done["badge"] == "supported" and done["config"] == "M1"
    logged = stub_pipeline["logged"][0]
    assert logged["question"] == "Apa kewajibannya?" and logged["cost_usd"] == 0.001
    assert "ip" not in logged  # questions are stored anonymously


def test_ask_abstain_badge_not_found(client: TestClient, stub_pipeline: dict[str, Any]) -> None:
    stub_pipeline["result"] = _result(abstained=True, reason="insufficient_context")
    done = dict(_parse_sse(client.post("/api/ask", json={"question": "Harga tiket Bali?"}).text))[
        "done"
    ]
    assert done["badge"] == "not_found" and done["abstained"] is True


def test_ask_agentic_emits_live_steps(client: TestClient, stub_pipeline: dict[str, Any]) -> None:
    r = client.post("/api/ask", json={"question": "Pertanyaan lintas pasal?", "mode": "agentic"})
    events = _parse_sse(r.text)
    names = [n for n, _ in events]
    assert names[0] == "agent_steps" and names[-1] == "done"
    assert dict(events)["agent_steps"]["tool"] == "search_regulations"
    assert dict(events)["done"]["config"] == "M3"


def test_ask_pipeline_error_becomes_error_event(
    client: TestClient, stub_pipeline: dict[str, Any]
) -> None:
    stub_pipeline["raise"] = RuntimeError("boom")
    events = _parse_sse(client.post("/api/ask", json={"question": "Pertanyaan apa saja"}).text)
    assert [n for n, _ in events] == ["error"]
    assert "boom" not in json.dumps(events)  # internal detail is not leaked


def test_ask_validation_and_limits(client: TestClient, stub_pipeline: dict[str, Any]) -> None:
    assert client.post("/api/ask", json={"question": "a"}).status_code == 422
    bad = client.post("/api/ask", json={"question": "valid question?", "config_id": "B0"})
    assert bad.status_code == 422
    stub_pipeline["over"] = True
    over = client.post("/api/ask", json={"question": "valid question?"})
    assert over.status_code == 429 and "biaya" in over.json()["detail"]


def test_ask_requires_llm_configuration(client: TestClient, stub_pipeline: dict[str, Any]) -> None:
    app.dependency_overrides[get_settings] = lambda: Settings(_env_file=None)
    assert client.post("/api/ask", json={"question": "valid question?"}).status_code == 503


def test_ask_rate_limited(client: TestClient, stub_pipeline: dict[str, Any]) -> None:
    app.state.ask_limiter = SlidingWindowLimiter(1)
    assert client.post("/api/ask", json={"question": "valid question?"}).status_code == 200
    assert client.post("/api/ask", json={"question": "valid question?"}).status_code == 429


def test_text_pieces_split_on_word_boundaries_and_roundtrip() -> None:
    from app.api.routes_ask import text_pieces

    text = "Pemilik Instalasi Tenaga Listrik bertanggung jawab terhadap penerapan SMK2 [1].\nBaris baru."
    pieces = text_pieces(text, size=24)
    assert "".join(pieces) == text and len(pieces) > 2
    # every piece except the last ends on whitespace, i.e. no word is cut in the middle
    assert all(p[-1].isspace() for p in pieces[:-1])
    assert all(len(p) <= 40 for p in pieces)
    assert text_pieces("") == [] and text_pieces("satu", 24) == ["satu"]
