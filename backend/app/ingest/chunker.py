"""Turn parsed units into stable, size-bounded chunks with page/bbox metadata."""

import re

from app.ingest.cleaners import join_hyphenated
from app.ingest.models import ChunkRecord, Line, PageBox, Unit

MAX_TOKENS = 400
HARD_MAX_TOKENS = 600  # a single ayat/item larger than this is split further by budget

AYAT_RE = re.compile(r"^\((\d+)\)\s*")
ITEM_START_RE = re.compile(
    r"^(\(\d+\)(?=\s|[A-Z])|\(\d+\)$|[a-z]\.(\s|$)|\d+\.(\s|$)|[ivx]+\.(\s|$))"
)
NUMBERED_ITEM_RE = re.compile(r"^(\d+)\.(\s|$)")


def count_tokens(text: str) -> int:
    """Approximate token count (words + punctuation); stable and model independent."""
    return len(re.findall(r"\w+|[^\w\s]", text))


def reflow(lines: list[Line]) -> str:
    """Join visual lines into paragraphs; items (ayat, a., 1.) start new lines."""
    out: list[str] = []
    for ln in lines:
        t = ln.text
        if not out or ITEM_START_RE.match(t):
            out.append(t)
        elif out[-1].endswith("-"):
            out[-1] += t
        else:
            out[-1] += " " + t
    return join_hyphenated("\n".join(out))


def _page_boxes(lines: list[Line]) -> list[PageBox]:
    boxes: dict[int, list[float]] = {}
    for ln in lines:
        x0, y0, x1, y1 = ln.bbox
        b = boxes.setdefault(ln.page, [x0, y0, x1, y1])
        b[0], b[1], b[2], b[3] = min(b[0], x0), min(b[1], y0), max(b[2], x1), max(b[3], y1)
    return [
        PageBox(page=p, bbox=(round(b[0], 1), round(b[1], 1), round(b[2], 1), round(b[3], 1)))
        for p, b in sorted(boxes.items())
    ]


def split_by_budget(lines: list[Line], max_tokens: int) -> list[list[Line]]:
    """Greedy split at line boundaries, preferring to start groups at item starts."""
    groups: list[list[Line]] = []
    cur: list[Line] = []
    cur_tokens = 0
    for ln in lines:
        t = count_tokens(ln.text)
        if (
            cur
            and cur_tokens + t > max_tokens
            and (ITEM_START_RE.match(ln.text) or cur_tokens > max_tokens * 1.2)
        ):
            groups.append(cur)
            cur, cur_tokens = [], 0
        cur.append(ln)
        cur_tokens += t
    if cur:
        groups.append(cur)
    return groups


def split_ayat(lines: list[Line]) -> list[tuple[int, list[Line]]]:
    """Split on '(1)', '(2)' ... accepting only consecutive numbering (rejects wrapped references)."""
    segments: list[tuple[int, list[Line]]] = []
    expected = 1
    for ln in lines:
        m = AYAT_RE.match(ln.text)
        if m and int(m.group(1)) == expected:
            segments.append((expected, [ln]))
            expected += 1
        elif segments:
            segments[-1][1].append(ln)
        else:
            segments.append((0, [ln]))  # text before the first ayat
    if segments and segments[0][0] == 0 and len(segments) > 1:
        # attach intro text to the first ayat so no text is lost or orphaned
        intro = segments.pop(0)[1]
        segments[0] = (segments[0][0], intro + segments[0][1])
    return segments


def _make(
    doc_id: str,
    unit: Unit,
    suffix: str,
    label: str,
    lines: list[Line],
    lang: str,
    api_allowed: bool,
    extra_hier: dict[str, str] | None = None,
) -> ChunkRecord:
    text = reflow(lines)
    hier = {**unit.hierarchy, **(extra_hier or {})}
    return ChunkRecord(
        chunk_id=f"{doc_id}-{unit.key}{suffix}",
        doc_id=doc_id,
        kind=unit.kind,
        label=label,
        hierarchy=hier,
        page_start=min(ln.page for ln in lines),
        page_end=max(ln.page for ln in lines),
        bbox=_page_boxes(lines),
        text=text,
        n_tokens=count_tokens(text),
        lang=lang,
        api_allowed=api_allowed,
        ocr_noisy=unit.ocr_noisy,
    )


def chunk_unit(
    doc_id: str,
    unit: Unit,
    lang: str,
    api_allowed: bool,
    max_tokens: int = MAX_TOKENS,
) -> list[ChunkRecord]:
    lines = unit.lines
    if not lines:
        return []
    total = sum(count_tokens(ln.text) for ln in lines)
    if total <= max_tokens:
        return [_make(doc_id, unit, "", unit.label, lines, lang, api_allowed)]

    chunks: list[ChunkRecord] = []
    segments = split_ayat(lines) if unit.kind == "pasal" else []
    if len(segments) >= 2:
        for n, seg in segments:
            label = f"{unit.label} ayat ({n})"
            seg_tokens = sum(count_tokens(ln.text) for ln in seg)
            if seg_tokens <= HARD_MAX_TOKENS:
                chunks.append(
                    _make(doc_id, unit, f"-A{n}", label, seg, lang, api_allowed, {"ayat": str(n)})
                )
            else:
                for k, part in enumerate(split_by_budget(seg, max_tokens), 1):
                    chunks.append(
                        _make(
                            doc_id,
                            unit,
                            f"-A{n}-S{k}",
                            f"{label} (bagian {k})",
                            part,
                            lang,
                            api_allowed,
                            {"ayat": str(n)},
                        )
                    )
        return chunks

    for k, part in enumerate(split_by_budget(lines, max_tokens), 1):
        chunks.append(
            _make(doc_id, unit, f"-S{k}", f"{unit.label} (bagian {k})", part, lang, api_allowed)
        )
    return chunks


def chunk_units(doc_id: str, units: list[Unit], lang: str, api_allowed: bool) -> list[ChunkRecord]:
    out: list[ChunkRecord] = []
    for u in units:
        out.extend(chunk_unit(doc_id, u, lang, api_allowed))
    ids = [c.chunk_id for c in out]
    dup = {i for i in ids if ids.count(i) > 1}
    if dup:
        raise ValueError(f"duplicate chunk_ids in {doc_id}: {sorted(dup)[:5]}")
    return out
