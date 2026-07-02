"""Auth router — register, login, token refresh."""

from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import httpx
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from fastapi.responses import RedirectResponse

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


class GoogleLoginRequest(BaseModel):
    token: str


class UserOut(BaseModel):
    id: str
    name: str
    email: str
    role: str
    organization: str


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


@router.get("/me")
async def get_me(current_user: User = Depends(get_current_user)):
    return _user_to_dict(current_user)


@router.post("/google", response_model=TokenResponse)
async def login_with_google(body: GoogleLoginRequest, db: AsyncSession = Depends(get_db)):
    if not settings.google_client_id:
        raise HTTPException(status_code=500, detail="Google OAuth not configured")
    try:
        id_info = id_token.verify_oauth2_token(
            body.token, google_requests.Request(), settings.google_client_id
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid Google token: {e}")
    
    email = id_info.get("email")
    name = id_info.get("name", email.split("@")[0] if email else "Google User")
    if not email:
        raise HTTPException(status_code=400, detail="Google token missing email")

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if not user:
        # Create user automatically if they don't exist
        user = User(
            name=name,
            email=email,
            hashed_password=hash_password("google_oauth_no_password"),
            organization="Independent",
            role=UserRole.engineer,
        )
        db.add(user)
        await db.flush()
        await db.refresh(user)

    token = create_access_token({"sub": user.id}, timedelta(minutes=settings.access_token_expire_minutes))
    return TokenResponse(access_token=token, user=_user_to_dict(user))


@router.get("/github/authorize")
async def github_authorize():
    if not settings.github_client_id:
        raise HTTPException(status_code=500, detail="GitHub OAuth not configured")
    # Redirect to GitHub OAuth consent screen
    # For local testing without a specific port callback matching perfectly, the callback is usually set in GitHub.
    # We rely on the callback URL configured in the GitHub OAuth app settings.
    github_auth_url = f"https://github.com/login/oauth/authorize?client_id={settings.github_client_id}&scope=user:email"
    return RedirectResponse(url=github_auth_url)


@router.get("/github/callback")
async def github_callback(code: str, db: AsyncSession = Depends(get_db)):
    if not settings.github_client_id or not settings.github_client_secret:
        raise HTTPException(status_code=500, detail="GitHub OAuth not configured")
    
    # 1. Exchange code for access token
    async with httpx.AsyncClient() as client:
        token_res = await client.post(
            "https://github.com/login/oauth/access_token",
            data={
                "client_id": settings.github_client_id,
                "client_secret": settings.github_client_secret,
                "code": code,
            },
            headers={"Accept": "application/json"}
        )
        if token_res.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to exchange GitHub code")
        
        token_data = token_res.json()
        access_token = token_data.get("access_token")
        if not access_token:
            raise HTTPException(status_code=400, detail="GitHub didn't return an access token")
        
        # 2. Fetch user profile
        user_res = await client.get(
            "https://api.github.com/user",
            headers={"Authorization": f"Bearer {access_token}", "Accept": "application/json"}
        )
        if user_res.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to fetch GitHub user")
        user_data = user_res.json()
        name = user_data.get("name") or user_data.get("login") or "GitHub User"
        email = user_data.get("email")

        # 3. If email is null (common if user has private email), fetch emails endpoint
        if not email:
            emails_res = await client.get(
                "https://api.github.com/user/emails",
                headers={"Authorization": f"Bearer {access_token}", "Accept": "application/json"}
            )
            if emails_res.status_code == 200:
                emails = emails_res.json()
                primary_email = next((e for e in emails if e.get("primary")), None)
                if primary_email:
                    email = primary_email.get("email")
                elif emails:
                    email = emails[0].get("email")

        if not email:
            raise HTTPException(status_code=400, detail="No email available from GitHub")

    # 4. Find or create user
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if not user:
        user = User(
            name=name,
            email=email,
            hashed_password=hash_password("github_oauth_no_password"),
            organization="Independent",
            role=UserRole.engineer,
        )
        db.add(user)
        await db.flush()
        await db.refresh(user)

    # 5. Generate our JWT and redirect back to frontend
    token = create_access_token({"sub": user.id}, timedelta(minutes=settings.access_token_expire_minutes))
    
    # We assume frontend is running on standard ports, or we can use a hardcoded dev port for now.
    # We will pass the token in the URL fragment or query param so the frontend can catch it.
    frontend_url = "http://localhost:5173/auth/callback"
    return RedirectResponse(url=f"{frontend_url}?token={token}")
