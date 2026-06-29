"""
Application configuration — loaded from environment / .env file.

Dev tip: copy .env.example → .env and set DATABASE_URL=sqlite+aiosqlite:///./dev.db
for zero-setup local development (no Postgres required).
"""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # App
    app_env: str = "development"
    max_qubits: int = 256

    # Database — defaults to SQLite for zero-setup local dev
    database_url: str = "sqlite+aiosqlite:///./dev.db"
    sync_database_url: str = "sqlite:///./dev.db"

    # Redis (optional — only needed for task queues in production)
    redis_url: str = "redis://localhost:6379/0"

    # Auth
    secret_key: str = "dev-secret-key-change-in-production-minimum-32-chars"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 10080  # 7 days

    # CORS — localhost ports used by Vite dev server
    cors_origins: str = "http://localhost:3000,http://localhost:5173,http://localhost:5174"

    # Claude / Anthropic (optional — falls back to rule-based assistant if empty)
    anthropic_api_key: str = ""

    # Razorpay payments — set in .env before going live
    # Test keys start with rzp_test_; live keys with rzp_live_
    razorpay_key_id: str = ""           # RAZORPAY_KEY_ID
    razorpay_key_secret: str = ""       # RAZORPAY_KEY_SECRET
    razorpay_webhook_secret: str = ""   # RAZORPAY_WEBHOOK_SECRET (set in Razorpay dashboard)

    razorpay_key_id: str = ""           # RAZORPAY_KEY_ID
    razorpay_key_secret: str = ""       # RAZORPAY_KEY_SECRET
    razorpay_webhook_secret: str = ""   # RAZORPAY_WEBHOOK_SECRET (set in Razorpay dashboard)

    # Physics grounding (SQuADDS). Always-on by design — no per-request toggle.
    # squadds_dataset_dir: path to the locally mirrored SQuADDS dataset.
    # Defaults to <repo-root>/backend/squadds_mirror (created by ensure_mirror()).
    # Set to "" to disable SQuADDS provider and fall back to analytic.
    physics_grounding_enabled: bool = True
    squadds_dataset_dir: str = ""        # "" → auto-resolve to squadds_mirror/
    squadds_refresh_hours: int = 168     # Periodic mirror refresh interval

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")


settings = Settings()
