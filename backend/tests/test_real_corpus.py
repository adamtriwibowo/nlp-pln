"""Integration checks on the downloaded PDFs (skipped when data/raw is empty, e.g. in CI)."""

from pathlib import Path

import pytest

from app.ingest.pipeline import ingest_document, load_manifest

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw"
ENTRIES = {e.id: e for e in load_manifest(ROOT / "data" / "manifest.yaml")}


def _need(doc: str) -> None:
    f = ENTRIES[doc].file
    if f is None or not (RAW / f).exists():
        pytest.skip(f"{doc} PDF not available")


def test_d2_has_pasal_1_to_52_without_gaps() -> None:
    _need("D2")
    rep, chunks = ingest_document(ENTRIES["D2"], RAW)
    assert rep.pasal_count == 52 and rep.pasal_gaps == []
    assert any(c.chunk_id == "D2-P2" for c in chunks)
    assert all(c.text.strip() for c in chunks)
    assert len({c.chunk_id for c in chunks}) == len(chunks)


def test_d1_ocr_headings_recovered() -> None:
    _need("D1")
    rep, chunks = ingest_document(ENTRIES["D1"], RAW)
    assert rep.pasal_gaps == [] and rep.pasal_count >= 15
    assert all(c.ocr_noisy for c in chunks)


def test_d3_sections_and_d4_not_indexed() -> None:
    _need("D3")
    _, chunks = ingest_document(ENTRIES["D3"], RAW)
    assert any(c.chunk_id.startswith("D3-BABII-ELA") for c in chunks)
    _need("D4")
    rep4, ch4 = ingest_document(ENTRIES["D4"], RAW)
    assert rep4.status == "skipped_not_indexed" and ch4 == []
