# ADR 008 — Korpus hanya berbahasa Indonesia

**Status:** Diterima

## Konteks
Rencana awal memuat dua dokumen Inggris (D5 DOE-HDBK-1092, D6 OSHA 29 CFR 1910.269) sebagai pembanding. PDF-nya tidak pernah diunduh (osha.gov memblokir unduhan otomatis), parser Inggris hanya teruji pada fixture, dan pertanyaan uji ditulis dalam bahasa Indonesia tentang regulasi Indonesia.

## Keputusan
Korpus hanya berisi dokumen berbahasa Indonesia. D5 dan D6 dihapus dari `data/manifest.yaml`; `k2 ingest` / re-index menghapus dokumen yang tidak ada di manifest beserta chunk dan embedding-nya. Unggahan admin hanya menerima `lang: id` dan parser `legal_id` atau `sections_smk2`.

## Konsekuensi
Evaluasi tidak mencakup pertanyaan lintas bahasa. Fungsi `parse_numbered_sections_en` tetap ada di kode (dengan tes) tetapi tidak dipakai oleh korpus; bila dokumen Inggris ditambahkan lagi, ADR ini perlu direvisi.
