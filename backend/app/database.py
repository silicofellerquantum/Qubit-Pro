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
    """
    Provide a DB session. Endpoints that do writes MUST call await db.commit()
    themselves. This dependency will attempt to commit any remaining work and
    rollback on unhandled exceptions.
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            # Commit any uncommitted work (no-op if endpoint already committed)
            if session.in_transaction():
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

    if not settings.is_sqlite:
        try:
            from sqlalchemy import text
            async with engine.connect() as conn:
                await conn.execute(text("COMMIT"))
                await conn.execute(text("ALTER TYPE featurekey ADD VALUE IF NOT EXISTS 'import_json'"))
                await conn.execute(text("ALTER TYPE featurekey ADD VALUE IF NOT EXISTS 'export_json'"))
                await conn.commit()
            log.info("Postgres enum types updated successfully.")
        except Exception as e:
            log.warning(f"Could not update Postgres enum types: {e}")

    try:
        from app.models import User, UserRole, Subscription, TeamInvite
        from app.auth import hash_password
        from sqlalchemy import select
        async with AsyncSessionLocal() as session:

            # ── 1. Core demo users ──────────────────────────────────────────
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
                        is_verified=True,
                        is_premium=True,
                        plan="pro",
                        subscription_status="active",
                    ),
                    User(
                        id="u_org_manager",
                        name="Organization Manager",
                        email="manager@quantumlabs.com",
                        hashed_password=hash_password("password"),
                        role=UserRole.org_manager,
                        organization="Quantum Labs",
                        is_verified=True,
                        is_premium=True,
                    ),
                    User(
                        id="u_engineer",
                        name="Quantum Engineer",
                        email="engineer@quantumlabs.com",
                        hashed_password=hash_password("password"),
                        role=UserRole.engineer,
                        organization="Quantum Labs",
                        is_verified=True,
                        is_premium=False,
                    ),
                ]
                session.add_all(demo_users)
                await session.commit()
                log.info("Demo users seeded successfully.")

            # ── 2. Demo subscriptions: 10 Professional + 10 Team for admin ──
            sub_result = await session.execute(
                select(Subscription).where(Subscription.owner_id == "u_admin")
            )
            if not sub_result.scalars().first():
                demo_subscriptions = [
                    Subscription(
                        id="sub_demo_basic",
                        owner_id="u_admin",
                        razorpay_subscription_id="rzp_demo_basic_10",
                        plan="basic",          # Professional plan
                        billing_cycle="monthly",
                        quantity=10,           # 10 Professional licenses purchased
                        status="active",
                    ),
                    Subscription(
                        id="sub_demo_pro",
                        owner_id="u_admin",
                        razorpay_subscription_id="rzp_demo_pro_10",
                        plan="pro",            # Team plan
                        billing_cycle="monthly",
                        quantity=10,           # 10 Team licenses purchased
                        status="active",
                    ),
                ]
                session.add_all(demo_subscriptions)
                await session.commit()
                log.info("Demo subscriptions seeded (10 Professional + 10 Team).")

            # ── 3. Demo team members: 3 on Professional + 3 on Team ─────────
            member_check = await session.execute(
                select(User).where(User.team_owner_id == "u_admin")
            )
            if not member_check.scalars().first():
                # 3 Professional (basic) plan members
                professional_members = [
                    User(
                        id=f"u_pro_member_{i}",
                        name=name,
                        email=email,
                        hashed_password=hash_password("password"),
                        role=UserRole.engineer,
                        organization="Silicofeller Labs",
                        is_verified=True,
                        is_premium=True,
                        plan="basic",
                        billing_cycle="monthly",
                        subscription_status="managed",
                        team_owner_id="u_admin",
                    )
                    for i, (name, email) in enumerate([
                        ("Alice Chen",    "alice.chen@silicofeller.com"),
                        ("Bob Martinez",  "bob.martinez@silicofeller.com"),
                        ("Carol Singh",   "carol.singh@silicofeller.com"),
                    ])
                ]
                # 3 Team (pro) plan members
                team_members = [
                    User(
                        id=f"u_team_member_{i}",
                        name=name,
                        email=email,
                        hashed_password=hash_password("password"),
                        role=UserRole.engineer,
                        organization="Silicofeller Labs",
                        is_verified=True,
                        is_premium=True,
                        plan="pro",
                        billing_cycle="monthly",
                        subscription_status="managed",
                        team_owner_id="u_admin",
                    )
                    for i, (name, email) in enumerate([
                        ("David Kim",     "david.kim@silicofeller.com"),
                        ("Eva Rossi",     "eva.rossi@silicofeller.com"),
                        ("Frank Okafor",  "frank.okafor@silicofeller.com"),
                    ])
                ]
                session.add_all(professional_members + team_members)
                await session.commit()
                log.info(
                    "Demo team members seeded: 3 Professional + 3 Team "
                    "(7/10 Professional seats, 4/10 Team seats used including admin)."
                )

    except Exception as e:
        log.warning(f"Seeding skipped or failed: {e}")

