---
name: ingest-docs
description: Ingest and chunk documents listed in data/manifest.yaml and produce an ingestion report.
---

# ingest-docs

Run `make ingest` (cd backend && uv run k2 ingest). Then read docs/ingest_report.md and summarize pages, pasal, chunks, token-length distribution, and pages without text (possible scans). Never edit PDFs in data/raw.
