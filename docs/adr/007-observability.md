# ADR 007 — OTel ke Langfuse Cloud/Logfire

**Status:** Diterima

## Konteks
Perlu melacak langkah agen untuk error analysis.

## Keputusan
Tracing OpenTelemetry opsional via env ke Langfuse Cloud atau Logfire.

## Konsekuensi
Ditolak: Langfuse self-host (butuh ClickHouse+Redis, berat untuk VPS kecil). Konsekuensi: data trace keluar ke layanan pihak ketiga.
