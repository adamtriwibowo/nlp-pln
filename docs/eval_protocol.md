# Protokol Evaluasi

## Prinsip
- Split `test` dibekukan; tuning hanya pada split `dev`. `k2 eval --split test` ditolak kecuali `--final`.
- Pertanyaan dan `gold_chunk_ids` disusun kelompok (`data/eval/qa.jsonl`); validasi dengan `k2 qa-validate`. Bantuan kandidat chunk: `k2 qa-candidates "<pertanyaan>"`.
- `JUDGE_MODEL` berbeda dari `LLM_MODEL` (fase 3). Seed tetap 42. Setiap run menyimpan konfigurasi, `corpus_version`, dan model persis.

## Evaluasi retrieval (fase 2)
Konfigurasi: B1 (BM25), B2 (dense), M1 (hybrid RRF k=60), M2 (hybrid + reranker, opsional). B0 dan M3 dievaluasi pada fase 3.

| Metrik | Definisi |
|---|---|
| Recall@k (k = 1, 3, 5, 10) | bagian `gold_chunk_ids` yang ada di k teratas (soal multihop bisa bernilai parsial) |
| hit@k | 1 bila ada gold di k teratas |
| MRR | rata-rata 1 / peringkat gold pertama |
| nDCG@5 | relevansi biner, ideal = gold terurut di atas |

Soal `unanswerable` tidak punya gold dan dikeluarkan dari metrik retrieval (dipakai pada akurasi abstain, fase 3). Hasil dilaporkan total dan per tipe pertanyaan.

Indeks: corpus 126 chunk; chunk `lampiran` (teks tabel mentah) dikeluarkan saat retrieval (`exclude_kinds` di config). Embedding: `baai/bge-m3` (1024-d, cosine) lewat OpenRouter; vektor di pgvector dengan indeks HNSW parsial untuk model ini. Pada ~126 baris planner memilih scan eksak (lebih murah); indeks tetap valid dan dipakai saat korpus membesar.

## Keluaran run
`runs/<timestamp>_<config>_<split>/`: `config.json`, `results.jsonl` (peringkat per pertanyaan), `metrics.json`, `summary.md`; juga tabel `eval_runs`/`eval_results`.

## Cara menjalankan
```
make index                        # sekali, atau setelah ingest berubah
make eval CONFIG=B1 SPLIT=dev
make eval CONFIG=B2 SPLIT=dev
make eval CONFIG=M1 SPLIT=dev
k2 search "pertanyaan" --config M1   # lihat peringkat satu pertanyaan
```
