from functools import lru_cache
import os
from pydantic import BaseModel, Field


class Settings(BaseModel):
    service_api_key: str = Field(default_factory=lambda: os.getenv("ML_SERVICE_API_KEY", ""))
    max_request_bytes: int = Field(default_factory=lambda: int(os.getenv("ML_MAX_REQUEST_BYTES", "65536")), ge=1024, le=262144)
    rate_limit_per_minute: int = Field(default_factory=lambda: int(os.getenv("ML_RATE_LIMIT_PER_MINUTE", "180")), ge=10, le=1000)
    model_version: str = Field(default_factory=lambda: os.getenv("ML_MODEL_VERSION", "robust-baseline-v1.0.0"))


@lru_cache
def get_settings() -> Settings:
    return Settings()
