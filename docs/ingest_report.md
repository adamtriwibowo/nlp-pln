# Laporan Ingesti

Dibuat otomatis oleh `k2 ingest` · corpus_version: `2fa0173fa8be5f95` · total chunk: 126

Jumlah token adalah perkiraan (kata + tanda baca), bukan token model.

| Dokumen | Status | Halaman | Hal. tanpa teks | Pasal | Chunk | Token min/median/maks | >600 token |
|---|---|---|---|---|---|---|---|
| D1 Permenaker 12/2015 | ingested | 7 | 0 | 16 | 17 | 12/63/438 | 0 |
| D2 Permen ESDM 10/2021 | ingested | 96 | 0 | 52 | 92 | 25/158/487 | 0 |
| D3 Pedoman SMK2 | ingested | 30 | 0 | 0 | 17 | 149/404/427 | 0 |
| D4 FAQ Permen 10/2021 | skipped_not_indexed | 111 | 57 | 0 | 0 | 0/0/0 | 0 |
| D5 DOE-HDBK-1092 | missing_file | 0 | 0 | 0 | 0 | 0/0/0 | 0 |
| D6 OSHA 1910.269 | missing_file | 0 | 0 | 0 | 0 | 0/0/0 | 0 |

## Catatan per dokumen

### D1 — Permenaker 12/2015
- Status: ingested; strategi ekstraksi: words_by_line
- SHA-256 PDF: `74aa66e7c75361bf9fde1e8e9f3f30ae683fea0c6327e54b39053b08aa1f251b`
- Unit struktur: 16; pasal terdeteksi: 16
- Celah nomor pasal: tidak ada
- Catatan: Teks OCR berderau (mis. "Pasa12"); semua chunk ditandai ocr_noisy.

### D2 — Permen ESDM 10/2021
- Status: ingested; strategi ekstraksi: lines
- SHA-256 PDF: `301714ba99d7b556d15312a7c0e52a2851fa8acfc83e90a175415191a3305def`
- Unit struktur: 57; pasal terdeteksi: 52
- Celah nomor pasal: tidak ada

### D3 — Pedoman SMK2
- Status: ingested; strategi ekstraksi: lines
- SHA-256 PDF: `66e239e5eada970e08502b22c68fb5042ca1ef7e9f8a87b5a6254fda5942f482`
- Unit struktur: 8; pasal terdeteksi: 0
- Celah nomor pasal: tidak ada

### D4 — FAQ Permen 10/2021
- Status: skipped_not_indexed; strategi ekstraksi: lines
- SHA-256 PDF: `2ac28f5d6071041dd76f9af19e73ce305025b86acdaa3534ecf97a33c81e421a`
- Catatan: 57 dari 111 halaman tidak punya teks (kemungkinan gambar).

### D5 — DOE-HDBK-1092
- Status: missing_file; strategi ekstraksi: -
- Catatan: pending_download -- unduh manual ke data/raw/ lalu isi field file.

### D6 — OSHA 1910.269
- Status: missing_file; strategi ekstraksi: -
- Catatan: pending_download -- osha.gov memblokir unduhan otomatis; unduh manual.
