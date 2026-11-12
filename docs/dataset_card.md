# Dataset Card — Korpus K2-RAG

**Status:** draf fase 1 (12 November 2026) · **corpus_version:** `2fa0173fa8be5f95` (berubah bila parser/chunker/PDF berubah; angka rinci selalu ada di [ingest_report.md](ingest_report.md)).

## Tujuan
Korpus teks regulasi dan pedoman keselamatan ketenagalistrikan berbahasa Indonesia untuk sistem tanya jawab RAG dengan sitasi tingkat pasal/ayat. Sumber data: `data/manifest.yaml`. PDF disimpan di `data/raw/` (tidak di-commit); hasil chunk di `data/processed/chunks.jsonl`.

## Dokumen
| ID | Dokumen | Penerbit | Bahasa | Diunduh | Diindeks | Catatan |
|---|---|---|---|---|---|---|
| D1 | Permenaker No. 12/2015 (K3 Listrik di Tempat Kerja) | Kemnaker | ID | 2026-11-12 | ya | PDF BPK dengan teks OCR berderau; semua chunk `ocr_noisy` |
| D2 | Permen ESDM No. 10/2021 (Keselamatan Ketenagalistrikan) | Kementerian ESDM | ID | 2026-11-12 | ya | Berteks bersih; 52 pasal + 5 lampiran |
| D3 | Pedoman SMK2 | Ditjen Gatrik ESDM | ID | 2026-11-12 | ya | Chunk per BAB/Elemen |
| D4 | FAQ Permen ESDM 10/2021 | Ditjen Gatrik ESDM | ID | 2026-11-12 | **tidak** | Bahan menyusun set uji; 57 dari 111 halaman tanpa teks |
| D5 | DOE-HDBK-1092-2013 | US DOE | EN | — | belum | PDF belum diunduh (manual) |
| D6 | OSHA 29 CFR 1910.269 / Subpart S | US OSHA | EN | — | belum | PDF belum diunduh (osha.gov memblokir unduhan otomatis) |

**Status berlaku** setiap regulasi **belum diverifikasi** di JDIH; harus dicek manual sebelum evaluasi final. Seluruh dokumen adalah dokumen publik pemerintah (`api_allowed: true` untuk D1–D3). Standar berbayar (PUIL/SNI 0225, IEC, NFPA 70E) tidak termasuk.

## Statistik (corpus_version di atas)
| | D1 | D2 | D3 | Total |
|---|---|---|---|---|
| Halaman | 7 | 96 | 30 | 133 |
| Pasal terdeteksi | 16 | 52 | — | 68 |
| Chunk | 17 | 92 | 17 | 126 |
| Token/chunk (min/median/maks, perkiraan) | 12/63/438 | 25/158/487 | 149/404/427 | |

Jenis chunk: 70 pasal/ayat, 39 lampiran (D2, teks tabel mentah), 17 bagian pedoman. Chunk lampiran memuat teks mentah tabel dan tidak cocok untuk jawaban tabular; konfigurasi retrieval dapat mengecualikan `kind = lampiran`.

## Struktur chunk
`chunk_id` stabil (mis. `D2-P3`, `D2-P15-A2`, `D3-BABII-ELA-S1`), `hierarchy` (BAB, Bagian, Pasal, Ayat), halaman awal–akhir, `bbox` per halaman (untuk sorotan di viewer PDF), `n_tokens`, `lang`, `api_allowed`, `ocr_noisy`. Unit chunk adalah satu Pasal; Pasal > ~400 token dipecah per ayat (`-A{n}`) atau per bagian (`-S{k}`).

## Contoh chunk (teks asli dari PDF)
**D2-P3 — Pasal 3 (hal. 6)**
> (1) Keselamatan Ketenagalistrikan sebagaimana dimaksud dalam Pasal 2 bertujuan untuk mewujudkan kondisi: a. andal dan aman bagi Instalasi Tenaga Listrik; b. aman dari bahaya bagi manusia dan makhluk hidup lainnya; dan c. ramah lingkungan. …

**D1-P4 — Pasal 4 (hal. 4, teks OCR)**
> (1)Pelaksanaan K3 listrik sebagaimana dimaksud dalam Pasal 3 merupakan pelaksanaan persyaratan K3yang meliputi: a. perencanaan, pemasangan, penggunaan, perubahan, pemeliharaan; b. pemeriksaan dan pengujian. …

**D3-BABII-ELA-S1 — Elemen A: Penetapan Kebijakan Badan Usaha (hal. 7–9)**
> Penetapan Badan Usaha meliputi: a. Strategi Badan Usaha dalam mewujudkan Keselamatan Ketenagalistrikan … Ekspektasi 1. Manajemen menunjukkan komitmen …

## Keterbatasan
- **Kualitas D1:** lapisan teks OCR berderau (spasi hilang, mis. "K3yang"). Parser menoleransi derau pada judul pasal; tidak ada celah nomor pasal, tetapi pencocokan kata pada D1 kurang andal. Sebaiknya diganti dengan PDF berteks bersih (salinan di `SAMPLE SOP/` adalah scan tanpa teks).
- **Tabel dan gambar** (terutama Lampiran D2 dan tabel D3) tidak dipahami; hanya teks mentah.
- **Penjelasan pasal** didukung parser tetapi tidak ada di D1–D3.
- Parser Inggris (D5/D6) baru berupa bagian bernomor yang diuji pada fixture; paragraf gaya OSHA `(a)(1)(i)` belum dipecah.
- Jumlah token adalah perkiraan sederhana (kata + tanda baca), bukan token model.
- Status berlaku dan versi terkini setiap regulasi belum diverifikasi.
