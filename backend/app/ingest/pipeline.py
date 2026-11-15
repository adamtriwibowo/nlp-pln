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


OVERRIDABLE = ("index", "api_allowed")


def overrides_path(manifest: Path) -> Path:
    """Admin changes to a document's flags; tracked in git (they change what the corpus means)."""
    return manifest.with_name("manifest.overrides.yaml")


def load_overrides(manifest: Path) -> dict[str, dict[str, bool]]:
    path = overrides_path(manifest)
    if not path.exists():
        return {}
    data: dict[str, Any] = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    raw: dict[str, dict[str, Any]] = data.get("overrides", {})
    return {
        doc_id: {k: bool(v) for k, v in fields.items() if k in OVERRIDABLE}
        for doc_id, fields in raw.items()
    }


def load_manifest(path: Path, apply_overrides: bool = True) -> list[ManifestEntry]:
    data: dict[str, Any] = yaml.safe_load(path.read_text(encoding="utf-8"))
    entries = [ManifestEntry.model_validate(d) for d in data["documents"]]
    extra = uploads_path(path)
    if extra.exists():
        more: dict[str, Any] = yaml.safe_load(extra.read_text(encoding="utf-8")) or {}
        entries += [ManifestEntry.model_validate(d) for d in more.get("documents", [])]
    ids = [e.id for e in entries]
    if len(ids) != len(set(ids)):
        raise ValueError("duplicate document ids across manifest files")
    if apply_overrides:
        ov = load_overrides(path)
        entries = [e.model_copy(update=ov[e.id]) if e.id in ov else e for e in entries]
    return entries


def set_override(manifest: Path, doc_id: str, changes: dict[str, bool]) -> dict[str, bool]:
    """Record flag changes for one document. Values equal to the base manifest are dropped, so
    the overrides file only lists real differences. Returns the document's remaining overrides."""
    bad = set(changes) - set(OVERRIDABLE)
    if bad:
        raise ValueError(f"fields cannot be overridden: {sorted(bad)}")
    base = {e.id: e for e in load_manifest(manifest, apply_overrides=False)}
    if doc_id not in base:
        raise KeyError(doc_id)
    current = load_overrides(manifest)
    mine = {**current.get(doc_id, {}), **changes}
    mine = {k: v for k, v in mine.items() if getattr(base[doc_id], k) != v}
    if mine:
        current[doc_id] = mine
    else:
        current.pop(doc_id, None)
    path = overrides_path(manifest)
    if current:
        path.write_text(
            yaml.safe_dump({"overrides": dict(sorted(current.items()))}, sort_keys=True),
            encoding="utf-8",
        )
    elif path.exists():
        path.unlink()
    return mine


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
