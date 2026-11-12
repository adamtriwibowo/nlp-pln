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


if __name__ == "__main__":
    app()
