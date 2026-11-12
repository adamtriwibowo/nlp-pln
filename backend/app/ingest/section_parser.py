"""Parsers for documents without Pasal: SMK2 guideline (BAB/ELEMEN) and numbered English sections."""

import re

from app.ingest.legal_parser import ParseResult, bab_value, int_to_roman
from app.ingest.models import Line, Unit

BAB_RE = re.compile(r"^BAB\s+([IVXLC]+)$")
ELEMEN_RE = re.compile(r"^ELEMEN\s*([A-Z])?\s*:?\s*(.*)$")
ELEMEN_LETTER_RE = re.compile(r"^([A-Z])\s*:\s*(.*)$")
# '2.3 Scope', '1 INTRODUCTION', 'Section 4.1 Grounding'
EN_SECTION_RE = re.compile(
    r"^(?:Section\s+)?(\d{1,2}(?:\.\d{1,2}){0,3})\.?\s+([A-Z][A-Za-z0-9 ,;:&()/'\-]{2,90})$"
)


def parse_smk2(lines: list[Line], ocr_noisy: bool = False) -> ParseResult:
    """Pedoman SMK2: sections are BAB (I, II, III) and, inside BAB II, ELEMEN A..E."""
    res = ParseResult()
    current: Unit | None = None
    bab_roman = ""
    bab_title = ""
    last_bab = 0

    def close() -> None:
        nonlocal current
        if current is not None and current.lines:
            res.units.append(current)
        current = None

    i = 0
    while i < len(lines):
        text = lines[i].text
        m_bab = BAB_RE.match(text)
        if m_bab and bab_value(m_bab.group(1)) == last_bab + 1:
            close()
            last_bab += 1
            bab_roman = int_to_roman(last_bab)
            bab_title = ""
            if i + 1 < len(lines) and lines[i + 1].text.isupper():
                bab_title = lines[i + 1].text
                i += 1
            current = Unit(
                kind="section",
                key=f"BAB{bab_roman}",
                label=f"BAB {bab_roman} {bab_title}".strip(),
                hierarchy={"bab": bab_roman, "bab_title": bab_title},
                ocr_noisy=ocr_noisy,
            )
            i += 1
            continue

        m_el = ELEMEN_RE.match(text) if text.startswith("ELEMEN") else None
        if m_el and bab_roman:
            letter, title = m_el.group(1), m_el.group(2).strip()
            if not letter and i + 1 < len(lines):
                m2 = ELEMEN_LETTER_RE.match(lines[i + 1].text)
                if m2:
                    letter, title = m2.group(1), m2.group(2).strip()
                    i += 1
            if letter:
                close()
                # titles can wrap onto the next line (lowercase continuation)
                while i + 1 < len(lines) and lines[i + 1].text[:1].islower():
                    title = f"{title} {lines[i + 1].text}".strip()
                    i += 1
                current = Unit(
                    kind="section",
                    key=f"BAB{bab_roman}-EL{letter}",
                    label=f"Elemen {letter}: {title}",
                    hierarchy={
                        "bab": bab_roman,
                        "bab_title": bab_title,
                        "elemen": letter,
                        "elemen_title": title,
                    },
                    ocr_noisy=ocr_noisy,
                )
                i += 1
                continue

        if current is not None:
            current.lines.append(lines[i])
        i += 1
    close()
    return res


def parse_numbered_sections_en(lines: list[Line], ocr_noisy: bool = False) -> ParseResult:
    """English handbooks: numbered section headings such as '2.3 Scope'."""
    res = ParseResult()
    current: Unit | None = None
    last_num: tuple[int, ...] = ()

    def close() -> None:
        nonlocal current
        if current is not None and current.lines:
            res.units.append(current)
        current = None

    for ln in lines:
        m = EN_SECTION_RE.match(ln.text)
        if m and not ln.text.endswith("."):
            num = tuple(int(p) for p in m.group(1).split("."))
            if _plausible_next(last_num, num):
                close()
                last_num = num
                dotted = ".".join(str(n) for n in num)
                current = Unit(
                    kind="section",
                    key="S" + dotted.replace(".", "_"),
                    label=f"Section {dotted} {m.group(2)}",
                    hierarchy={"section": dotted, "title": m.group(2)},
                    ocr_noisy=ocr_noisy,
                )
                continue
        if current is not None:
            current.lines.append(ln)
    close()
    return res


def _plausible_next(prev: tuple[int, ...], new: tuple[int, ...]) -> bool:
    """Accept a heading only if it follows the numbering order (rejects list items)."""
    if not prev:
        return new[0] == 1 and len(new) <= 2
    if len(new) == len(prev):
        return new[:-1] == prev[:-1] and new[-1] == prev[-1] + 1
    if len(new) == len(prev) + 1:
        return new[:-1] == prev and new[-1] == 1
    if len(new) < len(prev):
        return new[:-1] == prev[: len(new) - 1] and new[-1] == prev[len(new) - 1] + 1
    return False
