"""Convert the team's question package (sumber_soal_uji.json) into data/eval/qa.jsonl.

Questions and reference answers are copied verbatim from the team's file. The only derived fields
are:
- gold_chunk_ids: the chunks of the articles / pages the team cited in `sumber_pasal`
  (a parenthetical "selaras D2 Pasal X" is an equivalent source and is not counted as gold);
- type: unanswerable (out of corpus), multihop (>= 2 gold chunks), otherwise factual;
- split: every third question of each category goes to `test`, the rest to `dev`.

Run from the repository root:  python data/eval/build_qa.py
"""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "data" / "eval" / "sumber_soal_uji.json"
CHUNKS = ROOT / "data" / "processed" / "chunks.jsonl"
OUT = ROOT / "data" / "eval" / "qa.jsonl"
SHEET = ROOT / "data" / "eval" / "lembar_periksa_gold.md"

# Citations that name a chapter / page instead of an article (D3 has no articles).
PAGE_CITATIONS = {
    "E3": ["D3-BABI-S1"],  # Bab I hal. 3
    "F1": ["D3-BABII"],  # Bab II hal. 6
    "F2": ["D3-BABII"],  # Bab II hal. 5
    "F3": ["D3-BABIII-S1"],  # Bab III hal. 28
    "F4": ["D3-BABIII-S1"],  # Bab III hal. 29
    "F5": ["D3-BABIII-S1"],  # Bab III hal. 28
    "F6": ["D3-BABII-ELE"],  # Elemen E, hal. 27
    "F7": ["D3-BABII-ELB-S1"],  # Elemen B, hal. 10
    "F8": ["D3-BABIII-S1"],  # Bab III hal. 29
}
# "D3 Bab III" in a multi-source citation.
EXTRA = {"C4": ["D3-BABIII-S1"]}
# An article that is split into several chunks: the part that holds the cited item.
SPLIT_ARTICLE = {("A4", "D2", "1"): ["D2-P1-S2"]}


def load_chunks() -> dict[str, dict]:
    rows = [json.loads(line) for line in CHUNKS.read_text(encoding="utf-8").splitlines() if line]
    return {c["chunk_id"]: c for c in rows}


def article_chunks(chunks: dict[str, dict], doc: str, number: str) -> list[str]:
    return sorted(
        cid
        for cid, c in chunks.items()
        if c["doc_id"] == doc
        and c.get("kind") == "pasal"
        and str(c["hierarchy"].get("pasal")) == number
    )


def gold_for(item: dict, chunks: dict[str, dict]) -> list[str]:
    qid = item["id"]
    if item["tipe"] == "out_of_corpus":
        return []
    if qid in PAGE_CITATIONS:
        return PAGE_CITATIONS[qid]
    gold: list[str] = []
    cited = re.sub(r"\(selaras[^)]*\)", "", item["sumber_pasal"])
    for part in cited.split(";"):
        prefix = re.match(r"\s*(D\d)\s", part)
        doc = prefix.group(1) if prefix else item["dokumen_id"][0]
        found = re.search(r"Pasal\s+(\d+)", part)
        if not found:
            continue
        number = found.group(1)
        ids = SPLIT_ARTICLE.get((qid, doc, number)) or article_chunks(chunks, doc, number)
        if not ids:
            raise SystemExit(f"{qid}: no chunk for {doc} Pasal {number}")
        gold += [i for i in ids if i not in gold]
    gold += [i for i in EXTRA.get(qid, []) if i not in gold]
    if not gold:
        raise SystemExit(f"{qid}: no gold chunk derived from {item['sumber_pasal']!r}")
    return gold


def main() -> None:
    package = json.loads(SOURCE.read_text(encoding="utf-8"))
    chunks = load_chunks()
    rows: list[dict] = []
    for category, items in package.items():
        if category == "metadata":
            continue
        for position, item in enumerate(items):
            gold = gold_for(item, chunks)
            missing = [g for g in gold if g not in chunks]
            if missing:
                raise SystemExit(f"{item['id']}: unknown chunk ids {missing}")
            if item["tipe"] == "out_of_corpus":
                kind = "unanswerable"
            else:
                kind = "multihop" if len(gold) >= 2 else "factual"
            note = "; ".join(
                str(x)
                for x in (
                    category,
                    item.get("sumber_regulasi"),
                    item.get("sumber_pasal"),
                    item.get("status_verifikasi"),
                )
                if x
            )
            rows.append(
                {
                    "id": item["id"],
                    "question": item["pertanyaan"],
                    "reference_answer": item["expected_answer"],
                    "gold_chunk_ids": gold,
                    "type": kind,
                    "split": "test" if position % 3 == 2 else "dev",
                    "source_note": note,
                }
            )
    OUT.write_text(
        "".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows),
        encoding="utf-8",
        newline="\n",
    )
    sheet = [
        "# Lembar periksa gold chunk",
        "",
        "Dibuat oleh `data/eval/build_qa.py`. Tim memeriksa bahwa potongan gold memuat jawaban.",
        "",
        "| ID | Split | Tipe | Rujukan tim | Gold chunk | Cek (ya/tidak) |",
        "|---|---|---|---|---|---|",
    ]
    source = {i["id"]: i for k, v in package.items() if k != "metadata" for i in v}
    for r in rows:
        cited = source[r["id"]].get("sumber_pasal") or "(di luar korpus)"
        sheet.append(
            f"| {r['id']} | {r['split']} | {r['type']} | {cited} | "
            f"{', '.join(r['gold_chunk_ids']) or '-'} | |"
        )
    SHEET.write_text("\n".join(sheet) + "\n", encoding="utf-8", newline="\n")
    counts: dict[str, int] = {}
    for r in rows:
        key = f"{r['split']}/{r['type']}"
        counts[key] = counts.get(key, 0) + 1
    print(len(rows), "items", dict(sorted(counts.items())))


if __name__ == "__main__":
    main()
