"""Run ingestion for the manifest and persist results (DB + JSONL + reports).

Two entry points: `run_pipeline` + `persist` process the whole corpus (`k2 ingest`), while
`prepare_one` + `persist_one` re-process a single document and merge it into the existing corpus.
"""

import json
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import delete, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Chunk, Document, Embedding
from app.ingest.models import ChunkRecord, ManifestEntry
from app.ingest.pipeline import (
    DocReport,
    corpus_version,
    ingest_document,
    load_manifest,
)

REPO_ROOT = Path(__file__).resolve().parents[3]
MANIFEST = REPO_ROOT / "data" / "manifest.yaml"
RAW_DIR = REPO_ROOT / "data" / "raw"
CHUNKS_JSONL = REPO_ROOT / "data" / "processed" / "chunks.jsonl"
REPORTS_JSON = REPO_ROOT / "data" / "processed" / "ingest_reports.json"
REPORT_MD = REPO_ROOT / "docs" / "ingest_report.md"


@dataclass(frozen=True)
class Outputs:
    """Where ingestion artefacts are written (redirected to a temp dir in tests)."""

    jsonl: Path = CHUNKS_JSONL
    reports_json: Path = REPORTS_JSON
    report_md: Path = REPORT_MD


DEFAULT_OUTPUTS = Outputs()


def run_pipeline(
    manifest: Path = MANIFEST, raw_dir: Path = RAW_DIR
) -> tuple[list[ManifestEntry], list[DocReport], list[ChunkRecord], str]:
    entries = load_manifest(manifest)
    reports: list[DocReport] = []
    chunks: list[ChunkRecord] = []
    for e in entries:
        rep, ch = ingest_document(e, raw_dir)
        reports.append(rep)
        chunks.extend(ch)
    chunks.sort(key=lambda c: c.chunk_id)
    return entries, reports, chunks, corpus_version(chunks)


def write_jsonl(chunks: list[ChunkRecord], path: Path = CHUNKS_JSONL) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as f:
        for c in chunks:
            f.write(c.model_dump_json() + "\n")


def read_jsonl(path: Path = CHUNKS_JSONL) -> list[ChunkRecord]:
    if not path.exists():
        return []
    return [
        ChunkRecord.model_validate_json(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def write_reports_json(reports: list[DocReport], version: str, path: Path = REPORTS_JSON) -> None:
    """Machine-readable per-document ingestion results (shown in the admin UI)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "generated_at": datetime.now(UTC).isoformat(),
        "corpus_version": version,
        "documents": {r.doc_id: r.model_dump() for r in reports},
    }
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")


def read_reports_json(path: Path = REPORTS_JSON) -> dict[str, dict[str, Any]]:
    if not path.exists():
        return {}
    data: dict[str, Any] = json.loads(path.read_text(encoding="utf-8"))
    docs: dict[str, dict[str, Any]] = data.get("documents", {})
    return docs


def write_outputs(
    entries: list[ManifestEntry],
    reports: list[DocReport],
    chunks: list[ChunkRecord],
    version: str,
    outputs: Outputs = DEFAULT_OUTPUTS,
) -> None:
    write_jsonl(chunks, outputs.jsonl)
    write_reports_json(reports, version, outputs.reports_json)
    write_report(entries, reports, chunks, version, outputs.report_md)


# ---- database ---------------------------------------------------------------------------


async def _upsert_document(session: AsyncSession, e: ManifestEntry, rep: DocReport) -> None:
    values = {
        "id": e.id,
        "title": e.title,
        "publisher": e.publisher,
        "source_url": e.source_url,
        "downloaded_at": (
            datetime.fromisoformat(e.downloaded_at).replace(tzinfo=UTC) if e.downloaded_at else None
        ),
        "status": e.status_berlaku,
        "license": e.license,
        "lang": e.lang,
        "api_allowed": e.api_allowed,
        "index": e.index,
        "sha256": rep.sha256,
    }
    stmt = insert(Document).values(**values)
    stmt = stmt.on_conflict_do_update(
        index_elements=[Document.id], set_={k: v for k, v in values.items() if k != "id"}
    )
    await session.execute(stmt)


async def _sync_chunks(
    session: AsyncSession,
    chunks: list[ChunkRecord],
    version: str,
    doc_ids: set[str] | None,
) -> None:
    """Upsert `chunks`; remove chunks (and their embeddings) that no longer exist.

    `doc_ids` limits which documents' existing chunks may be removed (None = the whole corpus).
    Embeddings of changed chunks are detected by text_sha in `k2 index`.
    """
    q = select(Chunk.chunk_id)
    if doc_ids is not None:
        q = q.where(Chunk.doc_id.in_(doc_ids))
    existing = set((await session.execute(q)).scalars().all())
    removed = existing - {c.chunk_id for c in chunks}
    if removed:
        await session.execute(delete(Embedding).where(Embedding.chunk_id.in_(removed)))
        await session.execute(delete(Chunk).where(Chunk.chunk_id.in_(removed)))
    for c in chunks:
        await session.merge(
            Chunk(
                chunk_id=c.chunk_id,
                doc_id=c.doc_id,
                hierarchy={
                    **c.hierarchy,
                    "label": c.label,
                    "kind": c.kind,
                    "ocr_noisy": c.ocr_noisy,
                    "api_allowed": c.api_allowed,
                },
                page_start=c.page_start,
                page_end=c.page_end,
                bbox=[b.model_dump() for b in c.bbox],
                text=c.text,
                n_tokens=c.n_tokens,
                corpus_version=version,
            )
        )


async def persist(
    session: AsyncSession,
    entries: list[ManifestEntry],
    reports: list[DocReport],
    chunks: list[ChunkRecord],
    version: str,
) -> None:
    """Idempotent full sync of the corpus.

    Documents are upserted, chunks are replaced, and documents that are no longer in the manifest
    (together with their chunks and embeddings) are removed, so the database mirrors the manifest.
    """
    by_id = {r.doc_id: r for r in reports}
    for e in entries:
        await _upsert_document(session, e, by_id[e.id])
    await _sync_chunks(session, chunks, version, None)
    await session.execute(delete(Document).where(Document.id.not_in([e.id for e in entries])))
    await session.commit()


# ---- single document --------------------------------------------------------------------


@dataclass
class PreparedDoc:
    entry: ManifestEntry
    report: DocReport
    chunks: list[ChunkRecord]  # new chunks of this document only
    version: str  # corpus_version over the merged corpus


def prepare_one(
    doc_id: str,
    manifest: Path = MANIFEST,
    raw_dir: Path = RAW_DIR,
    outputs: Outputs = DEFAULT_OUTPUTS,
) -> PreparedDoc:
    """Re-process one document and merge it into the artefacts of the existing corpus (CPU work)."""
    entries = load_manifest(manifest)
    entry = next((e for e in entries if e.id == doc_id), None)
    if entry is None:
        raise KeyError(doc_id)
    report, new_chunks = ingest_document(entry, raw_dir)
    merged = sorted(
        [c for c in read_jsonl(outputs.jsonl) if c.doc_id != doc_id] + new_chunks,
        key=lambda c: c.chunk_id,
    )
    version = corpus_version(merged)

    previous = read_reports_json(outputs.reports_json)
    reports: list[DocReport] = []
    for e in entries:
        if e.id == doc_id:
            reports.append(report)
        elif e.id in previous:
            reports.append(DocReport.model_validate(previous[e.id]))
    write_outputs(
        [e for e in entries if e.id in {r.doc_id for r in reports}],
        reports,
        merged,
        version,
        outputs,
    )
    return PreparedDoc(entry=entry, report=report, chunks=new_chunks, version=version)


async def persist_one(session: AsyncSession, prepared: PreparedDoc) -> None:
    """Store one re-processed document; other documents are left untouched."""
    await _upsert_document(session, prepared.entry, prepared.report)
    await _sync_chunks(session, prepared.chunks, prepared.version, {prepared.entry.id})
    # corpus_version describes the whole corpus, so every chunk carries the new value
    await session.execute(update(Chunk).values(corpus_version=prepared.version))
    await session.commit()


# ---- reports ----------------------------------------------------------------------------


def write_report(
    entries: list[ManifestEntry],
    reports: list[DocReport],
    chunks: list[ChunkRecord],
    version: str,
    path: Path = REPORT_MD,
) -> None:
    lines = [
        "# Laporan Ingesti",
        "",
        f"Dibuat otomatis oleh `k2 ingest` · corpus_version: `{version}` · total chunk: {len(chunks)}",
        "",
        "Jumlah token adalah perkiraan (kata + tanda baca), bukan token model.",
        "",
        "| Dokumen | Status | Halaman | Hal. tanpa teks | Pasal | Chunk | Token min/median/maks | >600 token |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for r in reports:
        lines.append(
            f"| {r.doc_id} {r.short_title} | {r.status} | {r.pages} | {r.empty_pages} | "
            f"{r.pasal_count} | {r.chunks} | {r.tokens_min}/{r.tokens_median}/{r.tokens_max} | "
            f"{r.over_budget} |"
        )
    lines += ["", "## Catatan per dokumen", ""]
    for r in reports:
        lines.append(f"### {r.doc_id} — {r.short_title}")
        lines.append(f"- Status: {r.status}; strategi ekstraksi: {r.strategy or '-'}")
        if r.sha256:
            lines.append(f"- SHA-256 PDF: `{r.sha256}`")
        if r.status == "ingested":
            lines.append(f"- Unit struktur: {r.units}; pasal terdeteksi: {r.pasal_count}")
            lines.append(f"- Celah nomor pasal: {r.pasal_gaps if r.pasal_gaps else 'tidak ada'}")
        if r.skipped_pasal_like:
            lines.append(f"- Baris mirip judul pasal yang ditolak: {r.skipped_pasal_like[:5]}")
        if r.note:
            lines.append(f"- Catatan: {r.note}")
        lines.append("")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines), encoding="utf-8", newline="\n")
