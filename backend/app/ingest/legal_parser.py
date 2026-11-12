"""Parser for Indonesian legal documents (BAB > Bagian > Paragraf > Pasal > Ayat, Penjelasan, Lampiran).

Headings are only accepted when they are the *whole* line and (for Pasal/BAB) when the number
continues the expected sequence. This rejects cross references such as "Pasal 29 huruf b
meliputi:" or a wrapped "Pasal 11" in running text, and tolerates common OCR noise
("Pasa12" for "Pasal 2", "BABX" for "BAB X").
"""

import re
from dataclasses import dataclass, field

from app.ingest.models import Line, Unit

ORDINALS = {
    "kesatu": 1,
    "kedua": 2,
    "ketiga": 3,
    "keempat": 4,
    "kelima": 5,
    "keenam": 6,
    "ketujuh": 7,
    "kedelapan": 8,
    "kesembilan": 9,
    "kesepuluh": 10,
}
_ROMAN = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100}

BAB_RE = re.compile(r"^BAB\s*([IVXLC]+|\d+)$", re.IGNORECASE)
BAGIAN_RE = re.compile(r"^Bagian\s+([A-Za-z]+)$", re.IGNORECASE)
PARAGRAF_RE = re.compile(r"^Paragraf\s+(\d+)$", re.IGNORECASE)
# 'Pasal 2', 'Pasa12' (OCR l->1), 'Pasa113' ... optional trailing letter for inserted articles.
PASAL_RE = re.compile(r"^Pas[a]?[l1I]?\s*(\d{1,3})\s*([A-Z])?$")
PASAL_ALT_RE = re.compile(r"^Pas[a]?\s*(\d{1,3})\s*([A-Z])?$")  # 'l' simply missing
LAMPIRAN_RE = re.compile(r"^LAMPIRAN\s+([IVXLC]+|\d+)\b", re.IGNORECASE)
PENJELASAN_RE = re.compile(r"^PENJELASAN$", re.IGNORECASE)
END_BODY_RE = re.compile(r"^Ditetapkan di\b", re.IGNORECASE)


def roman_to_int(s: str) -> int | None:
    s = s.upper()
    if not s or any(c not in _ROMAN for c in s):
        return None
    total = 0
    for i, c in enumerate(s):
        v = _ROMAN[c]
        total += -v if i + 1 < len(s) and _ROMAN[s[i + 1]] > v else v
    return total


def int_to_roman(n: int) -> str:
    out = ""
    for val, sym in (
        (100, "C"),
        (90, "XC"),
        (50, "L"),
        (40, "XL"),
        (10, "X"),
        (9, "IX"),
        (5, "V"),
        (4, "IV"),
        (1, "I"),
    ):
        while n >= val:
            out += sym
            n -= val
    return out


def pasal_candidates(text: str) -> list[tuple[int, str]]:
    """All plausible (number, suffix) readings of a possible Pasal heading line."""
    out: list[tuple[int, str]] = []
    for rx in (PASAL_RE, PASAL_ALT_RE):
        m = rx.match(text.strip())
        if m:
            cand = (int(m.group(1)), m.group(2) or "")
            if cand not in out:
                out.append(cand)
    return out


def bab_value(token: str) -> int | None:
    return int(token) if token.isdigit() else roman_to_int(token)


@dataclass
class ParseResult:
    units: list[Unit] = field(default_factory=list)
    pasal_numbers: list[str] = field(default_factory=list)
    skipped_pasal_like: list[str] = field(default_factory=list)

    @property
    def gaps(self) -> list[int]:
        nums = sorted({int(re.sub(r"\D", "", n)) for n in self.pasal_numbers})
        if not nums:
            return []
        return [n for n in range(nums[0], nums[-1] + 1) if n not in set(nums)]


def _take_title(lines: list[Line], i: int, upper_only: bool) -> tuple[str, int]:
    """Collect heading title lines following index i. Returns (title, next_index)."""
    title: list[str] = []
    j = i
    while j < len(lines) and len(title) < 3:
        t = lines[j].text
        if _is_structural(t):
            break
        if upper_only and not t.isupper():
            break
        if not upper_only and title and not t[:1].islower():
            break
        title.append(t)
        j += 1
        if not upper_only and not (j < len(lines) and lines[j].text[:1].islower()):
            break
    return " ".join(title), j


def _is_structural(text: str) -> bool:
    return bool(
        BAB_RE.match(text)
        or BAGIAN_RE.match(text)
        or PARAGRAF_RE.match(text)
        or PASAL_RE.match(text)
        or LAMPIRAN_RE.match(text)
        or PENJELASAN_RE.match(text)
        or END_BODY_RE.match(text)
    )


def parse_legal_id(lines: list[Line], ocr_noisy: bool = False) -> ParseResult:
    res = ParseResult()
    hier: dict[str, str] = {}
    last_bab = 0
    last_pasal = 0
    last_suffix = ""
    current: Unit | None = None
    mode = "preamble"  # preamble | body | trailer | penjelasan | lampiran

    def close() -> None:
        nonlocal current
        if current is not None and current.lines:
            res.units.append(current)
        current = None

    i = 0
    while i < len(lines):
        ln = lines[i]
        text = ln.text

        if PENJELASAN_RE.match(text) and mode in ("body", "trailer"):
            close()
            mode = "penjelasan"
            i += 1
            continue

        m_lamp = LAMPIRAN_RE.match(text)
        if m_lamp and text.upper() == text and mode in ("body", "trailer", "lampiran"):
            close()
            mode = "lampiran"
            num = m_lamp.group(1).upper()
            current = Unit(
                kind="lampiran",
                key=f"L{num}",
                label=f"Lampiran {num}",
                hierarchy={"lampiran": num},
                ocr_noisy=ocr_noisy,
            )
            i += 1
            continue

        if mode == "lampiran":
            assert current is not None
            current.lines.append(ln)
            i += 1
            continue

        if END_BODY_RE.match(text) and mode == "body":
            close()
            mode = "trailer"
            i += 1
            continue
        if mode == "trailer":
            i += 1
            continue

        m_bab = BAB_RE.match(text)
        if m_bab and mode in ("preamble", "body"):
            val = bab_value(m_bab.group(1))
            if val is not None and val == last_bab + 1:
                close()
                last_bab = val
                roman = int_to_roman(val)
                title, i = _take_title(lines, i + 1, upper_only=True)
                hier = {"bab": roman, "bab_title": title}
                mode = "body"
                continue

        if mode in ("body", "penjelasan"):
            m_bag = BAGIAN_RE.match(text)
            if m_bag and m_bag.group(1).lower() in ORDINALS:
                close()
                title, i = _take_title(lines, i + 1, upper_only=False)
                hier = {k: v for k, v in hier.items() if k in ("bab", "bab_title")}
                hier["bagian"] = m_bag.group(1).capitalize()
                hier["bagian_title"] = title
                continue
            m_par = PARAGRAF_RE.match(text)
            if m_par:
                close()
                title, i = _take_title(lines, i + 1, upper_only=False)
                hier.pop("paragraf", None)
                hier["paragraf"] = m_par.group(1)
                hier["paragraf_title"] = title
                continue

        cands = pasal_candidates(text)
        if cands and mode == "penjelasan":
            close()
            n, suf = cands[0]
            current = Unit(
                kind="penjelasan",
                key=f"P{n}{suf}-PJ",
                label=f"Penjelasan Pasal {n}{suf}",
                hierarchy={"pasal": f"{n}{suf}"},
                ocr_noisy=ocr_noisy,
            )
            i += 1
            continue
        if cands and mode in ("preamble", "body"):
            accepted: tuple[int, str] | None = None
            max_jump = 3 if ocr_noisy else 1  # OCR layers may lose some headings entirely
            for n, suf in cands:
                if not suf and 1 <= n - last_pasal <= max_jump:
                    accepted = (n, suf)
                    break
                if n == last_pasal and suf and suf > last_suffix:
                    accepted = (n, suf)
                    break
            if accepted is not None:
                close()
                n, suf = accepted
                last_pasal, last_suffix = n, suf
                mode = "body"
                res.pasal_numbers.append(f"{n}{suf}")
                current = Unit(
                    kind="pasal",
                    key=f"P{n}{suf}",
                    label=f"Pasal {n}{suf}",
                    hierarchy={**hier, "pasal": f"{n}{suf}"},
                    ocr_noisy=ocr_noisy,
                )
                i += 1
                continue
            res.skipped_pasal_like.append(f"p{ln.page}: {text}")

        if current is None and mode == "body" and hier.get("bab"):
            # Content under a BAB heading before any Pasal heading was recognised (lost heading).
            current = Unit(
                kind="section",
                key=f"BAB{hier['bab']}-U{len(res.units) + 1}",
                label=f"BAB {hier['bab']} (teks tanpa judul pasal terdeteksi)",
                hierarchy=dict(hier),
                ocr_noisy=ocr_noisy,
            )
        if current is not None and mode in ("body", "penjelasan"):
            current.lines.append(ln)
        i += 1

    close()
    return res
