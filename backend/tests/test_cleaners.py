from app.ingest.cleaners import clean_lines, find_repeated_lines, join_hyphenated
from app.ingest.models import Line


def _ln(text: str, page: int) -> Line:
    return Line(text=text, page=page, bbox=(0, 0, 1, 1))


def test_repeated_header_and_page_numbers_removed_but_list_markers_kept() -> None:
    lines = []
    for p in range(1, 7):
        lines += [
            _ln("Direktorat Teknik dan Lingkungan Ketenagalistrikan", p),
            _ln(f"- {p} -", p),
            _ln("a.", p),
            _ln(f"isi unik halaman {p}", p),
        ]
    out = [ln.text for ln in clean_lines(lines)]
    assert not any("Direktorat" in t for t in out)
    assert not any(t.startswith("- ") for t in out)
    assert out.count("a.") == 6  # list markers are content
    assert len(find_repeated_lines(lines)) >= 1


def test_no_header_detection_on_short_docs() -> None:
    lines = [_ln("Header panjang yang sama", p) for p in (1, 2)]
    assert len(clean_lines(lines)) == 2


def test_pasal_headings_are_not_treated_as_headers() -> None:
    lines = [_ln(f"Pasal {p}", p) for p in range(1, 9)]
    assert len(clean_lines(lines)) == 8


def test_join_hyphenated_keeps_hyphen() -> None:
    assert join_hyphenated("saluran-\nsaluran") == "saluran-saluran"
