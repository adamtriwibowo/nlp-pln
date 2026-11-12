import json
from pathlib import Path

import pytest

from app.retrieval.dense import build_query
from app.retrieval.embeddings import CachedQueryEmbedder, text_sha
from app.services.index_service import embedding_text, select_wanted


def test_build_query_uses_hnsw_expression_for_default_model_only() -> None:
    q = build_query("baai/bge-m3", 1024, ["lampiran"])
    assert "e.vector::vector(1024)" in q and "model = 'baai/bge-m3'" in q
    assert ":excl" in q and "LIMIT :n" in q and "LIMIT :k" in q
    other = build_query("qwen/qwen3-embedding-8b", 4096, [])
    assert "::vector(1024)" not in other and ":excl" not in other


def test_build_query_rejects_unsafe_model_names() -> None:
    with pytest.raises(ValueError):
        build_query("x'; DROP TABLE chunks; --", 1024, [])


def test_text_sha_changes_with_text_and_embedding_text_includes_label() -> None:
    assert text_sha("a") != text_sha("b") and text_sha("a") == text_sha("a")
    assert embedding_text("Pasal 3", "isi") == "Pasal 3\nisi"


def test_privacy_only_api_allowed_chunks_go_to_external_api() -> None:
    rows = [
        ("D1-P1", "teks satu", {"label": "Pasal 1", "api_allowed": True}, True),
        ("D7-P1", "teks internal", {"label": "SOP 1", "api_allowed": False}, False),
        ("D8-P1", "doc ok chunk not", {"label": "x", "api_allowed": False}, True),
    ]
    wanted, skipped = select_wanted(rows, external_api=True)
    assert list(wanted) == ["D1-P1"] and skipped == 2
    local, skipped_local = select_wanted(rows, external_api=False)
    assert len(local) == 3 and skipped_local == 0


class FakeProvider:
    model = "fake/model"

    def __init__(self) -> None:
        self.calls = 0

    async def embed(self, texts: list[str], *, is_query: bool = False) -> list[list[float]]:
        self.calls += 1
        return [[float(len(t)), 1.0] for t in texts]


@pytest.mark.asyncio
async def test_query_embedding_cache_hits_disk(tmp_path: Path) -> None:
    path = tmp_path / "cache.json"
    prov = FakeProvider()
    emb = CachedQueryEmbedder(prov, path)
    v1 = await emb.embed_query("halo")
    v2 = await emb.embed_query("halo")
    assert v1 == v2 and prov.calls == 1
    prov2 = FakeProvider()
    emb2 = CachedQueryEmbedder(prov2, path)  # new instance reads the file
    assert await emb2.embed_query("halo") == v1 and prov2.calls == 0
    assert "fake/model|" in next(iter(json.loads(path.read_text())))
