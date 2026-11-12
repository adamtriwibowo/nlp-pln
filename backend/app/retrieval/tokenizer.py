"""Simple Indonesian/English tokenizer for BM25 (lowercase, strip punctuation, optional stemming)."""

import re
from functools import lru_cache

_TOKEN = re.compile(r"[^\W_]+", re.UNICODE)

# Very small stoplist of Indonesian function words; legal vocabulary is kept intact.
STOPWORDS = frozenset(
    "yang dan atau di ke dari untuk dengan pada adalah dalam oleh ini itu sebagai the of and to".split()
)


@lru_cache(maxsize=1)
def _stemmer():  # type: ignore[no-untyped-def]
    from Sastrawi.Stemmer.StemmerFactory import StemmerFactory

    return StemmerFactory().create_stemmer()


@lru_cache(maxsize=50000)
def _stem(word: str) -> str:
    return str(_stemmer().stem(word))


def tokenize(text: str, stem: bool = False, stopwords: bool = True) -> list[str]:
    toks = _TOKEN.findall(text.lower())
    if stopwords:
        toks = [t for t in toks if t not in STOPWORDS]
    if stem:
        toks = [_stem(t) for t in toks]
    return toks
