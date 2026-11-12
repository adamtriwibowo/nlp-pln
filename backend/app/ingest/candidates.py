"""Simple lexical candidate search to help the team pick gold_chunk_ids (full BM25 comes in phase 2)."""

import math
import re
from collections import Counter

from app.ingest.models import ChunkRecord

_TOKEN = re.compile(r"\w+", re.UNICODE)
_STOP = {
    "yang",
    "dan",
    "atau",
    "di",
    "ke",
    "dari",
    "untuk",
    "dengan",
    "pada",
    "adalah",
    "apa",
    "siapa",
    "bagaimana",
    "dalam",
    "wajib",
    "oleh",
    "ini",
    "itu",
    "the",
    "of",
    "and",
    "to",
}


def tokens(text: str) -> list[str]:
    return [t for t in _TOKEN.findall(text.lower()) if t not in _STOP and len(t) > 1]


def top_candidates(
    question: str, chunks: list[ChunkRecord], k: int = 8
) -> list[tuple[float, ChunkRecord]]:
    q = set(tokens(question))
    if not q or not chunks:
        return []
    docs = [Counter(tokens(c.label + " " + c.text)) for c in chunks]
    n = len(docs)
    df = Counter(t for d in docs for t in d)
    scored: list[tuple[float, ChunkRecord]] = []
    for c, d in zip(chunks, docs, strict=True):
        length = sum(d.values()) or 1
        s = sum((1 + math.log(d[t])) * math.log(1 + n / df[t]) for t in q if d.get(t)) / math.sqrt(
            length
        )
        if s > 0:
            scored.append((s, c))
    scored.sort(key=lambda x: -x[0])
    return scored[:k]
