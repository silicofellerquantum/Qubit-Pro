"""
Application configuration — loaded from environment / .env file.

Dev tip: copy .env.example → .env and set DATABASE_URL=sqlite+aiosqlite:///./dev.db
for zero-setup local development (no Postgres required).
"""

from __future__ import annotations

import dotenv
dotenv.load_dotenv()

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # App
    app_env: str = "development"
    max_qubits: int = 256
    palace_mock_mode: bool = True
    keep_simulation_artifacts: bool = True
    gmsh_coarse_test: bool = False

    # Simulation Workspace Settings
    workspace_root: str = "tmp/simulations"
    workspace_archive_dir: str = "outputs/simulations"
    workspace_retention_days: int = 7
    workspace_cleanup_timeout_seconds: float = 86400.0  # 24 hours
    workspace_max_count: int = 1000

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
    cors_origins: str = "http://localhost:3000,http://localhost:5173,http://localhost:5174,http://localhost:8080"

    # Claude / Anthropic (optional — falls back to rule-based assistant if empty)
    anthropic_api_key: str = ""

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

import os
if settings.gmsh_coarse_test:
    os.environ["GMSH_COARSE_TEST"] = "true"


def validate_config() -> None:
    """Validate critical production environment configurations and secrets."""
    if not settings.is_production:
        return

    errors = []
    
    # 1. Check Secret Key
    if settings.secret_key == "dev-secret-key-change-in-production-minimum-32-chars":
        errors.append(
            "SECRET_KEY is still set to the default developer key. This is a severe security risk."
        )
    elif len(settings.secret_key) < 32:
        errors.append(
            f"SECRET_KEY is too short ({len(settings.secret_key)} chars). Production keys must be at least 32 characters long."
        )

    # 2. Check Database URL
    if settings.is_sqlite:
        errors.append(
            "SQLite is not supported in production. Please configure DATABASE_URL to use PostgreSQL."
        )

    if errors:
        import sys
        print("\n" + "="*70, file=sys.stderr)
        print("CRITICAL CONFIGURATION FAILURE — STARTUP BLOCKED", file=sys.stderr)
        print("="*70, file=sys.stderr)
        for err in errors:
            print(f"[-] {err}", file=sys.stderr)
        print("="*70 + "\n", file=sys.stderr)
        raise ValueError("Invalid production configuration. Startup aborted.")
