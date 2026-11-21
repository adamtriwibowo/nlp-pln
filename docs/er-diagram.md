# Diagram relasi database (ERD)

Skema PostgreSQL `k2rag`, diambil dari database yang berjalan (migrasi Alembic). Garis menunjukkan
kunci asing; `PK` kunci utama, `FK` kunci asing. Tabel `alembic_version` (pelacak migrasi) tidak
ditampilkan. Gambar siap pakai untuk laporan: [er-diagram.png](er-diagram.png).

```mermaid
erDiagram
    documents ||--o{ chunks : "doc_id"
    chunks ||--o{ embeddings : "chunk_id"
    queries ||--o{ feedback : "query_id"
    eval_runs ||--o{ eval_results : "run_id"
    review_items ||--o{ review_scores : "item_id"

    documents {
        varchar id PK
        text title
        text publisher
        text source_url
        timestamptz downloaded_at
        varchar status
        text license
        varchar lang
        boolean api_allowed
        boolean index
        varchar sha256
    }
    chunks {
        varchar chunk_id PK
        varchar doc_id FK
        jsonb hierarchy
        int page_start
        int page_end
        jsonb bbox
        text text
        int n_tokens
        varchar corpus_version
    }
    embeddings {
        varchar chunk_id PK, FK
        varchar model PK
        int dim
        vector vector
        varchar text_sha
    }
    queries {
        int id PK
        timestamptz created_at
        text question
        varchar mode
        varchar config_id
        jsonb answer
        jsonb citations
        int latency_ms
        int tokens
        float cost_usd
        varchar model
        varchar trace_id
    }
    feedback {
        int id PK
        int query_id FK
        int thumbs
        text comment
    }
    eval_runs {
        varchar run_id PK
        varchar config
        varchar corpus_version
        jsonb models
        jsonb metrics
        timestamptz created_at
    }
    eval_results {
        int id PK
        varchar run_id FK
        varchar question_id
        jsonb retrieved_ids
        jsonb output
        jsonb scores
    }
    review_items {
        int item_id PK
        text question
        jsonb answer
        varchar config_id
        varchar run_id
        varchar question_id
    }
    review_scores {
        int id PK
        int item_id FK
        varchar reviewer
        int correctness
        int completeness
        int usefulness
        boolean citation_ok
        text comment
    }
```

## Penjelasan singkat

| Kelompok | Tabel | Fungsi |
|---|---|---|
| Korpus | `documents` → `chunks` → `embeddings` | Dokumen sumber, potongan pasal (dengan halaman dan kotak sorotan PDF), dan vektor pencarian (satu per chunk per model) |
| Pertanyaan | `queries` → `feedback` | Riwayat tanya jawab beserta biaya dan latensi, dan umpan balik jempol |
| Evaluasi | `eval_runs` → `eval_results` | Satu run per konfigurasi dan split, hasil per pertanyaan |
| Penilaian ahli | `review_items` → `review_scores` | Item jawaban yang disembunyikan konfigurasinya dan skor penilai |

`review_items.run_id` dan `review_items.question_id` merujuk ke hasil evaluasi secara logis, tetapi
tidak dikunci sebagai kunci asing di database.
