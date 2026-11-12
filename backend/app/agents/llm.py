from pydantic import BaseModel
from pydantic_ai import Agent
from pydantic_ai.models.openrouter import OpenRouterModel
from pydantic_ai.providers.openrouter import OpenRouterProvider

from app.core.config import Settings


class Ping(BaseModel):
    reply: str
    language: str


def build_model(settings: Settings, model_name: str | None = None) -> OpenRouterModel:
    """Build an OpenRouter model. The model id always comes from env, never hard-coded."""
    name = model_name or settings.llm_model
    if not settings.openrouter_api_key or not name:
        raise RuntimeError("Set OPENROUTER_API_KEY and LLM_MODEL in .env")
    return OpenRouterModel(name, provider=OpenRouterProvider(api_key=settings.openrouter_api_key))


def build_ping_agent(settings: Settings) -> Agent[None, Ping]:
    return Agent(
        build_model(settings),
        output_type=Ping,
        instructions="Balas singkat dalam bahasa Indonesia; isi language dengan 'id'.",
    )
