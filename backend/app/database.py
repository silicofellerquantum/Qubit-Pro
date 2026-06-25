"""
Database engine, session factory, and base declarative model.

Uses SQLAlchemy 2.0 async engine.
- Postgres (asyncpg)  — production default
- SQLite (aiosqlite)  — zero-setup dev default

The session dependency commits on success and rolls back on exceptions,
and correctly avoids double-committing on read-only requests.
"""

from __future__ import annotations

import logging
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------

_db_url = settings.database_url

if settings.is_sqlite:
    # SQLite requires check_same_thread=False for async use
    engine = create_async_engine(
        _db_url,
        echo=False,
        connect_args={"check_same_thread": False},
    )
else:
    engine = create_async_engine(
        _db_url,
        echo=False,
        pool_size=10,
        max_overflow=20,
        pool_pre_ping=True,
    )

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


# ---------------------------------------------------------------------------
# Base model
# ---------------------------------------------------------------------------

class Base(DeclarativeBase):
    pass


# ---------------------------------------------------------------------------
# Dependency — commit on success, rollback on error
# ---------------------------------------------------------------------------

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


# ---------------------------------------------------------------------------
# Init tables (dev/test — use Alembic migrations in production)
# ---------------------------------------------------------------------------

async def init_db() -> None:
    """Create all tables if they do not exist."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    log.info("Database tables ensured.")

    # Auto-migration fallback for existing databases
    try:
        async with engine.begin() as conn:
            from sqlalchemy import inspect, text
            def _check_and_migrate(connection):
                inspector = inspect(connection)
                columns = [col["name"] for col in inspector.get_columns("simulations")]
                if "artifact_path" not in columns:
                    log.info("Migration: Adding artifact_path column to simulations table.")
                    connection.execute(text("ALTER TABLE simulations ADD COLUMN artifact_path VARCHAR(256)"))
                if "artifact_retained" not in columns:
                    log.info("Migration: Adding artifact_retained column to simulations table.")
                    # For SQLite and Postgres, adding a boolean column with a default value is supported.
                    connection.execute(text("ALTER TABLE simulations ADD COLUMN artifact_retained BOOLEAN DEFAULT FALSE"))
            await conn.run_sync(_check_and_migrate)
            log.info("Database migrations check completed successfully.")
    except Exception as e:
        log.warning(f"Auto-migration check failed or skipped (non-fatal): {e}")

    try:
        from app.models import User, UserRole
        from app.auth import hash_password
        from sqlalchemy import select
        async with AsyncSessionLocal() as session:
            result = await session.execute(select(User).where(User.email == "admin@silicofeller.com"))
            if not result.scalar_one_or_none():
                demo_users = [
                    User(
                        id="u_admin",
                        name="Admin User",
                        email="admin@silicofeller.com",
                        hashed_password=hash_password("password"),
                        role=UserRole.admin,
                        organization="Silicofeller Labs",
                    ),
                    User(
                        id="u_org_manager",
                        name="Organization Manager",
                        email="manager@quantumlabs.com",
                        hashed_password=hash_password("password"),
                        role=UserRole.org_manager,
                        organization="Quantum Labs",
                    ),
                    User(
                        id="u_engineer",
                        name="Quantum Engineer",
                        email="engineer@quantumlabs.com",
                        hashed_password=hash_password("password"),
                        role=UserRole.engineer,
                        organization="Quantum Labs",
                    ),
                ]
                session.add_all(demo_users)
                await session.flush()

                # Seed high-fidelity default projects with a valid 2-qubit transmon design
                from app.constraints.constraints import DesignConstraints
                from app.services.design_pipeline import run_design_pipeline
                from app.models import Project, ProjectStatus
                import uuid

                log.info("Generating default high-fidelity 2-qubit transmon design for database seeding...")
                constraints = DesignConstraints.from_prompt_params({
                    "num_qubits": 2,
                    "topology": "grid",
                    "substrate": "silicon",
                    "metal": "aluminum",
                    "scale": 1.0,
                    "target_freq_ghz": 5.0
                })
                design_payload = await run_design_pipeline(constraints)

                for user in demo_users:
                    project = Project(
                        id=str(uuid.uuid4()),
                        owner_id=user.id,
                        name="Transmon_Processor_v2",
                        description="Pre-loaded high-fidelity 2-qubit transmon processor layout.",
                        topology="grid",
                        num_qubits=2,
                        target_frequency_ghz=5.0,
                        substrate_material="silicon",
                        metal_layer="aluminum",
                        status=ProjectStatus.in_progress,
                        design_payload=design_payload,
                    )
                    session.add(project)
                
                await session.commit()
                log.info("Demo users and projects seeded successfully.")
    except Exception as e:
        log.warning(f"Seeding skipped or failed: {e}", exc_info=True)


