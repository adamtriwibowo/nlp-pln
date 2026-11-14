"""PDF -> chunks pipeline (pure, no database)."""

import hashlib
import statistics
from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel

from app.ingest.chunker import chunk_units
from app.ingest.cleaners import clean_lines
from app.ingest.legal_parser import ParseResult, parse_legal_id
from app.ingest.models import ChunkRecord, Line, ManifestEntry
from app.ingest.pdf_extract import extract_lines
from app.ingest.section_parser import parse_numbered_sections_en, parse_smk2


class DocReport(BaseModel):
    doc_id: str
    short_title: str
    status: str  # ingested | skipped_not_indexed | missing_file
    sha256: str | None = None
    pages: int = 0
    empty_pages: int = 0
    strategy: str = ""
    units: int = 0
    pasal_count: int = 0
    pasal_gaps: list[int] = []
    skipped_pasal_like: list[str] = []
    chunks: int = 0
    tokens_min: int = 0
    tokens_median: int = 0
    tokens_max: int = 0
    over_budget: int = 0
    note: str | None = None


def uploads_path(manifest: Path) -> Path:
    """Machine-managed manifest of admin uploads, kept beside the hand-written one."""
    return manifest.with_name("manifest.uploads.yaml")


def load_manifest(path: Path) -> list[ManifestEntry]:
    data: dict[str, Any] = yaml.safe_load(path.read_text(encoding="utf-8"))
    entries = [ManifestEntry.model_validate(d) for d in data["documents"]]
    extra = uploads_path(path)
    if extra.exists():
        more: dict[str, Any] = yaml.safe_load(extra.read_text(encoding="utf-8")) or {}
        entries += [ManifestEntry.model_validate(d) for d in more.get("documents", [])]
    ids = [e.id for e in entries]
    if len(ids) != len(set(ids)):
        raise ValueError("duplicate document ids across manifest files")
    return entries


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def parse_lines(entry: ManifestEntry, lines: list[Line]) -> ParseResult:
    noisy = entry.extract == "words_by_line"
    if entry.parser == "legal_id":
        return parse_legal_id(lines, ocr_noisy=noisy)
    if entry.parser == "sections_smk2":
        return parse_smk2(lines, ocr_noisy=noisy)
    return parse_numbered_sections_en(lines, ocr_noisy=noisy)


def ingest_document(entry: ManifestEntry, raw_dir: Path) -> tuple[DocReport, list[ChunkRecord]]:
    report = DocReport(doc_id=entry.id, short_title=entry.short_title, status="ingested")
    if entry.file is None or not (raw_dir / entry.file).exists():
        report.status = "missing_file"
        report.note = entry.note or "PDF belum ada di data/raw/"
        return report, []
    path = raw_dir / entry.file
    report.sha256 = sha256_file(path)
    lines, info = extract_lines(path, entry.extract)
    report.pages = int(info["pages"])
    report.empty_pages = int(info["empty_pages"])
    report.strategy = str(info["strategy"])
    if not entry.index:
        report.status = "skipped_not_indexed"
        report.note = entry.note
        return report, []

    parsed = parse_lines(entry, clean_lines(lines))
    chunks = chunk_units(entry.id, parsed.units, entry.lang, entry.api_allowed)
    report.units = len(parsed.units)
    report.pasal_count = len(parsed.pasal_numbers)
    report.pasal_gaps = parsed.gaps
    report.skipped_pasal_like = parsed.skipped_pasal_like[:20]
    report.chunks = len(chunks)
    if chunks:
        toks = [c.n_tokens for c in chunks]
        report.tokens_min, report.tokens_max = min(toks), max(toks)
        report.tokens_median = int(statistics.median(toks))
        report.over_budget = sum(1 for t in toks if t > 600)
    report.note = entry.note
    return report, chunks


def corpus_version(chunks: list[ChunkRecord]) -> str:
    """Deterministic hash over (chunk_id, text) -- identical corpus => identical version."""
    h = hashlib.sha256()
    for c in sorted(chunks, key=lambda c: c.chunk_id):
        h.update(c.chunk_id.encode())
        h.update(b"\x00")
        h.update(c.text.encode())
        h.update(b"\x01")
    return h.hexdigest()[:16]
