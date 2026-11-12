"""Embedding providers behind one interface: `openrouter` (API) and `local` (sentence-transformers)."""

import asyncio
import hashlib
import json
from pathlib import Path
from typing import Protocol

import httpx

from app.core.config import Settings

OPENROUTER_EMBEDDINGS_URL = "https://openrouter.ai/api/v1/embeddings"
REPO_ROOT = Path(__file__).resolve().parents[3]
QUERY_CACHE = REPO_ROOT / "runs" / "cache" / "query_embeddings.json"


class EmbeddingProvider(Protocol):
    model: str

    async def embed(self, texts: list[str], *, is_query: bool = False) -> list[list[float]]: ...


def text_sha(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def _e5_prefix(model: str, is_query: bool) -> str:
    if "e5" in model.lower():
        return "query: " if is_query else "passage: "
    return ""


class OpenRouterEmbeddings:
    def __init__(self, api_key: str, model: str, batch_size: int = 32) -> None:
        if not api_key or not model:
            raise RuntimeError("Set OPENROUTER_API_KEY and EMBEDDING_MODEL in .env")
        self.api_key, self.model, self.batch_size = api_key, model, batch_size

    async def embed(self, texts: list[str], *, is_query: bool = False) -> list[list[float]]:
        prefix = _e5_prefix(self.model, is_query)
        out: list[list[float]] = []
        async with httpx.AsyncClient(timeout=120) as client:
            for i in range(0, len(texts), self.batch_size):
                batch = [prefix + t for t in texts[i : i + self.batch_size]]
                out.extend(await self._post(client, batch))
        return out

    async def _post(self, client: httpx.AsyncClient, batch: list[str]) -> list[list[float]]:
        last: Exception | None = None
        for attempt in range(4):
            try:
                r = await client.post(
                    OPENROUTER_EMBEDDINGS_URL,
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    json={"model": self.model, "input": batch, "encoding_format": "float"},
                )
                if r.status_code in (429, 500, 502, 503, 504):
                    raise httpx.HTTPStatusError(r.text[:200], request=r.request, response=r)
                r.raise_for_status()
                data = sorted(r.json()["data"], key=lambda d: d["index"])
                return [[float(x) for x in d["embedding"]] for d in data]
            except (httpx.HTTPError, KeyError) as exc:
                last = exc
                await asyncio.sleep(1.5 * (attempt + 1))
        raise RuntimeError(f"embedding request failed after retries: {last}")


class LocalEmbeddings:
    """sentence-transformers model; needs `uv sync --extra local` (large download, optional)."""

    def __init__(self, model: str) -> None:
        try:
            from sentence_transformers import SentenceTransformer
        except ImportError as exc:  # pragma: no cover - optional dependency
            raise RuntimeError(
                "sentence-transformers is not installed. Run: uv sync --extra local"
            ) from exc
        self.model = model
        self._st = SentenceTransformer(model)

    async def embed(self, texts: list[str], *, is_query: bool = False) -> list[list[float]]:
        prefix = _e5_prefix(self.model, is_query)
        vecs = await asyncio.to_thread(
            self._st.encode, [prefix + t for t in texts], normalize_embeddings=True
        )
        return [[float(x) for x in v] for v in vecs]


def build_provider(settings: Settings, model: str | None = None) -> EmbeddingProvider:
    model = model or settings.embedding_model
    if settings.embedding_provider == "local":
        return LocalEmbeddings(model)
    return OpenRouterEmbeddings(settings.openrouter_api_key, model)


class CachedQueryEmbedder:
    """Caches query embeddings on disk (keyed by model + text) so eval reruns cost nothing."""

    def __init__(self, provider: EmbeddingProvider, path: Path = QUERY_CACHE) -> None:
        self.provider, self.path = provider, path
        self._cache: dict[str, list[float]] = {}
        if path.exists():
            self._cache = json.loads(path.read_text(encoding="utf-8"))

    def _key(self, text: str) -> str:
        return f"{self.provider.model}|{text_sha(text)}"

    async def embed_query(self, text: str) -> list[float]:
        key = self._key(text)
        if key not in self._cache:
            self._cache[key] = (await self.provider.embed([text], is_query=True))[0]
            self.path.parent.mkdir(parents=True, exist_ok=True)
            self.path.write_text(json.dumps(self._cache), encoding="utf-8")
        return self._cache[key]
