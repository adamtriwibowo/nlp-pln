# ADR 006 — OpenRouter untuk LLM

**Status:** Diterima

## Konteks
Tidak ada GPU; model open-weight diakses lewat API.

## Keputusan
LLM dan embedding opsional via OpenRouter; model dari env.

## Konsekuensi
Ditolak: hosting model sendiri. Konsekuensi: hanya chunk api_allowed=true dikirim; ada biaya dan batas harian.
