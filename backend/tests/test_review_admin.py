"""Review/admin endpoints against the real dev Postgres inside a rolled-back SAVEPOINT.

Skipped automatically when the database is not reachable."""

import asyncio
import json
import shutil
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

import httpx
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from app.api import routes_admin
from app.api.main import app
from app.api.security import SlidingWindowLimiter
from app.core.config import Settings, get_settings
from app.db.models import ReviewItem, ReviewScore
from app.db.session import get_session
from app.retrieval.factory import CorpusCache
from app.services import admin_service as admin_svc
from app.services import review_service
from app.services.admin_service import JobManager

ROOT = Path(__file__).resolve().parents[2]
SETTINGS = Settings(
    _env_file=None,
    admin_token="admin-secret",
    review_token="review-secret",
    jwt_secret="x" * 40,
)
MINIMAL_PDF = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"


@pytest_asyncio.fixture
async def db() -> AsyncIterator[AsyncSession]:
    engine = create_async_engine(get_settings().database_url, poolclass=NullPool)
    try:
        conn = await engine.connect()
        await conn.execute(text("SELECT 1"))
        await conn.rollback()  # end the autobegun probe transaction before begin()
    except Exception:
        await engine.dispose()
        pytest.skip("dev database not reachable")
    trans = await conn.begin()
    session = AsyncSession(
        bind=conn, join_transaction_mode="create_savepoint", expire_on_commit=False
    )
    try:
        yield session
    finally:
        await session.close()
        await trans.rollback()
        await conn.close()
        await engine.dispose()


@pytest_asyncio.fixture
async def client(db: AsyncSession) -> AsyncIterator[AsyncClient]:
    async def _session() -> AsyncIterator[AsyncSession]:
        yield db

    app.dependency_overrides[get_settings] = lambda: SETTINGS
    app.dependency_overrides[get_session] = _session
    app.state.login_limiter = SlidingWindowLimiter(100)
    app.state.ask_limiter = SlidingWindowLimiter(100)
    app.state.jobs = JobManager()
    app.state.corpus_cache = CorpusCache()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


async def login(c: AsyncClient, token: str, name: str | None = None) -> None:
    r = await c.post("/api/auth/login", json={"token": token, "name": name})
    assert r.status_code == 200, r.text


async def add_items(db: AsyncSession, n: int = 3) -> list[int]:
    items = [
        ReviewItem(
            question=f"Pertanyaan {i}?",
            answer={
                "answer": f"Jawaban {i} [1].",
                "abstained": False,
                "citations": [
                    {"label": 1, "chunk_id": "D2-P2", "quote": "kutipan", "ref": "Pasal 2"}
                ],
            },
            config_id="M1",
            run_id="runx",
            question_id=f"q{i}",
        )
        for i in range(n)
    ]
    db.add_all(items)
    await db.flush()
    return [i.item_id for i in items]


SCORE = {"correctness": 4, "completeness": 3, "usefulness": 5, "citation_ok": True, "comment": "ok"}


# ---- access control --------------------------------------------------------------------


@pytest.mark.asyncio
async def test_endpoints_require_login_and_correct_role(client: AsyncClient) -> None:
    assert (await client.get("/api/review/items")).status_code == 401
    assert (await client.get("/api/admin/documents")).status_code == 401
    await login(client, "review-secret", "Dr. Budi")
    assert (await client.get("/api/review/items")).status_code == 200
    for method, path in (
        ("GET", "/api/admin/documents"),
        ("POST", "/api/admin/reindex"),
        ("GET", "/api/admin/eval-runs"),
    ):
        assert (await client.request(method, path)).status_code == 403, path


@pytest.mark.asyncio
async def test_reviewer_login_requires_a_valid_name(client: AsyncClient) -> None:
    for bad in (None, "", "a", "x" * 70, "<script>"):
        r = await client.post("/api/auth/login", json={"token": "review-secret", "name": bad})
        assert r.status_code == 422, bad
    await login(client, "admin-secret")  # admin does not need a name
    assert (await client.get("/api/auth/me")).json() == {"role": "admin", "name": None}


# ---- review ----------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_review_items_are_blinded_and_in_order(client: AsyncClient, db: AsyncSession) -> None:
    ids = await add_items(db)
    await login(client, "review-secret", "Ani Penilai")
    body = (await client.get("/api/review/items")).json()
    assert body["item"]["item_id"] == ids[0]
    assert body["progress"] == {"done": 0, "total": len(ids)}
    dump = json.dumps(body)
    assert "config" not in dump and "M1" not in dump and "run" not in dump


@pytest.mark.asyncio
async def test_score_is_idempotent_and_advances(client: AsyncClient, db: AsyncSession) -> None:
    ids = await add_items(db)
    await login(client, "review-secret", "Ani Penilai")
    r1 = await client.post("/api/review/scores", json={"item_id": ids[0], **SCORE})
    assert r1.status_code == 201 and r1.json()["progress"]["done"] == 1
    r2 = await client.post(
        "/api/review/scores",
        json={"item_id": ids[0], **SCORE, "correctness": 1, "comment": "revisi"},
    )
    assert r2.json()["progress"]["done"] == 1  # same (item, reviewer): updated, not duplicated
    rows = (
        (await db.execute(select(ReviewScore).where(ReviewScore.item_id == ids[0]))).scalars().all()
    )
    assert len(rows) == 1 and rows[0].correctness == 1 and rows[0].comment == "revisi"
    assert rows[0].reviewer == "Ani Penilai"
    nxt = (await client.get("/api/review/items")).json()
    assert nxt["item"]["item_id"] == ids[1]
    # a different reviewer still sees the first item
    await login(client, "review-secret", "Budi Penilai")
    assert (await client.get("/api/review/items")).json()["item"]["item_id"] == ids[0]


@pytest.mark.asyncio
async def test_score_validation_and_unknown_item(client: AsyncClient, db: AsyncSession) -> None:
    ids = await add_items(db, 1)
    await login(client, "review-secret", "Ani Penilai")
    assert (
        await client.post("/api/review/scores", json={"item_id": ids[0], **SCORE, "usefulness": 6})
    ).status_code == 422
    assert (
        await client.post("/api/review/scores", json={"item_id": ids[0], **SCORE, "correctness": 0})
    ).status_code == 422
    assert (
        await client.post("/api/review/scores", json={"item_id": 999999, **SCORE})
    ).status_code == 404


@pytest.mark.asyncio
async def test_done_state_returns_no_item(client: AsyncClient, db: AsyncSession) -> None:
    ids = await add_items(db, 1)
    await login(client, "review-secret", "Ani Penilai")
    await client.post("/api/review/scores", json={"item_id": ids[0], **SCORE})
    body = (await client.get("/api/review/items")).json()
    assert body["item"] is None and body["progress"] == {"done": 1, "total": 1}


@pytest.mark.asyncio
async def test_csv_export_scopes_and_hides_config_for_reviewers(
    client: AsyncClient, db: AsyncSession
) -> None:
    ids = await add_items(db, 2)
    await login(client, "review-secret", "Ani Penilai")
    await client.post("/api/review/scores", json={"item_id": ids[0], **SCORE})
    await login(client, "review-secret", "Budi Penilai")
    await client.post("/api/review/scores", json={"item_id": ids[1], **SCORE})
    mine = (await client.get("/api/review/export.csv")).text
    assert "Budi Penilai" in mine and "Ani Penilai" not in mine and "config_id" not in mine
    await login(client, "admin-secret")
    everything = (await client.get("/api/review/export.csv")).text
    assert (
        "Budi Penilai" in everything and "Ani Penilai" in everything and "config_id" in everything
    )


@pytest.mark.asyncio
async def test_seed_from_runs_is_blinded_and_idempotent(db: AsyncSession, tmp_path: Path) -> None:
    run = tmp_path / "20261114-000000_M1_dev_gen"
    run.mkdir()
    (run / "config.json").write_text(json.dumps({"config": {"id": "M1"}}), encoding="utf-8")
    row = {
        "question_id": "q1",
        "question": "Siapa yang bertanggung jawab atas SMK2?",
        "answer": {
            "answer": "Pemilik instalasi [1].",
            "abstained": False,
            "citations": [{"label": 1, "chunk_id": "D2-P35", "quote": "bertanggung jawab"}],
        },
    }
    (run / "results.jsonl").write_text(json.dumps(row) + "\n", encoding="utf-8")
    assert await review_service.seed_from_runs(db, [run], n=5) == (1, 0)
    assert await review_service.seed_from_runs(db, [run], n=5) == (0, 1)
    item = await review_service.next_item(db, "Ani Penilai")
    assert item is not None and "config" not in json.dumps(item)
    cite = item["answer"]["citations"][0]
    assert cite["ref"] == "Pasal 35" and "SMK2" in cite["text"]  # real chunk text, for verification


# ---- admin -----------------------------------------------------------------------------


@pytest.fixture
def admin_paths(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> tuple[Path, Path]:
    manifest = tmp_path / "manifest.yaml"
    shutil.copy(ROOT / "data" / "manifest.yaml", manifest)
    raw = tmp_path / "raw"
    raw.mkdir()
    monkeypatch.setattr(routes_admin, "MANIFEST", manifest)
    monkeypatch.setattr(routes_admin, "RAW_DIR", raw)
    return manifest, raw


FORM = {
    "title": "Pedoman Uji Coba Unggahan",
    "publisher": "Uji",
    "lang": "id",
    "parser": "legal_id",
}


def pdf_file(name: str = "x.pdf", data: bytes = MINIMAL_PDF) -> dict[str, Any]:
    return {"file": (name, data, "application/pdf")}


@pytest.mark.asyncio
async def test_upload_rejects_non_pdf_and_oversize(
    client: AsyncClient, admin_paths: tuple[Path, Path], monkeypatch: pytest.MonkeyPatch
) -> None:
    await login(client, "admin-secret")
    bad = await client.post(
        "/api/admin/documents", data=FORM, files=pdf_file(data=b"MZ\x90not a pdf")
    )
    assert bad.status_code == 422 and "PDF" in bad.json()["detail"]
    monkeypatch.setattr(admin_svc, "MAX_UPLOAD_BYTES", 100)
    big = await client.post(
        "/api/admin/documents", data=FORM, files=pdf_file(data=MINIMAL_PDF + b"0" * 500)
    )
    assert big.status_code == 413
    assert list(admin_paths[1].iterdir()) == []  # nothing written for rejected uploads


@pytest.mark.asyncio
async def test_upload_sanitizes_name_defaults_to_not_api_allowed(
    client: AsyncClient, admin_paths: tuple[Path, Path]
) -> None:
    manifest, raw = admin_paths
    await login(client, "admin-secret")
    r = await client.post(
        "/api/admin/documents", data=FORM, files=pdf_file(name="../../../evil.pdf")
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["id"] == "D7" and body["api_allowed"] is False  # D1..D6 exist in the manifest
    saved = list(raw.iterdir())
    assert [p.name for p in saved] == [body["file"]] and body["file"].startswith("D7_pedoman_uji")
    assert ".." not in body["file"] and "/" not in body["file"] and "evil" not in body["file"]
    from app.ingest.pipeline import load_manifest

    entry = next(e for e in load_manifest(manifest) if e.id == "D7")
    assert entry.api_allowed is False and entry.file == body["file"]
    listing = (await client.get("/api/admin/documents")).json()
    d7 = next(d for d in listing if d["id"] == "D7")
    assert d7["file_present"] and not d7["ingested"] and d7["chunks"] == 0
    # a second upload gets the next id
    again = await client.post("/api/admin/documents", data=FORM, files=pdf_file())
    assert again.json()["id"] == "D8"


@pytest.mark.asyncio
async def test_reindex_allows_only_one_job_at_a_time(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    gate = asyncio.Event()

    async def slow_work(job: admin_svc.Job, settings: Settings, on_done: Any) -> None:
        job.log.append("mulai")
        await gate.wait()
        job.log.append("selesai")

    monkeypatch.setattr(admin_svc, "reindex_work", slow_work)
    await login(client, "admin-secret")
    first = await client.post("/api/admin/reindex")
    assert first.status_code == 202
    job_id = first.json()["id"]
    assert (await client.post("/api/admin/reindex")).status_code == 409
    await asyncio.sleep(0.05)
    running = (await client.get(f"/api/admin/jobs/{job_id}")).json()
    assert running["status"] == "running" and running["log"] == ["mulai"]
    gate.set()
    for _ in range(50):
        done = (await client.get(f"/api/admin/jobs/{job_id}")).json()
        if done["status"] == "done":
            break
        await asyncio.sleep(0.02)
    assert done["status"] == "done" and done["log"][-1] == "selesai"
    assert (await client.post("/api/admin/reindex")).status_code == 202  # a new job is allowed now
    assert (await client.get("/api/admin/jobs/doesnotexist")).status_code == 404


@pytest.mark.asyncio
async def test_failed_job_reports_error_without_crashing(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def boom(job: admin_svc.Job, settings: Settings, on_done: Any) -> None:
        raise RuntimeError("kunci API tidak ada")

    monkeypatch.setattr(admin_svc, "reindex_work", boom)
    await login(client, "admin-secret")
    job_id = (await client.post("/api/admin/reindex")).json()["id"]
    for _ in range(50):
        st = (await client.get(f"/api/admin/jobs/{job_id}")).json()
        if st["status"] != "running" and st["status"] != "queued":
            break
        await asyncio.sleep(0.02)
    assert st["status"] == "failed" and "kunci API" in st["error"]


@pytest.mark.asyncio
async def test_eval_runs_listing(client: AsyncClient, db: AsyncSession) -> None:
    from app.db.models import EvalRun

    db.add(
        EvalRun(
            run_id="t_M1_dev", config="M1", corpus_version="v", models={}, metrics={"all": {"n": 1}}
        )
    )
    await db.flush()
    await login(client, "admin-secret")
    runs = (await client.get("/api/admin/eval-runs")).json()
    assert any(r["run_id"] == "t_M1_dev" and r["metrics"]["all"]["n"] == 1 for r in runs)


def test_slugify_and_next_id_helpers() -> None:
    assert (
        admin_svc.slugify("Peraturan Menteri: K3 Listrik (2015)!")
        == "peraturan_menteri_k3_listrik_2015"
    )
    assert admin_svc.slugify("../../etc/passwd") == "etc_passwd"
    assert admin_svc.slugify("日本語") == "dokumen"
    assert (
        admin_svc.next_doc_id(["D1", "D9", "D10", "X"]) == "D11"
        and admin_svc.next_doc_id([]) == "D1"
    )
    with pytest.raises(admin_svc.UploadError):
        admin_svc.validate_pdf_header(b"<html>")
    assert httpx.__version__  # keep httpx import used for transport typing
