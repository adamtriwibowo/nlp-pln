"""Admin lab endpoints (dataset, playground, config, eval jobs) on the real dev Postgres inside a
rolled-back SAVEPOINT, with qa.jsonl redirected to a temp dir. No network, no LLM calls."""

import asyncio
import json
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.schemas import Citation, CitedAnswer, ContextChunk
from app.api.main import app
from app.api.security import SlidingWindowLimiter
from app.core.config import Settings, get_settings
from app.db.models import Query
from app.db.session import get_session
from app.retrieval.base import load_config
from app.retrieval.factory import CorpusCache, build_retriever
from app.services import admin_service as admin_svc
from app.services import lab_service as lab
from app.services.admin_service import JobManager
from app.services.ask_service import AskResult
from app.services.qa_store import QAStore
from tests import test_review_admin as _base
from tests.test_review_admin import login

db = _base.db  # re-use the SAVEPOINT database fixture

BASE = dict(
    _env_file=None,
    admin_token="admin-secret",
    review_token="review-secret",
    jwt_secret="x" * 40,
)


def make_settings(qa_dir: Path, **extra: Any) -> Settings:
    return Settings(**BASE, eval_dir=str(qa_dir), **extra)


@pytest.fixture
def qa_dir(tmp_path: Path) -> Path:
    d = tmp_path / "eval"
    d.mkdir()
    return d


@pytest_asyncio.fixture
async def lab_client(db: AsyncSession, qa_dir: Path) -> AsyncIterator[AsyncClient]:
    async def _session() -> AsyncIterator[AsyncSession]:
        yield db

    state = {"settings": make_settings(qa_dir)}
    app.dependency_overrides[get_settings] = lambda: state["settings"]
    app.dependency_overrides[get_session] = _session
    app.state.login_limiter = SlidingWindowLimiter(1000)
    app.state.ask_limiter = SlidingWindowLimiter(1000)
    app.state.jobs = JobManager()
    app.state.corpus_cache = CorpusCache()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        c.state = state  # type: ignore[attr-defined]
        yield c
    app.dependency_overrides.clear()


def item(qid: str = "q001", **kw: Any) -> dict[str, Any]:
    base = {
        "id": qid,
        "question": "Apa syarat pengoperasian instalasi tenaga listrik?",
        "reference_answer": "Harus memiliki sertifikat laik operasi.",
        "gold_chunk_ids": ["D2-P18"],
        "type": "factual",
        "split": "dev",
        "source_note": "Permen ESDM 10/2021 Pasal 18",
    }
    base.update(kw)
    return base


# ---- access ----------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_lab_endpoints_are_admin_only(lab_client: AsyncClient) -> None:
    calls = [
        ("GET", "/api/admin/qa"),
        ("POST", "/api/admin/qa"),
        ("POST", "/api/admin/qa/freeze"),
        ("GET", "/api/admin/qa/candidates?q=sertifikat"),
        ("POST", "/api/admin/playground"),
        ("GET", "/api/admin/config"),
        ("POST", "/api/admin/evals"),
    ]
    for method, path in calls:
        assert (await lab_client.request(method, path)).status_code == 401, path
    await login(lab_client, "review-secret", "Dr. Budi")
    for method, path in calls:
        assert (await lab_client.request(method, path)).status_code == 403, path


# ---- dataset ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_dataset_crud_validation_and_file(lab_client: AsyncClient, qa_dir: Path) -> None:
    await login(lab_client, "admin-secret")
    empty = (await lab_client.get("/api/admin/qa")).json()
    assert empty["items"] == [] and empty["next_id"] == "q001" and empty["stats"]["total"] == 0
    assert empty["stats"]["target_min"] == 60 and empty["frozen"] is None

    r = await lab_client.post("/api/admin/qa", json=item())
    assert r.status_code == 201 and r.json()["stats"]["by_split"] == {"dev": 1, "test": 0}
    assert r.json()["next_id"] == "q002"
    saved = [json.loads(line) for line in (qa_dir / "qa.jsonl").read_text("utf-8").splitlines()]
    assert saved == [item()]

    dup = await lab_client.post("/api/admin/qa", json=item())
    assert dup.status_code == 422 and "sudah dipakai" in dup.json()["detail"]
    unknown = await lab_client.post("/api/admin/qa", json=item("q002", gold_chunk_ids=["D9-P99"]))
    assert unknown.status_code == 422 and "D9-P99" in unknown.json()["detail"]
    bad_id = await lab_client.post("/api/admin/qa", json=item("../etc"))
    assert bad_id.status_code == 422
    unans = await lab_client.post("/api/admin/qa", json=item("q003", type="unanswerable"))
    assert unans.status_code == 422  # unanswerable must have empty gold ids (schema rule)
    ok_unans = await lab_client.post(
        "/api/admin/qa", json=item("q003", type="unanswerable", gold_chunk_ids=[])
    )
    assert ok_unans.status_code == 201

    upd = await lab_client.put("/api/admin/qa/q001", json=item(reference_answer="Diperbarui."))
    assert upd.status_code == 200
    assert (
        next(i for i in upd.json()["items"] if i["id"] == "q001")["reference_answer"]
        == "Diperbarui."
    )
    assert (await lab_client.put("/api/admin/qa/q001", json=item("q777"))).status_code == 422
    assert (await lab_client.put("/api/admin/qa/q999", json=item("q999"))).status_code == 404

    gone = await lab_client.delete("/api/admin/qa/q001")
    assert gone.status_code == 200 and [i["id"] for i in gone.json()["items"]] == ["q003"]
    assert (await lab_client.delete("/api/admin/qa/q001")).status_code == 404
    exported = await lab_client.get("/api/admin/qa/export")
    assert exported.status_code == 200 and json.loads(exported.text.splitlines()[0])["id"] == "q003"


@pytest.mark.asyncio
async def test_freeze_test_split_protects_it(lab_client: AsyncClient, qa_dir: Path) -> None:
    await login(lab_client, "admin-secret")
    assert (await lab_client.post("/api/admin/qa/freeze")).status_code == 422  # nothing to freeze
    await lab_client.post("/api/admin/qa", json=item("q001", split="test"))
    await lab_client.post("/api/admin/qa", json=item("q002", split="dev"))
    frozen = await lab_client.post("/api/admin/qa/freeze")
    assert frozen.status_code == 200 and frozen.json()["frozen"]["n_test"] == 1
    assert frozen.json()["integrity"] == "ok"
    assert (await lab_client.post("/api/admin/qa/freeze")).status_code == 409  # already frozen

    # every way of touching a test item is refused ...
    assert (
        await lab_client.post("/api/admin/qa", json=item("q003", split="test"))
    ).status_code == 409
    assert (
        await lab_client.put(
            "/api/admin/qa/q001", json=item("q001", split="test", question="Ubah pertanyaan ini?")
        )
    ).status_code == 409
    assert (
        await lab_client.put("/api/admin/qa/q001", json=item("q001", split="dev"))
    ).status_code == 409
    assert (
        await lab_client.put("/api/admin/qa/q002", json=item("q002", split="test"))
    ).status_code == 409
    assert (await lab_client.delete("/api/admin/qa/q001")).status_code == 409
    # ... while the dev split stays editable
    assert (
        await lab_client.put(
            "/api/admin/qa/q002", json=item("q002", question="Pertanyaan dev diubah?")
        )
    ).status_code == 200
    assert (await lab_client.post("/api/admin/qa", json=item("q004"))).status_code == 201
    assert (await lab_client.delete("/api/admin/qa/q004")).status_code == 200

    # tampering with the file behind the API's back is detected
    path = qa_dir / "qa.jsonl"
    rows = [json.loads(line) for line in path.read_text("utf-8").splitlines()]
    for r in rows:
        if r["id"] == "q001":
            r["reference_answer"] = "diubah langsung di berkas"
    path.write_text("\n".join(json.dumps(r) for r in rows) + "\n", encoding="utf-8")
    assert (await lab_client.get("/api/admin/qa")).json()["integrity"] == "modified"


def test_store_helpers() -> None:
    from app.eval.qa_schema import QAItem

    items = [QAItem(**item(f"q{i:03d}", split="test" if i % 2 else "dev")) for i in range(1, 5)]
    assert QAStore.stats(items)["by_split"] == {"dev": 2, "test": 2}
    a = QAStore.test_hash(items)
    assert a == QAStore.test_hash(list(reversed(items)))  # order independent
    items[0] = QAItem(**item("q001", split="test", reference_answer="lain"))
    assert QAStore.test_hash(items) != a
    assert QAStore(Path("x")).next_id(items) == "q005"


# ---- candidates and playground ----------------------------------------------------------


@pytest.fixture
def bm25_only(monkeypatch: pytest.MonkeyPatch) -> None:
    """Avoid the embeddings API: serve every retrieval request with BM25 (config B1)."""

    async def fake(cfg: Any, session: AsyncSession, settings: Settings, cache: CorpusCache) -> Any:
        return await build_retriever(load_config("B1"), session, settings, cache)

    monkeypatch.setattr(lab, "_retriever", fake)


@pytest.mark.asyncio
async def test_candidates_return_real_chunks(lab_client: AsyncClient, bm25_only: None) -> None:
    await login(lab_client, "admin-secret")
    r = await lab_client.get(
        "/api/admin/qa/candidates", params={"q": "sertifikat laik operasi", "k": 5}
    )
    assert r.status_code == 200
    rows = r.json()
    assert 1 <= len(rows) <= 5 and rows[0]["rank"] == 1
    assert all({"chunk_id", "ref", "doc_title", "page_start", "snippet"} <= set(x) for x in rows)
    assert "D2-P18" in [x["chunk_id"] for x in rows]
    assert (await lab_client.get("/api/admin/qa/candidates", params={"q": "ab"})).status_code == 422


@pytest.mark.asyncio
async def test_playground_retrieval_only_ranks_and_finds_gold(lab_client: AsyncClient) -> None:
    await login(lab_client, "admin-secret")
    body = {
        "question": "sertifikat laik operasi sebelum instalasi dioperasikan",
        "config_id": "B1",
        "gold_chunk_ids": ["D2-P18", "D2-P99"],
    }
    r = await lab_client.post("/api/admin/playground", json=body)
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["generated"] is False and out["answer"] is None and out["usage"] is None
    ranks = [x["rank"] for x in out["ranking"]]
    assert ranks == sorted(ranks) and len(ranks) <= 10
    gold = out["gold"]
    assert gold["found"]["D2-P99"] is None and gold["found"]["D2-P18"] is not None
    assert gold["best_rank"] == gold["found"]["D2-P18"]
    assert any(x["is_gold"] and x["chunk_id"] == "D2-P18" for x in out["ranking"])
    assert all("api_allowed" in x and x["snippet"] for x in out["ranking"])


@pytest.mark.asyncio
async def test_playground_errors(lab_client: AsyncClient) -> None:
    await login(lab_client, "admin-secret")
    nope = await lab_client.post(
        "/api/admin/playground", json={"question": "apa saja ini", "config_id": "Z9"}
    )
    assert nope.status_code == 404
    no_llm = await lab_client.post(
        "/api/admin/playground", json={"question": "apa saja ini", "config_id": "B0"}
    )
    assert no_llm.status_code == 503 and "LLM" in no_llm.json()["detail"]
    assert (
        await lab_client.post("/api/admin/playground", json={"question": "a", "config_id": "B1"})
    ).status_code == 422


@pytest.mark.asyncio
async def test_playground_generation_verifies_citations_and_logs_cost(
    lab_client: AsyncClient,
    db: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    bm25_only: None,
) -> None:
    lab_client.state["settings"] = make_settings(  # type: ignore[attr-defined]
        Path(lab_client.state["settings"].eval_dir),  # type: ignore[attr-defined]
        llm_model="vendor/model",
        judge_model="vendor/judge",
        openrouter_api_key="sk-test",
    )
    text = "Pengoperasian instalasi dilakukan setelah memiliki sertifikat laik operasi."
    chunk = ContextChunk(
        label=1,
        chunk_id="D2-P18",
        doc_id="D2",
        doc_title="Permen",
        ref="Pasal 18",
        text=text,
        page_start=14,
        api_allowed=True,
    )

    async def fake_answer(question: str, cfg: Any, **kw: Any) -> AskResult:
        return AskResult(
            answer=CitedAnswer(
                answer="Wajib punya SLO [1][2].",
                citations=[
                    Citation(
                        label=1, chunk_id="D2-P18", quote="setelah memiliki sertifikat laik operasi"
                    ),
                    Citation(label=2, chunk_id="D2-P18", quote="kutipan karangan yang tidak ada"),
                    Citation(label=3, chunk_id="D2-P77", quote="tidak ada di konteks"),
                ],
                confidence=0.9,
            ),
            context=[chunk],
            model="vendor/model",
            config_id="B1",
            input_tokens=100,
            output_tokens=20,
            cost_usd=0.0007,
            latency_ms=900,
        )

    monkeypatch.setattr(lab, "answer_question", fake_answer)
    await login(lab_client, "admin-secret")
    r = await lab_client.post(
        "/api/admin/playground",
        json={
            "question": "Kapan instalasi boleh dioperasikan?",
            "config_id": "B1",
            "generate": True,
            "gold_chunk_ids": ["D2-P18"],
        },
    )
    assert r.status_code == 200, r.text
    out = r.json()
    cites = {c["label"]: c for c in out["answer"]["citations"]}
    assert (
        cites[1]["quote_verified"] is True
        and cites[1]["in_context"] is True
        and cites[1]["is_gold"]
    )
    assert cites[2]["quote_verified"] is False and cites[2]["in_context"] is True
    assert cites[3]["in_context"] is False and cites[3]["quote_verified"] is False
    assert out["usage"]["cost_usd"] == 0.0007 and out["generated"] is True
    row = (await db.execute(select(Query).where(Query.mode == "playground"))).scalars().one()
    assert row.config_id == "B1" and row.cost_usd == pytest.approx(0.0007)


# ---- config and evaluation jobs ---------------------------------------------------------


@pytest.mark.asyncio
async def test_config_is_read_only_and_never_leaks_secrets(lab_client: AsyncClient) -> None:
    await login(lab_client, "admin-secret")
    r = await lab_client.get("/api/admin/config")
    assert r.status_code == 200
    out = r.json()
    ids = [c["id"] for c in out["configs"]]
    assert ids == ["B0", "B1", "B2", "M1", "M2", "M3"]
    assert (
        out["secrets_set"]["admin_token"] is True
        and out["secrets_set"]["openrouter_api_key"] is False
    )
    dump = r.text
    for secret in ("admin-secret", "review-secret", "x" * 40):
        assert secret not in dump
    assert out["corpus"]["chunks"] > 0 and out["corpus"]["documents_indexed"] >= 3
    assert out["limits"]["daily_cost_limit_usd"] > 0
    assert any("LLM belum dikonfigurasi" in w for w in out["warnings"])
    assert (await lab_client.put("/api/admin/config", json={})).status_code == 405  # no write path


@pytest.mark.asyncio
async def test_config_warns_when_judge_equals_generator(lab_client: AsyncClient) -> None:
    lab_client.state["settings"] = make_settings(  # type: ignore[attr-defined]
        Path(lab_client.state["settings"].eval_dir),  # type: ignore[attr-defined]
        llm_model="same/model",
        judge_model="same/model",
        openrouter_api_key="k",
    )
    await login(lab_client, "admin-secret")
    out = (await lab_client.get("/api/admin/config")).json()
    assert any("JUDGE_MODEL must differ" in w for w in out["warnings"])


@pytest.mark.asyncio
async def test_eval_requests_are_dev_only_and_validated(lab_client: AsyncClient) -> None:
    await login(lab_client, "admin-secret")
    est = "/api/admin/evals/estimate"
    test_split = await lab_client.post(
        est, json={"config_id": "B1", "kind": "retrieval", "split": "test"}
    )
    assert test_split.status_code == 422 and "dibekukan" in test_split.json()["detail"]
    none_yet = await lab_client.post(
        est, json={"config_id": "B1", "kind": "retrieval", "split": "dev"}
    )
    assert none_yet.status_code == 422 and "Belum ada pertanyaan" in none_yet.json()["detail"]
    await lab_client.post("/api/admin/qa", json=item("q001"))
    await lab_client.post("/api/admin/qa", json=item("q002"))
    ok = await lab_client.post(est, json={"config_id": "B1", "kind": "retrieval", "split": "dev"})
    assert ok.status_code == 200 and ok.json() == {
        "n_questions": 2,
        "est_cost_usd": 0.0,
        "note": ok.json()["note"],
    }
    no_retr = await lab_client.post(
        est, json={"config_id": "B0", "kind": "retrieval", "split": "dev"}
    )
    assert no_retr.status_code == 422
    gen_no_llm = await lab_client.post(
        est, json={"config_id": "M1", "kind": "generation", "split": "dev"}
    )
    assert gen_no_llm.status_code == 422 and "JUDGE_MODEL" in gen_no_llm.json()["detail"]


@pytest.mark.asyncio
async def test_generation_estimate_and_daily_limit(lab_client: AsyncClient) -> None:
    base = Path(lab_client.state["settings"].eval_dir)  # type: ignore[attr-defined]
    llm = dict(llm_model="a/gen", judge_model="b/judge", openrouter_api_key="k")
    lab_client.state["settings"] = make_settings(base, **llm)  # type: ignore[attr-defined]
    await login(lab_client, "admin-secret")
    for i in range(1, 5):
        await lab_client.post("/api/admin/qa", json=item(f"q{i:03d}"))
    r = await lab_client.post(
        "/api/admin/evals/estimate", json={"config_id": "M1", "kind": "generation"}
    )
    assert r.status_code == 200 and r.json()["n_questions"] == 4
    assert r.json()["est_cost_usd"] == pytest.approx(4 * lab.EST_COST_PER_Q["standard"])
    agentic = await lab_client.post(
        "/api/admin/evals/estimate", json={"config_id": "M3", "kind": "generation"}
    )
    assert agentic.json()["est_cost_usd"] == pytest.approx(4 * lab.EST_COST_PER_Q["agentic"])
    lab_client.state["settings"] = make_settings(base, daily_cost_limit_usd=0.001, **llm)  # type: ignore[attr-defined]
    too_much = await lab_client.post(
        "/api/admin/evals/estimate", json={"config_id": "M3", "kind": "generation"}
    )
    assert too_much.status_code == 429 and "batas harian" in too_much.json()["detail"]


@pytest.mark.asyncio
async def test_eval_job_runs_in_background_one_at_a_time(
    lab_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    gate = asyncio.Event()
    calls: list[tuple[str, str, str]] = []

    async def fake_run(
        job: admin_svc.Job, settings: Any, cache: Any, store: Any, cfg: str, kind: str, split: str
    ) -> None:
        calls.append((cfg, kind, split))
        job.log.append("jalan")
        await gate.wait()
        job.log.append("selesai")

    monkeypatch.setattr(lab, "run_eval_job", fake_run)
    await login(lab_client, "admin-secret")
    await lab_client.post("/api/admin/qa", json=item("q001"))
    body = {"config_id": "B1", "kind": "retrieval", "split": "dev"}
    first = await lab_client.post("/api/admin/evals", json=body)
    assert first.status_code == 202
    assert (await lab_client.post("/api/admin/evals", json=body)).status_code == 409
    assert (await lab_client.post("/api/admin/reindex")).status_code == 409  # shares the job slot
    gate.set()
    job_id = first.json()["id"]
    for _ in range(50):
        st = (await lab_client.get(f"/api/admin/jobs/{job_id}")).json()
        if st["status"] == "done":
            break
        await asyncio.sleep(0.02)
    assert (
        st["status"] == "done"
        and st["log"][-1] == "selesai"
        and calls == [("B1", "retrieval", "dev")]
    )
    rejected = await lab_client.post("/api/admin/evals", json={**body, "split": "test"})
    assert rejected.status_code == 422 and len(calls) == 1
