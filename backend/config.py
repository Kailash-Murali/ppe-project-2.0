# config.py
# Application settings via pydantic-settings (reads from .env).
# Ambiguity: model_path validation (file vs. directory) is done at startup in main.py
# rather than here, because pydantic-settings validators run at import time before
# the working directory is necessarily the backend folder.

from __future__ import annotations

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # ── Model ─────────────────────────────────────────────────────────────────
    # model_path: directory for OpenVINO or .pt file path; validated at startup.
    model_path: str = "best_openvino_model"
    model_device: str = "AUTO"

    # ── Queue / inference ─────────────────────────────────────────────────────
    frame_queue_size: int = Field(default=10, ge=1)        # must be >= 1
    inference_timeout: float = Field(default=0.5, gt=0)    # seconds; must be > 0

    # ── ThreadPoolExecutor ────────────────────────────────────────────────────
    # Number of worker threads in the executor. Set to 1 for sequential
    # OpenVINO inference (thread-affinity requirement). Increase only for
    # CPU-only workloads that are thread-safe.
    executor_workers: int = Field(default=1, ge=1)

    # ── Logging ───────────────────────────────────────────────────────────────
    # Structured JSON log level. Accepted values: DEBUG, INFO, WARNING, ERROR.
    log_level: str = "INFO"

    # ── CORS ──────────────────────────────────────────────────────────────────
    # Comma-separated list of allowed origins for CORS.
    # Example: CORS_ALLOWED_ORIGINS=https://ppe.com,https://staging.ppe.com
    # Defaults to ["http://localhost:5173"] which is safe for local development.
    # Restrict in production by setting this env var to specific frontend origins.
    cors_allowed_origins: list[str] = Field(default=["http://localhost:5173"])

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
    )


# Module-level singleton — import and use `settings` everywhere.
settings = Settings()
