"""Runtime settings. Everything environment-dependent lives here."""

from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPO_ROOT / "data"
RAW_DIR = DATA_DIR / "raw"
INTERIM_DIR = DATA_DIR / "interim"
PROCESSED_DIR = DATA_DIR / "processed"
MANUAL_DIR = DATA_DIR / "manual"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="ZEALO_", env_file=".env", extra="ignore")

    # CORS origins for the frontend. In the env var, a JSON list: '["https://..."]'.
    allowed_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    # How many finished simulation runs to keep in memory before evicting the oldest.
    run_cache_size: int = 8
    # Compute the default run in the background at startup (on in production, off in tests).
    warm_default_run: bool = False


settings = Settings()
