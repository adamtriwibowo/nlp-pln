"""Line cleaning: repeated headers/footers, page numbers, spacing, hyphenation."""

import re

from app.ingest.models import Line

_PAGE_NUMBER = re.compile(r"^[-–—\s]*\d{1,4}[-–—\s]*$")
_LONE_DASH = re.compile(r"^[-–—]+$")
_SPACES = re.compile(r"[ \t ]+")


def normalize_spaces(text: str) -> str:
    return _SPACES.sub(" ", text).strip()


def _fingerprint(text: str) -> str:
    return re.sub(r"\d+", "#", normalize_spaces(text).lower())


def find_repeated_lines(lines: list[Line], min_ratio: float = 0.4, min_pages: int = 3) -> set[str]:
    """Fingerprints of short lines that occur on many pages (running headers/footers)."""
    pages = {ln.page for ln in lines}
    if len(pages) < min_pages:
        return set()
    seen: dict[str, set[int]] = {}
    for ln in lines:
        # list markers such as 'a.' or '(2)' repeat on many pages but are content, not headers
        if 8 <= len(ln.text) <= 110:
            seen.setdefault(_fingerprint(ln.text), set()).add(ln.page)
    threshold = max(min_pages, int(len(pages) * min_ratio))
    return {fp for fp, pg in seen.items() if len(pg) >= threshold}


def clean_lines(lines: list[Line]) -> list[Line]:
    repeated = find_repeated_lines(lines)
    out: list[Line] = []
    for ln in lines:
        text = normalize_spaces(ln.text)
        if not text or _PAGE_NUMBER.match(text) or _LONE_DASH.match(text):
            continue
        if _fingerprint(text) in repeated:
            continue
        out.append(Line(text=text, page=ln.page, bbox=ln.bbox))
    return out


def join_hyphenated(text: str) -> str:
    """Join words split at a line end ('saluran-\\nsaluran' -> 'saluran-saluran')."""
    return re.sub(r"-\n(?=\S)", "-", text)
