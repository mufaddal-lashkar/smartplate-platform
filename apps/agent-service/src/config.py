from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    service_token: str = "dev-service-token"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"

    main_service_url: str = "http://localhost:3001"
    main_service_read_token: str = "dev-read-token"
    plan_intent_max_tool_calls: int = 3
    plan_intent_timeout_seconds: float = 15.0
    plan_intent_graph_enabled: bool = True


settings = Settings()
