from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from werkzeug.security import generate_password_hash
from app.models import User, UserRole
from app.config import settings
import logging

log = logging.getLogger(__name__)

async def seed_admin_user(db: AsyncSession) -> User:
    """Checks if the admin user exists, and if not, creates one with werkzeug-hashed password."""
    result = await db.execute(select(User).where(User.email == settings.demo_admin_email))
    admin = result.scalar_one_or_none()
    
    if not admin:
        admin = User(
            name="Admin User",
            email=settings.demo_admin_email,
            password_hash=generate_password_hash(settings.demo_admin_password),
            role=UserRole.admin,
            organization="Silicofeller Labs",
            is_admin=True,
            is_active=True,
            is_verified=True,
            is_premium=True,
        )
        db.add(admin)
        await db.commit()
        await db.refresh(admin)
        log.info(f"✓ Admin user created: {admin.email}")
    else:
        log.info(f"✓ Admin user exists: {admin.email}")
        
    return admin
