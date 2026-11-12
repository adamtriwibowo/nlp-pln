from app.ingest.chunker import chunk_unit, chunk_units, count_tokens, reflow, split_ayat
from app.ingest.legal_parser import parse_legal_id
from app.ingest.models import Line, Unit
from tests.helpers import lines_from_pages
from tests.test_legal_parser import EXCERPT


def _unit(lines: list[Line], key: str = "P9") -> Unit:
    return Unit(kind="pasal", key=key, label=f"Pasal {key[1:]}", lines=lines)


def test_reflow_keeps_items_and_joins_wrapped_lines() -> None:
    res = parse_legal_id(lines_from_pages(EXCERPT))
    p2 = next(u for u in res.units if u.key == "P2")
    text = reflow(p2.lines)
    assert "(1) Setiap kegiatan usaha ketenagalistrikan wajib memenuhi Keselamatan" in text
    assert "\na. pemenuhan standardisasi" in text


def test_hyphen_at_line_end_joined_without_space() -> None:
    res = parse_legal_id(lines_from_pages(EXCERPT))
    p1 = next(u for u in res.units if u.key == "P1")
    assert "saluran-saluran" in reflow(p1.lines)


def test_split_ayat_only_accepts_consecutive_numbers() -> None:
    lines = lines_from_pages("(1) satu\nlanjut\n(2) dua\npada\n(7) bukan ayat baru\n(3) tiga\n")
    segs = split_ayat(lines)
    assert [n for n, _ in segs] == [1, 2, 3]
    assert any("(7) bukan" in ln.text for ln in segs[1][1])


def test_short_pasal_single_chunk_with_stable_id_and_bbox() -> None:
    res = parse_legal_id(lines_from_pages(EXCERPT))
    chunks = chunk_units("D9", res.units, "id", True)
    ids = [c.chunk_id for c in chunks]
    assert "D9-P2" in ids and len(ids) == len(set(ids))
    p2 = next(c for c in chunks if c.chunk_id == "D9-P2")
    assert (p2.page_start, p2.page_end) == (1, 2)
    assert {b.page for b in p2.bbox} == {1, 2}
    assert p2.api_allowed is True and p2.n_tokens == count_tokens(p2.text)


def test_long_pasal_splits_per_ayat() -> None:
    words = " ".join(["kata"] * 120)
    text = "\n".join(f"({i}) {words}." for i in range(1, 6))
    unit = _unit(lines_from_pages(text))
    chunks = chunk_unit("D9", unit, "id", True, max_tokens=400)
    assert [c.chunk_id for c in chunks] == [f"D9-P9-A{i}" for i in range(1, 6)]
    assert chunks[2].label == "Pasal 9 ayat (3)"


def test_long_pasal_without_ayat_splits_by_budget() -> None:
    text = "\n".join(f"{i}. " + " ".join(["istilah"] * 60) for i in range(1, 21))
    chunks = chunk_unit("D9", _unit(lines_from_pages(text), "P1"), "id", True, max_tokens=300)
    assert len(chunks) > 1
    assert chunks[0].chunk_id == "D9-P1-S1"
    assert all(c.n_tokens <= 420 for c in chunks)
    assert "1. istilah" in chunks[0].text and "20. istilah" in chunks[-1].text


def test_idempotent_ids_and_text() -> None:
    a = chunk_units("D9", parse_legal_id(lines_from_pages(EXCERPT)).units, "id", True)
    b = chunk_units("D9", parse_legal_id(lines_from_pages(EXCERPT)).units, "id", True)
    assert [(c.chunk_id, c.text) for c in a] == [(c.chunk_id, c.text) for c in b]
