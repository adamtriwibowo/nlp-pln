# Lembar periksa gold chunk

Dibuat oleh `data/eval/build_qa.py`. Tim memeriksa bahwa potongan gold memuat jawaban.

| ID | Split | Tipe | Rujukan tim | Gold chunk | Cek (ya/tidak) |
|---|---|---|---|---|---|
| A1 | dev | factual | Pasal 4 ayat (2) | D1-P4 | |
| A2 | dev | factual | Pasal 13 | D1-P13 | |
| A3 | test | factual | Pasal 3 | D1-P3 | |
| A4 | dev | factual | Pasal 1 angka 13 | D2-P1-S2 | |
| A5 | dev | factual | Pasal 7 | D1-P7 | |
| A6 | test | factual | Pasal 5 ayat (3) | D2-P5 | |
| A7 | dev | factual | Pasal 2 | D1-P2 | |
| B1 | dev | factual | Pasal 28 ayat (2) huruf b | D2-P28 | |
| B2 | dev | factual | Pasal 28 ayat (2) huruf a angka 1 | D2-P28 | |
| B3 | test | factual | Pasal 21 | D2-P21 | |
| B4 | dev | factual | Pasal 37 ayat (1) | D2-P37 | |
| B5 | dev | factual | Pasal 11 ayat (1) | D1-P11 | |
| B6 | test | factual | Pasal 11 ayat (2) | D1-P11 | |
| B7 | dev | factual | Pasal 36 ayat (3) | D2-P36 | |
| B8 | dev | factual | Pasal 39 ayat (1) | D2-P39 | |
| B9 | test | factual | Pasal 40 ayat (4) | D2-P40 | |
| B10 | dev | factual | Pasal 50 | D2-P50 | |
| C1 | dev | multihop | Pasal 22 ayat (3) huruf b; Pasal 24 ayat (1) | D2-P22, D2-P24 | |
| C2 | dev | multihop | Pasal 47; Pasal 48; Pasal 41 ayat (4) | D2-P47, D2-P48, D2-P41 | |
| C3 | test | multihop | Pasal 26 ayat (1); Pasal 28 ayat (2) huruf b | D2-P26, D2-P28 | |
| C4 | dev | multihop | D2 Pasal 39 ayat (1); D3 Bab III | D2-P39, D3-BABIII-S1 | |
| D1 | dev | multihop | Pasal 26 ayat (1); Pasal 28 ayat (2) | D2-P26, D2-P28 | |
| D2 | dev | factual | Pasal 14 | D1-P14 | |
| D3 | test | multihop | D1 Pasal 15; D2 Pasal 51 | D1-P15, D2-P51 | |
| D4 | dev | factual | Pasal 49 | D2-P49 | |
| E1 | dev | multihop | Pasal 5 ayat (3) huruf a; Pasal 17 ayat (6) | D2-P5, D2-P17 | |
| E2 | dev | multihop | Pasal 5 ayat (3) huruf a; Pasal 18 ayat (1) | D2-P5, D2-P18 | |
| E3 | test | factual | Bab I hal. 3 | D3-BABI-S1 | |
| F1 | dev | factual | Bab II hal. 6 (selaras D2 Pasal 29) | D3-BABII | |
| F2 | dev | factual | Bab II hal. 5 (selaras D2 Pasal 28 ayat (1)) | D3-BABII | |
| F3 | test | factual | Bab III hal. 28 | D3-BABIII-S1 | |
| F4 | dev | factual | Bab III hal. 29 | D3-BABIII-S1 | |
| F5 | dev | factual | Bab III hal. 28 | D3-BABIII-S1 | |
| F6 | test | factual | Elemen E, hal. 27 | D3-BABII-ELE | |
| F7 | dev | factual | Elemen B, hal. 10 (selaras D2 Pasal 31) | D3-BABII-ELB-S1 | |
| F8 | dev | factual | Bab III hal. 29 | D3-BABIII-S1 | |
| OOC1 | dev | unanswerable | (di luar korpus) | - | |
| OOC2 | dev | unanswerable | (di luar korpus) | - | |
| OOC3 | test | unanswerable | (di luar korpus) | - | |
| OOC4 | dev | unanswerable | (di luar korpus) | - | |
| OOC5 | dev | unanswerable | (di luar korpus) | - | |
| OOC6 | test | unanswerable | (di luar korpus) | - | |
| OOC7 | dev | unanswerable | (di luar korpus) | - | |
| OOC8 | dev | unanswerable | (di luar korpus) | - | |
| OOC9 | test | unanswerable | (di luar korpus) | - | |
| OOC10 | dev | unanswerable | (di luar korpus) | - | |
