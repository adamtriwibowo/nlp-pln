"""Data models shared by the ingestion pipeline."""

from typing import Any, Literal

from pydantic import BaseModel, Field

BBox = tuple[float, float, float, float]


class Line(BaseModel):
    """One visual line of text with its page and bounding box (PDF points)."""

    text: str
    page: int
    bbox: BBox


class Unit(BaseModel):
    """A structural unit found by a parser (a Pasal, an element, an appendix part...)."""

    kind: Literal["pasal", "section", "lampiran", "penjelasan"]
    key: str  # id fragment, e.g. "P15", "BAB2-ELA", "L1"
    label: str  # human readable, e.g. "Pasal 15"
    hierarchy: dict[str, Any] = Field(default_factory=dict)
    lines: list[Line] = Field(default_factory=list)
    ocr_noisy: bool = False


class PageBox(BaseModel):
    page: int
    bbox: BBox


class ChunkRecord(BaseModel):
    chunk_id: str
    doc_id: str
    kind: str
    label: str
    hierarchy: dict[str, Any]
    page_start: int
    page_end: int
    bbox: list[PageBox]
    text: str
    n_tokens: int
    lang: str
    api_allowed: bool
    ocr_noisy: bool = False


class ManifestEntry(BaseModel):
    id: str
    title: str
    short_title: str
    publisher: str
    source_url: str
    downloaded_at: str | None = None
    status_berlaku: str
    license: str
    lang: Literal["id", "en"]
    file: str | None = None
    parser: Literal["legal_id", "sections_smk2", "sections_en"]
    extract: Literal["auto", "lines", "words_by_line"] = "auto"
    index: bool = True
    api_allowed: bool = False
    note: str | None = None
