import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import select
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.models import User, UserRole
from app.database.seed import seed_admin_user
from app.main import app
from app.config import settings

# clean in-memory SQLite database using StaticPool to keep the connection alive
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"
engine = create_async_engine(
    TEST_DATABASE_URL, 
    connect_args={"check_same_thread": False},
    poolclass=StaticPool
)
AsyncSessionTesting = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

async def override_get_db():
    async with AsyncSessionTesting() as session:
        yield session

@pytest.fixture(autouse=True)
async def setup_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

app.dependency_overrides[get_db] = override_get_db

@pytest.mark.anyio
async def test_seed_admin_user():
    async with AsyncSessionTesting() as session:
        # Seed user
        admin = await seed_admin_user(session)
        assert admin.email == settings.demo_admin_email
        assert admin.is_admin is True
        assert admin.role == UserRole.admin
        
        # Verify it exists in db
        result = await session.execute(select(User).where(User.email == settings.demo_admin_email))
        user_in_db = result.scalar_one_or_none()
        assert user_in_db is not None
        assert user_in_db.is_admin is True
        assert user_in_db.role == UserRole.admin

@pytest.mark.anyio
async def test_admin_login_endpoint():
    async with AsyncSessionTesting() as session:
        # Seed user
        await seed_admin_user(session)
        
    # Query via API client
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/auth/token",
            data={
                "username": settings.demo_admin_email,
                "password": settings.demo_admin_password,
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["user"]["email"] == settings.demo_admin_email
        assert data["user"]["role"] == "admin"
