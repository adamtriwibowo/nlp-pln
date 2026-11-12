from app.core.config import Settings


def test_settings_defaults() -> None:
    s = Settings(_env_file=None)
    assert s.embedding_provider == "openrouter"
    assert s.openrouter_api_key == ""
