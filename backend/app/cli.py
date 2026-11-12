import asyncio

import httpx
import typer

from app.core.config import get_settings

app = typer.Typer(help="K2-RAG command line")


@app.command("list-models")
def list_models(match: str = typer.Option("", help="substring filter on model id")) -> None:
    """List OpenRouter models that support tools or structured outputs."""
    r = httpx.get("https://openrouter.ai/api/v1/models", timeout=30)
    r.raise_for_status()
    for m in sorted(r.json()["data"], key=lambda x: x["id"]):
        params = set(m.get("supported_parameters") or [])
        if match in m["id"] and {"tools", "structured_outputs"} & params:
            price = m.get("pricing", {})
            typer.echo(f"{m['id']:60} in={price.get('prompt')} out={price.get('completion')}")


@app.command("check-llm")
def check_llm() -> None:
    """Send one structured request; print model, tokens, cost."""
    from app.agents.llm import build_ping_agent

    settings = get_settings()
    agent = build_ping_agent(settings)
    result = asyncio.run(agent.run("Sapa saya dan sebutkan bahasa yang kamu pakai."))
    usage = result.usage
    typer.echo(f"model:  {settings.llm_model}")
    typer.echo(f"output: {result.output}")
    typer.echo(f"tokens: in={usage.input_tokens} out={usage.output_tokens}")
    try:
        typer.echo(f"cost:   ${result.response.cost().total_price} USD")
    except Exception:  # price data may be unavailable for some models
        typer.echo("cost:   n/a (see OpenRouter dashboard)")


@app.command("ingest")
def ingest(
    no_db: bool = typer.Option(False, help="Skip database; only write chunks.jsonl and report"),
) -> None:
    """Ingest PDFs in data/manifest.yaml: parse, chunk, store, and write the ingestion report."""
    from app.db.session import SessionLocal, engine
    from app.services import ingest_service as svc

    entries, reports, chunks, version = svc.run_pipeline()
    svc.write_jsonl(chunks)
    svc.write_report(entries, reports, chunks, version)
    if not no_db:

        async def _persist() -> None:
            async with SessionLocal() as session:
                await svc.persist(session, entries, reports, chunks, version)
            await engine.dispose()

        asyncio.run(_persist())
    for r in reports:
        typer.echo(
            f"{r.doc_id} {r.status:20} pages={r.pages:3} pasal={r.pasal_count:3} chunks={r.chunks:3}"
        )
    typer.echo(f"corpus_version={version} total_chunks={len(chunks)}")


@app.command("qa-candidates")
def qa_candidates(question: str, k: int = 8) -> None:
    """Show candidate chunks for a question (helps choose gold_chunk_ids; you write the QA)."""
    from app.ingest.candidates import top_candidates
    from app.services.ingest_service import read_jsonl

    chunks = read_jsonl()
    if not chunks:
        typer.echo("No chunks found. Run `k2 ingest` first.")
        raise typer.Exit(1)
    for score, c in top_candidates(question, chunks, k):
        snippet = c.text.replace(chr(10), " ")[:160]
        typer.echo(f"{score:6.2f}  {c.chunk_id:22} p{c.page_start:<3} {c.label}")
        typer.echo(f"        {snippet}")


@app.command("qa-validate")
def qa_validate(path: str = "../data/eval/qa.jsonl") -> None:
    """Validate qa.jsonl against the schema and the ingested chunk ids."""
    from pathlib import Path

    from app.eval.qa_schema import check_gold_exist, load_qa
    from app.services.ingest_service import read_jsonl

    items = load_qa(Path(path))
    problems = check_gold_exist(items, {c.chunk_id for c in read_jsonl()})
    for p in problems:
        typer.echo(f"ERROR {p}")
    typer.echo(f"{len(items)} items, {len(problems)} problems")
    if problems:
        raise typer.Exit(1)


@app.command("index")
def index_cmd() -> None:
    """Build/refresh dense embeddings in pgvector (idempotent; only changed chunks are embedded)."""
    from app.db.session import SessionLocal, engine
    from app.retrieval.embeddings import build_provider
    from app.services.index_service import build_index

    settings = get_settings()
    provider = build_provider(settings)

    async def _run() -> None:
        async with SessionLocal() as session:
            st = await build_index(
                session, provider, external_api=settings.embedding_provider != "local"
            )
        await engine.dispose()
        typer.echo(
            f"model={st.model} total={st.total} embedded={st.embedded} unchanged={st.unchanged} "
            f"removed={st.removed} skipped_not_api_allowed={st.skipped_not_api_allowed}"
        )

    asyncio.run(_run())


@app.command("search")
def search_cmd(
    query: str, config: str = typer.Option("M1", help="B1, B2, M1, M2"), k: int = 5
) -> None:
    """Run one query through a retrieval config and print the top chunks."""
    from app.db.models import Chunk
    from app.db.session import SessionLocal, engine
    from app.retrieval.base import load_config
    from app.retrieval.factory import build_retriever

    settings = get_settings()
    cfg = load_config(config)

    async def _run() -> None:
        async with SessionLocal() as session:
            retriever = await build_retriever(cfg, session, settings)
            hits = await retriever.retrieve(query, k)
            for h in hits:
                ch = await session.get(Chunk, h.chunk_id)
                label = ch.hierarchy.get("label", "") if ch else ""
                snippet = (ch.text if ch else "").replace(chr(10), " ")[:140]
                typer.echo(f"{h.rank}. {h.score:8.4f}  {h.chunk_id:20} {label}")
                typer.echo(f"     {snippet}")
        await engine.dispose()

    asyncio.run(_run())


@app.command("eval")
def eval_cmd(
    config: str = typer.Option(..., help="B0, B1, B2, M1, M2, M3"),
    split: str = typer.Option("dev", help="dev or test"),
    final: bool = typer.Option(False, help="Required for the frozen test split"),
    qa: str = "../data/eval/qa.jsonl",
) -> None:
    """Evaluate retrieval (phase 2). Generation metrics arrive in phase 3."""
    from pathlib import Path

    from app.db.session import SessionLocal, engine
    from app.eval.qa_schema import check_gold_exist, load_qa
    from app.eval.retrieval_runner import run_retrieval_eval
    from app.retrieval.base import load_config
    from app.retrieval.factory import build_retriever
    from app.services.ingest_service import read_jsonl

    if split == "test" and not final:
        typer.echo("The test split is frozen. Use --final only for the final evaluation.")
        raise typer.Exit(1)
    cfg = load_config(config)
    if cfg.retriever in ("none", "agentic"):
        typer.echo(f"{config} has no standalone retrieval; it is evaluated in phase 3.")
        raise typer.Exit(0)
    items = [i for i in load_qa(Path(qa)) if i.split == split]
    if not items:
        typer.echo(f"No questions for split '{split}' in {qa}. Add some (see skill add-qa).")
        raise typer.Exit(1)
    problems = check_gold_exist(items, {c.chunk_id for c in read_jsonl()})
    if problems:
        typer.echo(chr(10).join(problems))
        raise typer.Exit(1)
    settings = get_settings()

    async def _run() -> None:
        async with SessionLocal() as session:
            retriever = await build_retriever(cfg, session, settings)
            run = await run_retrieval_eval(cfg, retriever, items, session, settings, split)
        await engine.dispose()
        typer.echo((run.directory / "summary.md").read_text(encoding="utf-8"))
        typer.echo(f"saved: {run.directory}")

    asyncio.run(_run())


if __name__ == "__main__":
    app()
