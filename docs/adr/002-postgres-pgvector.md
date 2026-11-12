# ADR 002 — PostgreSQL + pgvector

**Status:** Diterima

## Konteks
Butuh satu penyimpanan untuk metadata, vektor, feedback, review, dan run evaluasi.

## Keputusan
PostgreSQL 17 dengan pgvector (HNSW, cosine).

## Konsekuensi
Ditolak: SQLite+FAISS (dua penyimpanan), Qdrant (layanan tambahan). Konsekuensi: DB harus berjalan saat dev; backup via pg_dump.
