# ADR 004 — BM25 in-memory (bm25s)

**Status:** Diterima

## Konteks
Postgres full-text search tidak punya konfigurasi bahasa Indonesia.

## Keputusan
BM25 dibangun in-memory dengan bm25s dari tabel chunk.

## Konsekuensi
Ditolak: FTS Postgres. Konsekuensi: indeks dibangun ulang saat start/re-index.
