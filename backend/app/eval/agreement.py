"""Judge-vs-human agreement: percent agreement and Cohen's kappa (binary labels)."""

from collections.abc import Sequence


def percent_agreement(a: Sequence[bool], b: Sequence[bool]) -> float:
    if len(a) != len(b) or not a:
        raise ValueError("need two non-empty label lists of equal length")
    return sum(x == y for x, y in zip(a, b, strict=True)) / len(a)


def cohens_kappa(a: Sequence[bool], b: Sequence[bool]) -> float:
    """kappa = (po - pe) / (1 - pe). Returns 1.0 when both raters are constant and identical."""
    po = percent_agreement(a, b)
    n = len(a)
    pa, pb = sum(a) / n, sum(b) / n
    pe = pa * pb + (1 - pa) * (1 - pb)
    if pe == 1.0:
        return 1.0 if po == 1.0 else 0.0
    return (po - pe) / (1 - pe)
