from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment / .env (never hard-code secrets)."""

    model_config = SettingsConfigDict(env_file=("../.env", ".env"), extra="ignore")

    openrouter_api_key: str = ""
    llm_model: str = ""
    judge_model: str = ""
    embedding_provider: str = "openrouter"
    embedding_model: str = ""
    database_url: str = "postgresql+psycopg://k2:k2@127.0.0.1:5434/k2rag"
    admin_token: str = ""
    review_token: str = ""
    jwt_secret: str = ""
    daily_cost_limit_usd: float = 5.0
    langfuse_public_key: str = ""
    langfuse_secret_key: str = ""
    langfuse_host: str = ""
    logfire_token: str = ""
    otel_exporter_otlp_endpoint: str = ""
    cors_origins: str = "http://localhost:3000"


@lru_cache
def get_settings() -> Settings:
    return Settings()
