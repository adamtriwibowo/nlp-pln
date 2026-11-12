# K2-RAG

Asisten tanya jawab berbasis RAG untuk regulasi dan SOP keselamatan ketenagalistrikan (K3 listrik) berbahasa Indonesia. Setiap jawaban menyertakan **sitasi tingkat pasal/ayat** yang bisa ditelusuri ke teks dan halaman PDF aslinya; bila bukti tidak cukup, sistem menolak menjawab (abstain).

Proyek akhir mata kuliah Kecerdasan Artifisial, Magister Teknik Elektro. Selain aplikasi web, repo ini adalah alat riset yang membandingkan konfigurasi retrieval dan generasi secara terukur (Recall@k, MRR, faithfulness, ketepatan sitasi, penilaian ahli).

> Bukan pengganti petugas K3; selalu cek pasal sumber.

## Status

| Fase | Isi | Status |
|---|---|---|
| 0 | Fondasi: repo, DB, API health, agen minimal, frontend kosong | selesai |
| 1 | Ingesti PDF, parser pasal, dataset card | belum |
| 2 | Retrieval (BM25, dense, hybrid RRF) + metrik + baseline | belum |
| 3 | Agen Pydantic AI, sitasi, mode agentik, API `/api/ask` | belum |
| 4 | Antarmuka web, viewer PDF, halaman review dan admin | belum |
| 5 | Evaluasi final dan review ahli | belum |
| 6 | Deploy VPS | belum |

Rincian: [docs/PLAN.md](docs/PLAN.md).

## Tech stack

Python 3.12 · FastAPI · Pydantic AI (OpenRouter) · PostgreSQL 17 + pgvector · SQLAlchemy 2 + Alembic · Next.js 16 (TypeScript, Tailwind, TanStack Query) · Docker Compose + Caddy. Alasan pemilihan: [docs/adr/](docs/adr/).

## Struktur

```
backend/    FastAPI (app/{api,core,db,ingest,retrieval,agents,services,eval}), migrations/, tests/
frontend/   Next.js, styles/tokens.css
data/       raw/ (PDF, tidak di-commit), processed/, eval/, manifest.yaml
configs/    konfigurasi eksperimen B0, B1, B2, M1, M2, M3
infra/      docker-compose.dev.yml, docker-compose.yml (produksi), Caddyfile
docs/       PRD.md, PLAN.md, adr/, design/, dataset_card.md, eval_protocol.md
.claude/    subagent, skill, dan hook untuk Claude Code
```

## Prasyarat

- [uv](https://docs.astral.sh/uv/) (Python 3.12 diunduh otomatis)
- Node.js LTS dan pnpm
- Docker Desktop
- Akun OpenRouter dengan kunci API

## Menjalankan (dev)

```
cp .env.example .env            # isi OPENROUTER_API_KEY; JANGAN di-commit
make setup
make db-up migrate              # PostgreSQL + pgvector di 127.0.0.1:5434
make list-models                # pilih LLM_MODEL dan JUDGE_MODEL (harus berbeda), isi di .env
make check-llm
make dev                        # API http://127.0.0.1:8010, web http://localhost:3000
make gen-api                    # tipe TypeScript dari OpenAPI (API harus berjalan)
```

Windows tanpa `make`: pakai `.\make.ps1 <target>` (target yang sama). `make lint` dan `make test` menjalankan ruff, mypy, pytest, eslint, dan tsc.

Catatan Windows: gunakan `127.0.0.1`, bukan `localhost`, untuk koneksi DB; uvicorn dijalankan dengan `--loop none` (sudah ada di Makefile).

## Konfigurasi

Semua rahasia dan pilihan model ada di `.env` (lihat `.env.example`). Model LLM tidak di-hardcode. Hanya chunk dengan `api_allowed: true` yang boleh dikirim ke OpenRouter.

## Aturan penting

- Jangan commit `.env`, PDF di `data/raw`, atau isi `runs/`.
- Teks regulasi hanya berasal dari PDF sumber; tidak boleh dikarang.
- Split test di `data/eval` dibekukan; tuning hanya pada split dev.
- Perubahan skema DB hanya lewat migrasi Alembic.

Aturan lengkap untuk Claude Code ada di [CLAUDE.md](CLAUDE.md).

## Dokumen

- [PRD](docs/PRD.md) · [Rencana](docs/PLAN.md) · [ADR](docs/adr/) · [Desain UI](docs/design/)
