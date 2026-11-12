import math

import pytest

from app.eval.retrieval_metrics import (
    aggregate,
    hit_at_k,
    ndcg_at_k,
    recall_at_k,
    reciprocal_rank,
    score_question,
)
from app.retrieval.base import ChunkDoc, ExperimentConfig, load_config
from app.retrieval.bm25 import BM25Retriever
from app.retrieval.hybrid_rrf import HybridRetriever, rrf
from app.retrieval.tokenizer import tokenize

# ---- metrics: values computed by hand -------------------------------------------------


def test_recall_hit_mrr_hand_computed() -> None:
    retrieved = ["a", "b", "c", "d", "e"]
    assert recall_at_k(retrieved, ["c"], 1) == 0.0
    assert recall_at_k(retrieved, ["c"], 3) == 1.0
    assert recall_at_k(retrieved, ["a", "c"], 1) == 0.5
    assert recall_at_k(retrieved, ["a", "z"], 5) == 0.5
    assert hit_at_k(retrieved, ["z", "e"], 5) == 1.0
    assert hit_at_k(retrieved, ["z", "e"], 3) == 0.0
    assert reciprocal_rank(retrieved, ["c"]) == pytest.approx(1 / 3)
    assert reciprocal_rank(retrieved, ["z"]) == 0.0


def test_ndcg_hand_computed() -> None:
    retrieved = ["a", "b", "c", "d", "e"]
    # one gold at rank 3: DCG = 1/log2(4) = 0.5, ideal = 1/log2(2) = 1
    assert ndcg_at_k(retrieved, ["c"], 5) == pytest.approx(0.5)
    # gold at ranks 1 and 3: DCG = 1 + 0.5; ideal = 1 + 1/log2(3)
    expected = 1.5 / (1 + 1 / math.log2(3))
    assert ndcg_at_k(retrieved, ["a", "c"], 5) == pytest.approx(expected)
    assert ndcg_at_k(retrieved, ["a"], 5) == pytest.approx(1.0)
    assert ndcg_at_k(retrieved, ["z"], 5) == 0.0


def test_recall_requires_gold() -> None:
    with pytest.raises(ValueError):
        recall_at_k(["a"], [], 1)


def test_aggregate_overall_and_per_type() -> None:
    s1 = score_question("q1", "factual", ["a", "b"], ["a"])  # mrr 1
    s2 = score_question("q2", "factual", ["x", "a"], ["a"])  # mrr 0.5
    s3 = score_question("q3", "multihop", ["x", "y"], ["a", "b"])  # mrr 0
    agg = aggregate([s1, s2, s3])
    assert agg["all"]["n"] == 3
    assert agg["all"]["mrr"] == pytest.approx(0.5)
    assert agg["factual"]["mrr"] == pytest.approx(0.75)
    assert agg["factual"]["recall@1"] == pytest.approx(0.5)
    assert agg["multihop"]["recall@10"] == 0.0


# ---- RRF: hand computed ---------------------------------------------------------------


def test_rrf_scores_and_tie_breaking() -> None:
    out = rrf([["a", "b", "c"], ["b", "a", "d"]], k=60)
    ids = [i for i, _ in out]
    scores = dict(out)
    assert scores["a"] == pytest.approx(1 / 61 + 1 / 62)
    assert scores["a"] == pytest.approx(scores["b"])
    assert ids == ["a", "b", "c", "d"]  # ties: best rank, then id
    assert scores["c"] == pytest.approx(1 / 63)


def test_rrf_rewards_agreement_and_ignores_duplicates() -> None:
    out = rrf([["x", "y"], ["y"]], k=60)
    assert out[0][0] == "y"
    dup = rrf([["x", "x", "x"]], k=60)
    assert dup == [("x", pytest.approx(1 / 61))]
    assert rrf([], k=60) == []


# ---- tokenizer / BM25 -----------------------------------------------------------------


def test_tokenizer_basic_and_stem() -> None:
    assert tokenize("Instalasi Tenaga Listrik, (Pasal 12)!") == [
        "instalasi",
        "tenaga",
        "listrik",
        "pasal",
        "12",
    ]
    assert tokenize("yang dan untuk") == []
    assert tokenize("pemeliharaan", stem=True) == ["pelihara"]


DOCS = [
    ChunkDoc(
        chunk_id="D-P1",
        label="Pasal 1",
        text="Sertifikat kompetensi teknisi listrik wajib dimiliki.",
    ),
    ChunkDoc(
        chunk_id="D-P2",
        label="Pasal 2",
        text="Pemeliharaan instalasi tenaga listrik dilakukan berkala.",
    ),
    ChunkDoc(
        chunk_id="D-P3", label="Pasal 3", text="Sanksi administratif berupa teguran tertulis."
    ),
]


@pytest.mark.asyncio
async def test_bm25_ranks_relevant_first_and_handles_unknown_tokens() -> None:
    r = BM25Retriever(DOCS)
    hits = await r.retrieve("sertifikat kompetensi", 3)
    assert hits[0].chunk_id == "D-P1" and hits[0].rank == 1
    assert await r.retrieve("zzzz qqqq", 3) == []
    assert await r.retrieve("", 3) == []


@pytest.mark.asyncio
async def test_bm25_stemming_matches_inflections() -> None:
    plain = BM25Retriever(DOCS, stem=False)
    stem = BM25Retriever(DOCS, stem=True)
    assert await plain.retrieve("memelihara instalasi", 1) != []  # 'instalasi' still matches
    hits = await stem.retrieve("memelihara", 1)
    assert hits and hits[0].chunk_id == "D-P2"


@pytest.mark.asyncio
async def test_hybrid_fuses_two_retrievers() -> None:
    class Fixed:
        name = "fixed"

        def __init__(self, ids: list[str]) -> None:
            self.ids = ids

        async def retrieve(self, query: str, k: int):  # type: ignore[no-untyped-def]
            from app.retrieval.base import to_hits

            return to_hits([(i, 1.0) for i in self.ids], k)

    h = HybridRetriever([Fixed(["a", "b", "c"]), Fixed(["c", "b", "d"])], rrf_k=60)
    hits = await h.retrieve("q", 3)
    # c = 1/63 + 1/61 = 0.032266 narrowly beats b = 1/62 + 1/62 = 0.032258; a = 1/61 = 0.016393
    assert [x.chunk_id for x in hits] == ["c", "b", "a"]
    assert [x.rank for x in hits] == [1, 2, 3]


def test_config_files_load() -> None:
    for cid in ("B0", "B1", "B2", "M1", "M2", "M3"):
        cfg = load_config(cid)
        assert isinstance(cfg, ExperimentConfig) and cfg.id == cid
    assert load_config("M1").retriever == "hybrid"
