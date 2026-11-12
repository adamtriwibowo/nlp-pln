# ADR 001 — Python + FastAPI untuk backend

**Status:** Diterima

## Konteks
Pipeline ingesti, retrieval, dan evaluasi NLP bertumpu pada ekosistem Python.

## Keputusan
Backend memakai Python 3.12 dan FastAPI (async, Pydantic v2, OpenAPI otomatis).

## Konsekuensi
Ditolak: backend Node/TS (ekosistem evaluasi NLP lebih lemah). Konsekuensi: dua bahasa di repo; tipe frontend digenerate dari OpenAPI.
