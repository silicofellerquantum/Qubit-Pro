import asyncio
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from app.database import Base, get_db
from app.auth import get_current_user
from app.models import User, UserRole, FeatureKey, UserFeatureUsage
from app.main import app

# Create a clean in-memory SQLite database for testing feature gating
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"
engine = create_async_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
AsyncSessionTesting = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

# Mock user data
mock_free_user = User(
    id="test_free_user_id",
    name="Free User",
    email="free@test.com",
    role=UserRole.engineer,
    is_premium=False,
    is_verified=True,
    is_active=True,
)

mock_premium_user = User(
    id="test_premium_user_id",
    name="Premium User",
    email="premium@test.com",
    role=UserRole.engineer,
    is_premium=True,
    is_verified=True,
    is_active=True,
)

active_user = mock_free_user


# Dependency overrides
async def override_get_db():
    async with AsyncSessionTesting() as session:
        yield session


async def override_get_current_user():
    return active_user


@pytest.fixture(autouse=True)
async def setup_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


app.dependency_overrides[get_db] = override_get_db
app.dependency_overrides[get_current_user] = override_get_current_user


@pytest.mark.anyio
async def test_free_user_flow():
    global active_user
    active_user = mock_free_user

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # 1. GET should be allowed initially
        res = await ac.get("/api/feature-usage/download_svg")
        assert res.status_code == 200
        assert res.json() == {"allowed": True, "isPremium": False}

        # 2. Record first usage
        res = await ac.post("/api/feature-usage/download_svg")
        assert res.status_code == 200
        assert res.json() == {"allowed": True, "isPremium": False}

        # 3. GET should now return allowed: False
        res = await ac.get("/api/feature-usage/download_svg")
        assert res.status_code == 200
        assert res.json() == {"allowed": False, "isPremium": False}

        # 4. POSTing again should fail/be blocked
        res = await ac.post("/api/feature-usage/download_svg")
        assert res.status_code == 200
        assert res.json() == {"allowed": False, "isPremium": False}


@pytest.mark.anyio
async def test_premium_user_flow():
    global active_user
    active_user = mock_premium_user

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # Premium always returns allowed: True and isPremium: True, without writing to DB
        for _ in range(3):
            res = await ac.get("/api/feature-usage/download_svg")
            assert res.status_code == 200
            assert res.json() == {"allowed": True, "isPremium": True}

            res = await ac.post("/api/feature-usage/download_svg")
            assert res.status_code == 200
            assert res.json() == {"allowed": True, "isPremium": True}


@pytest.mark.anyio
async def test_invalid_feature_key():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        res = await ac.get("/api/feature-usage/invalid_key_123")
        assert res.status_code == 400
        assert "Invalid feature key" in res.json()["detail"]


@pytest.mark.anyio
async def test_concurrent_race_condition():
    global active_user
    active_user = mock_free_user

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # Run two simultaneous POST requests for same key
        res1, res2 = await asyncio.gather(
            ac.post("/api/feature-usage/download_png"),
            ac.post("/api/feature-usage/download_png"),
        )
        
        allowed1 = res1.json()["allowed"]
        allowed2 = res2.json()["allowed"]

        # Exactly one must succeed (allowed: True) and one must be blocked (allowed: False)
        assert (allowed1 is True and allowed2 is False) or (allowed1 is False and allowed2 is True)


@pytest.mark.anyio
async def test_run_code_gating():
    global active_user
    active_user = mock_free_user

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # 1. Allowed initially
        res = await ac.post("/design/run-code", json={"code": "design.rebuild()"})
        assert res.status_code == 200

        # 2. Record usage
        await ac.post("/api/feature-usage/run_code")

        # 3. Blocked subsequent call (403 Forbidden)
        res = await ac.post("/design/run-code", json={"code": "design.rebuild()"})
        assert res.status_code == 403
        assert "Upgrade to Pro" in res.json()["error"]

        # 4. Premium user bypasses run-code block
        active_user = mock_premium_user
        res = await ac.post("/design/run-code", json={"code": "design.rebuild()"})
        assert res.status_code == 200


@pytest.mark.anyio
async def test_import_export_json_gating():
    global active_user
    active_user = mock_free_user

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # Test import_json
        # 1. GET allowed initially
        res = await ac.get("/api/feature-usage/import_json")
        assert res.status_code == 200
        assert res.json() == {"allowed": True, "isPremium": False}

        # 2. Record first usage
        res = await ac.post("/api/feature-usage/import_json")
        assert res.status_code == 200
        assert res.json() == {"allowed": True, "isPremium": False}

        # 3. GET blocked subsequently
        res = await ac.get("/api/feature-usage/import_json")
        assert res.status_code == 200
        assert res.json() == {"allowed": False, "isPremium": False}

        # Test export_json
        # 1. GET allowed initially
        res = await ac.get("/api/feature-usage/export_json")
        assert res.status_code == 200
        assert res.json() == {"allowed": True, "isPremium": False}

        # 2. Record first usage
        res = await ac.post("/api/feature-usage/export_json")
        assert res.status_code == 200
        assert res.json() == {"allowed": True, "isPremium": False}

        # 3. GET blocked subsequently
        res = await ac.get("/api/feature-usage/export_json")
        assert res.status_code == 200
        assert res.json() == {"allowed": False, "isPremium": False}
