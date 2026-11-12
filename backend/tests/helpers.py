import re

from app.ingest.models import Line


def lines_from_pages(text: str) -> list[Line]:
    """Build Lines from text with '=====PAGE n=====' separators (fake bboxes)."""
    page = 1
    out: list[Line] = []
    for i, raw in enumerate(text.strip("\n").splitlines()):
        m = re.match(r"=====PAGE (\d+)=====", raw)
        if m:
            page = int(m.group(1))
            continue
        if raw.strip():
            out.append(
                Line(text=raw.strip(), page=page, bbox=(50.0, 10.0 + 12 * i, 500.0, 20.0 + 12 * i))
            )
    return out
