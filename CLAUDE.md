# K2-RAG

Asisten tanya jawab RAG untuk regulasi dan SOP keselamatan ketenagalistrikan (Indonesia), dengan sitasi tingkat pasal. Proyek akhir Magister Teknik Elektro: harus berjalan di web **dan** dapat dievaluasi/direproduksi secara ilmiah.

## Dokumen
- Kebutuhan, stack, model data, API, metrik: [docs/PRD.md](docs/PRD.md) (sumber kebenaran)
- Rencana fase: [docs/PLAN.md](docs/PLAN.md) · Keputusan arsitektur: [docs/adr/](docs/adr/)
- Desain UI: [docs/design/](docs/design/)

## Perintah (Windows tanpa make: `.\make.ps1 <target>`)
`make setup | db-up | migrate | lint | test | ingest | index | eval CONFIG=M1 SPLIT=dev | dev | up | gen-api | check-llm | list-models`

## Struktur
- `backend/app/{api,core,db,ingest,retrieval,agents,services,eval}`, `cli.py` (Typer: `k2 ...`), `migrations/` (Alembic)
- `frontend/` Next.js (App Router, TS, Tailwind, shadcn/ui, TanStack Query), `styles/tokens.css`
- `data/{raw,processed,eval}`, `data/manifest.yaml` · `configs/*.yaml` (B0,B1,B2,M1,M2,M3) · `runs/` · `infra/`

## Konvensi
- Python 3.12, type hints, Pydantic, async. Kode dan komentar bahasa Inggris; teks UI bahasa Indonesia.
- Cek dokumentasi versi terbaru sebelum memakai library (Pydantic AI, pgvector, Next.js 16, TanStack Query, react-pdf); jangan mengandalkan ingatan.
- DB lokal: host `127.0.0.1` port **5434** (5432/5433 dipakai proses lain di mesin ini). Pakai `127.0.0.1`, bukan `localhost` (IPv6 membuat koneksi menggantung).
- Windows: psycopg async butuh SelectorEventLoop: policy diset di `app/__init__.py` dan uvicorn dijalankan dengan `--loop none`.

## Aturan keras
- Jangan pernah commit `.env`, PDF di `data/raw`, atau isi `runs/`. Jangan menaruh kunci API di chat atau file yang di-commit.
- Jangan pernah mengarang teks pasal atau isi regulasi; semua teks sumber berasal dari PDF.
- Hanya chunk dengan `api_allowed: true` yang boleh dikirim ke OpenRouter.
- Model LLM selalu dari env (`LLM_MODEL`, `JUDGE_MODEL`), tidak di-hardcode; judge harus berbeda dari generator.
- Split test di `data/eval` dibekukan: jangan dipakai untuk tuning. Pertanyaan uji ditulis kelompok, bukan Claude.
- Perubahan skema DB hanya lewat migrasi Alembic (cek downgrade).
- Perubahan chunker, retrieval, atau prompt wajib disertai tes dan run eval dev.
- Tanya dulu sebelum menghapus file, drop tabel, push git, atau menjalankan perintah ke VPS.
