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


if __name__ == "__main__":
    app()
