"""PDF text extraction with line bounding boxes (PyMuPDF)."""

import statistics
from pathlib import Path

import pymupdf

from app.ingest.models import Line

WORDS_PER_LINE_THRESHOLD = 3.0


def _lines_native(page: pymupdf.Page, page_no: int) -> list[Line]:
    out: list[Line] = []
    for block in page.get_text("dict")["blocks"]:
        for ln in block.get("lines", []):
            text = "".join(span["text"] for span in ln["spans"]).strip()
            if text:
                x0, y0, x1, y1 = ln["bbox"]
                out.append(Line(text=text, page=page_no, bbox=(x0, y0, x1, y1)))
    return out


def _lines_from_words(page: pymupdf.Page, page_no: int) -> list[Line]:
    """Rebuild lines from word boxes (for OCR layers where every word is its own block)."""
    words = [w for w in page.get_text("words") if str(w[4]).strip()]
    if not words:
        return []
    heights = [w[3] - w[1] for w in words]
    tol = max(2.0, statistics.median(heights) * 0.6)
    words.sort(key=lambda w: ((w[1] + w[3]) / 2, w[0]))
    rows: list[list[tuple[float, float, float, float, str]]] = []
    for x0, y0, x1, y1, s, *_ in words:
        yc = (y0 + y1) / 2
        if rows and abs(yc - _row_center(rows[-1])) <= tol:
            rows[-1].append((x0, y0, x1, y1, s))
        else:
            rows.append([(x0, y0, x1, y1, s)])
    out: list[Line] = []
    for row in rows:
        row.sort(key=lambda w: w[0])
        text = " ".join(w[4] for w in row).strip()
        bbox = (
            min(w[0] for w in row),
            min(w[1] for w in row),
            max(w[2] for w in row),
            max(w[3] for w in row),
        )
        out.append(Line(text=text, page=page_no, bbox=bbox))
    return out


def _row_center(row: list[tuple[float, float, float, float, str]]) -> float:
    return statistics.fmean((w[1] + w[3]) / 2 for w in row)


def _median_words_per_line(lines: list[Line]) -> float:
    if not lines:
        return 0.0
    return statistics.median(len(ln.text.split()) for ln in lines)


def extract_lines(path: Path, strategy: str = "auto") -> tuple[list[Line], dict[str, int | str]]:
    """Extract all lines of a PDF. Returns (lines, info) with page and empty-page counts."""
    doc = pymupdf.open(path)
    all_lines: list[Line] = []
    empty_pages: list[int] = []
    used = strategy
    native_all = [_lines_native(doc[i], i + 1) for i in range(len(doc))]
    if strategy == "auto":
        flat = [ln for page in native_all for ln in page]
        used = (
            "words_by_line" if _median_words_per_line(flat) < WORDS_PER_LINE_THRESHOLD else "lines"
        )
    for i, native in enumerate(native_all):
        page_lines = _lines_from_words(doc[i], i + 1) if used == "words_by_line" else native
        if sum(len(ln.text) for ln in page_lines) < 50:
            empty_pages.append(i + 1)
        all_lines.extend(page_lines)
    info: dict[str, int | str] = {
        "pages": len(doc),
        "empty_pages": len(empty_pages),
        "strategy": used,
    }
    doc.close()
    return all_lines, info
