"""Auth router — register, login, token refresh, Google OAuth."""

from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import create_access_token, get_current_user, hash_password, verify_password
from app.config import settings
from app.database import get_db
from app.models import User, UserRole

router = APIRouter(prefix="/api/auth", tags=["auth"])


# ── Schemas ─────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str
    organization: str = "Independent"
    role: UserRole = UserRole.engineer


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


class GoogleAuthRequest(BaseModel):
    credential: str  # Google ID token (JWT) from Google One Tap / OAuth popup


# ── Helpers ──────────────────────────────────────────────────────────────────

def _user_to_dict(user: User) -> dict:
    initials = "".join(p[0].upper() for p in user.name.split()[:2]) or "?"
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role.value,
        "organization": user.organization,
        "initials": initials,
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        name=body.name,
        email=body.email,
        hashed_password=hash_password(body.password),
        organization=body.organization,
        role=body.role,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)

    token = create_access_token({"sub": user.id}, timedelta(minutes=settings.access_token_expire_minutes))
    return TokenResponse(access_token=token, user=_user_to_dict(user))


@router.post("/token", response_model=TokenResponse)
async def login(form: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == form.username))
    user = result.scalar_one_or_none()

    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = create_access_token({"sub": user.id}, timedelta(minutes=settings.access_token_expire_minutes))
    return TokenResponse(access_token=token, user=_user_to_dict(user))


@router.post("/google", response_model=TokenResponse)
async def google_auth(body: GoogleAuthRequest, db: AsyncSession = Depends(get_db)):
    """
    Verify a Google OAuth access token (from @react-oauth/google useGoogleLogin)
    by fetching userinfo, then return a Silicofeller JWT.
    Creates a new user automatically on first sign-in, or links to existing email.
    """
    import httpx

    # Fetch Google userinfo using the access token
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                "https://www.googleapis.com/oauth2/v3/userinfo",
                headers={"Authorization": f"Bearer {body.credential}"},
                timeout=10.0,
            )
            resp.raise_for_status()
            idinfo = resp.json()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Failed to verify Google token: {exc}",
        )

    google_sub: str = idinfo.get("sub", "")
    email: str = idinfo.get("email", "")
    name: str = idinfo.get("name", "") or (email.split("@")[0] if email else "Unknown")

    if not google_sub or not email:
        raise HTTPException(status_code=400, detail="Google account missing sub or email")

    # 1. Try to find by google_id (returning user via Google)
    result = await db.execute(select(User).where(User.google_id == google_sub))
    user = result.scalar_one_or_none()

    if not user:
        # 2. Try to find existing account by email and link it
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        if user:
            # Link existing account to Google
            user.google_id = google_sub
        else:
            # 3. New user — create account (Google-only, random unusable password)
            import uuid as _uuid
            user = User(
                name=name,
                email=email,
                hashed_password=hash_password(str(_uuid.uuid4())),
                organization="Independent",
                role=UserRole.engineer,
                google_id=google_sub,
            )
            db.add(user)
            await db.flush()
            await db.refresh(user)

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is inactive")

    token = create_access_token(
        {"sub": user.id},
        timedelta(minutes=settings.access_token_expire_minutes),
    )
    return TokenResponse(access_token=token, user=_user_to_dict(user))


@router.get("/me")
async def get_me(current_user: User = Depends(get_current_user)):
    return _user_to_dict(current_user)
