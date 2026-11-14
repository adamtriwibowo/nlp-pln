# API (fase 3)

Dokumentasi interaktif: `http://127.0.0.1:8010/docs` (OpenAPI). Ringkasan:

| Method | Path | Keterangan |
|---|---|---|
| POST | `/api/ask` | Body `{question, mode: standard\|agentic, config_id?: B1\|B2\|M1}`. Respons SSE: `agent_steps` (mode agentik, langsung), `token` (jawaban dipecah per kata), `citations`, `done` (`query_id`, `badge`, `abstained`, `confidence`, ...) atau `error`. |
| GET | `/api/chunks/{chunk_id}` | Teks, hierarki, halaman, `bbox` (untuk sorotan PDF) |
| GET | `/api/documents`, `/api/documents/{id}/file` | Daftar dokumen dan PDF (jalur file dari manifest, bukan input pengguna) |
| POST | `/api/auth/login` | `{token}` -> cookie JWT httpOnly (peran admin/reviewer); `/logout`, `/me` |
| POST | `/api/feedback` | `{query_id, thumbs: -1\|1, comment?}` |
| GET | `/api/health` | `db` wajib ok; `llm` ok/error/unconfigured (cache 60 dtk) |

Catatan desain:
- **Jawaban divalidasi sebelum ditampilkan.** Agen menghasilkan jawaban utuh, validator memeriksa tiap sitasi (chunk_id ada di konteks, kutipan ada di teks chunk; maks 2 percobaan ulang, lalu abstain), dan barulah jawaban dialirkan per kata lewat SSE. Dengan begitu klaim yang belum tervalidasi tidak pernah tampil di domain keselamatan; harganya, teks baru muncul setelah model selesai (sekitar 2–4 dtk mode standar, 10–25 dtk agentik).
- Badge keyakinan: `supported` (confidence >= 0,5), `limited` (confidence rendah atau validasi/waktu gagal), `not_found` (abstain karena konteks tidak cukup).
- Rate limit per IP (`ASK_RATE_PER_MIN`, `LOGIN_RATE_PER_MIN`); batas biaya harian `DAILY_COST_LIMIT_USD` (HTTP 429). IP tidak disimpan; pertanyaan disimpan anonim di tabel `queries`.
- Hanya chunk `api_allowed: true` yang masuk prompt (filter sebelum konteks dibangun; tool agentik juga memfilter).
