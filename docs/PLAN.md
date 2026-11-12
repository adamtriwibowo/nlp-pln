# Rencana Implementasi K2-RAG

Sumber kebenaran: [PRD.md](PRD.md). Tiap fase diakhiri tes, `git commit`, dan persetujuan sebelum fase berikutnya.

| Fase | Minggu | Deliverable | Verifikasi |
|---|---|---|---|
| 0 Fondasi | 2 | Monorepo, ADR, CLAUDE.md, subagent/skill/hook, DB + migrasi, `/api/health`, agen minimal + `check-llm`, frontend kosong | `setup`, `db-up`, `migrate`, `lint`, `test`, `check-llm`, `dev` berjalan |
| 1 Ingesti | 2 | manifest, PyMuPDF + bbox, parser pasal, chunker idempoten, `k2 ingest`, laporan ingesti, dataset card, skema qa.jsonl | tes fixture per dokumen, `make ingest` untuk semua dokumen |
| 2 Retrieval + baseline | 2 | embedding (local/openrouter), BM25, dense, RRF, metrik, run B1/B2/M1 pada dev | tes unit metrik dan RRF, tabel perbandingan, 5 kasus gagal |
| 3 Agen + API | 3 | answer_agent, validator sitasi, mode agentik, auditor, `/api/ask` SSE, auth, Pydantic Evals | eval dev B0/B1/M1/M3, audit 10 jawaban, >=5 error analysis |
| 4 UI | 3 | Halaman tanya jawab, viewer PDF, /review, /admin, Playwright | e2e lulus, screenshot |
| 5 Evaluasi final | 4 | Semua konfigurasi pada split test, results.md, jawaban RQ1-RQ3 | angka direproduksi dari `runs/` |
| 6 Deploy | 4 | Dockerfile, compose prod, Caddy, DEPLOY.md, CI | review keamanan, deploy manual oleh pemilik |

Catatan: pertanyaan uji disusun kelompok (bukan dikarang Claude); split test dibekukan sebelum tuning.
