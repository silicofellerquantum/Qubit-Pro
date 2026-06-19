"""Feature usage gating router."""

from __future__ import annotations

from datetime import datetime
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import User, UserFeatureUsage, FeatureKey

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/feature-usage", tags=["feature-usage"])


@router.get("/{feature_key}")
async def get_feature_usage(
    feature_key: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    # 1. Validate feature_key
    try:
        f_key = FeatureKey(feature_key)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid feature key: {feature_key}. Allowed values: {[e.value for e in FeatureKey]}"
        )

    # 2. Premium users are always allowed
    if getattr(user, "is_premium", False):
        return {"allowed": True, "isPremium": True}

    # 3. Check if user already used this feature
    result = await db.execute(
        select(UserFeatureUsage).where(
            UserFeatureUsage.user_id == user.id,
            UserFeatureUsage.feature_key == f_key
        )
    )
    usage = result.scalar_one_or_none()

    if usage:
        return {"allowed": False, "isPremium": False}

    return {"allowed": True, "isPremium": False}


@router.post("/{feature_key}")
async def record_feature_usage(
    feature_key: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    # 1. Validate feature_key
    try:
        f_key = FeatureKey(feature_key)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid feature key: {feature_key}. Allowed values: {[e.value for e in FeatureKey]}"
        )

    # 2. Premium users are always allowed (no need to write to DB)
    if getattr(user, "is_premium", False):
        return {"allowed": True, "isPremium": True}

    # 3. Insert record using atomic handling of UniqueConstraint to avoid race conditions
    usage = UserFeatureUsage(user_id=user.id, feature_key=f_key)
    db.add(usage)
    try:
        await db.flush()
        await db.commit()
        return {"allowed": True, "isPremium": False}
    except IntegrityError:
        await db.rollback()
        # Already used (unique constraint user_id + feature_key triggered)
        return {"allowed": False, "isPremium": False}
