# ADR 003 — Pydantic AI untuk agen

**Status:** Diterima

## Konteks
Perlu output terstruktur tervalidasi, tools, batas pemakaian, dan tracing OTel.

## Keputusan
Agen dibangun dengan Pydantic AI (provider OpenRouter).

## Konsekuensi
Ditolak: LangGraph (lebih berat), LlamaIndex (retrieval tersembunyi), tanpa framework. Konsekuensi: API library cepat berubah; selalu cek dokumentasi terbaru.
