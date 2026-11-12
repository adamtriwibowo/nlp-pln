from pathlib import Path

from app.ingest.legal_parser import int_to_roman, parse_legal_id, pasal_candidates, roman_to_int
from tests.helpers import lines_from_pages

EXCERPT = (Path(__file__).parent / "fixtures" / "permen_excerpt.txt").read_text(encoding="utf-8")


def test_roman_helpers() -> None:
    assert roman_to_int("XIV") == 14 and int_to_roman(14) == "XIV"
    assert roman_to_int("ABC") is None


def test_structure_hierarchy_and_pasal_order() -> None:
    res = parse_legal_id(lines_from_pages(EXCERPT))
    assert res.pasal_numbers == ["1", "2", "3", "4", "5"]
    by = {u.key: u for u in res.units}
    assert by["P2"].hierarchy["bab"] == "II"
    assert by["P2"].hierarchy["bagian"] == "Kesatu"
    assert by["P2"].hierarchy["bagian_title"] == "Umum"
    assert by["P4"].hierarchy["bagian"] == "Kedua"
    assert by["P5"].hierarchy["bab"] == "III"
    assert res.gaps == []


def test_pasal_spanning_pages_keeps_both_pages() -> None:
    res = parse_legal_id(lines_from_pages(EXCERPT))
    p2 = next(u for u in res.units if u.key == "P2")
    assert {ln.page for ln in p2.lines} == {1, 2}


def test_cross_reference_line_is_not_a_heading() -> None:
    res = parse_legal_id(lines_from_pages(EXCERPT))
    p3 = next(u for u in res.units if u.key == "P3")
    assert any(ln.text.startswith("Pasal 2 ayat (1) huruf a") for ln in p3.lines)
    assert res.pasal_numbers.count("2") == 1


def test_trailer_dropped_and_lampiran_kept() -> None:
    res = parse_legal_id(lines_from_pages(EXCERPT))
    p5 = next(u for u in res.units if u.key == "P5")
    assert all("Ditetapkan" not in ln.text for ln in p5.lines)
    lamp = [u for u in res.units if u.kind == "lampiran"]
    assert len(lamp) == 1 and lamp[0].key == "LI"


def test_ocr_noise_tolerated_and_jumps_only_in_ocr_mode() -> None:
    text = "BAB I\nKETENTUAN UMUM\nPasal 1\nisi satu\nPasa12\nisi dua\nPasa14\nisi empat\n"
    strict = parse_legal_id(lines_from_pages(text), ocr_noisy=False)
    assert strict.pasal_numbers == ["1", "2"]  # 'Pasa14' (jump) rejected when strict
    noisy = parse_legal_id(lines_from_pages(text), ocr_noisy=True)
    assert noisy.pasal_numbers == ["1", "2", "4"] and noisy.gaps == [3]
    assert (2, "") in pasal_candidates("Pasa12")


def test_penjelasan_linked_to_pasal() -> None:
    text = "BAB I\nUMUM\nPasal 1\nisi\nDitetapkan di Jakarta\nPENJELASAN\nPasal 1\nCukup jelas.\n"
    res = parse_legal_id(lines_from_pages(text))
    pj = [u for u in res.units if u.kind == "penjelasan"]
    assert pj and pj[0].key == "P1-PJ" and pj[0].hierarchy["pasal"] == "1"
