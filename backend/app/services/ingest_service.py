"""Run ingestion for the manifest and persist results (DB + JSONL + report)."""

from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import delete
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Chunk, Document
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
REPORT_MD = REPO_ROOT / "docs" / "ingest_report.md"


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


async def persist(
    session: AsyncSession,
    entries: list[ManifestEntry],
    reports: list[DocReport],
    chunks: list[ChunkRecord],
    version: str,
) -> None:
    """Idempotent upsert: documents are upserted, chunks of every manifest doc are replaced."""
    by_id = {r.doc_id: r for r in reports}
    for e in entries:
        rep = by_id[e.id]
        values = {
            "id": e.id,
            "title": e.title,
            "publisher": e.publisher,
            "source_url": e.source_url,
            "downloaded_at": (
                datetime.fromisoformat(e.downloaded_at).replace(tzinfo=UTC)
                if e.downloaded_at
                else None
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

    await session.execute(delete(Chunk))  # embeddings are rebuilt by `k2 index` (phase 2)
    for c in chunks:
        session.add(
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
    await session.commit()


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
