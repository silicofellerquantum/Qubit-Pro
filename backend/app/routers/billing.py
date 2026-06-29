"""
Billing router — Razorpay Subscriptions integration.

Currency: USD (amounts in cents/smallest unit for Razorpay USD orders;
          for subscriptions the plan amount is set in the Razorpay Dashboard).

Endpoints (all under /api/billing/):
  POST   /customer           — create or fetch Razorpay customer for the current user
  POST   /subscription       — create a Razorpay Subscription (basic|pro, monthly|annual)
  GET    /subscription       — get current user's subscription details from Razorpay
  DELETE /subscription       — cancel active subscription at period end
  POST   /verify-payment     — verify HMAC signature; activate plan in DB
  POST   /refund             — initiate a refund for a payment_id
  POST   /webhook            — Razorpay webhook handler (HMAC verified)
  GET    /invoices           — list user's Razorpay invoices
  GET    /me                 — current plan / subscription status

Security:
  - All endpoints except /webhook require a valid JWT (get_current_user).
  - /webhook verifies Razorpay HMAC-SHA256 signature.
  - No raw card data is ever handled here; Razorpay Checkout SDK handles it.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
from typing import Literal, Optional

import razorpay
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select, update, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.config import settings
from app.database import get_db
from app.models import User, Subscription, TeamInvite

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/billing", tags=["billing"])

# ── Plan catalogue ────────────────────────────────────────────────────────────
# Amounts in USD cents (used when creating Razorpay one-off orders).
# For Subscriptions the plan amount lives in the Razorpay Dashboard plan object;
# these amounts are kept here for reference / future order-based billing.
PLAN_PRICES_CENTS: dict[str, dict[str, int]] = {
    "basic":    {"monthly": 19900, "annual": 16900},  # $199/mo | $169/mo
    "pro":      {"monthly": 24900, "annual": 20900},  # $249/mo | $209/mo
    "test_usd": {"monthly": 200, "annual": 200},      # $2 test
    "test_inr": {"monthly": 200, "annual": 200},      # ₹2 test
}

# Razorpay Plan IDs — create these once in your Razorpay Dashboard and paste the
# IDs below.  Format: plan_XXXXXXXXXXXXXXXXXX
# Dashboard → Products → Subscriptions → Plans → Create Plan
RAZORPAY_PLAN_IDS: dict[str, dict[str, str]] = {
    "basic": {
        "monthly": "plan_T3TAMqdH8mruL1",  # Subscription Plans (This is Basic Monthly)
        "annual": "plan_T4DmH8NRC0acQO",   # Basic Annual 2028
    },
    "pro": {
        "monthly": "plan_T4DrVZUjjFBKgr",  # PRO MONTHLY 249
        "annual": "plan_T4DpLL9BGvYALM",   # Pro Annual 2508
    },
    "test_usd": {
        "monthly": "plan_T4Dqz5y8HczyMJ",
        "annual": "plan_T4Dqz5y8HczyMJ",
    },
    "test_inr": {
        "monthly": "plan_T4DqH1rsQDMqAP",
        "annual": "plan_T4DqH1rsQDMqAP",
    },
}


# ── Razorpay client factory ───────────────────────────────────────────────────

def _get_razorpay_client() -> razorpay.Client:
    """Return an authenticated Razorpay client.  Raises 503 if keys not set."""
    if not settings.razorpay_key_id or not settings.razorpay_key_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Payment gateway not configured. Contact support.",
        )
    return razorpay.Client(
        auth=(settings.razorpay_key_id, settings.razorpay_key_secret)
    )


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class CreateSubscriptionRequest(BaseModel):
    plan: Literal["basic", "pro", "test_usd", "test_inr"]
    cycle: Literal["monthly", "annual"] = "monthly"
    total_count: int = 12  # number of billing cycles (12 = 1 year for monthly)
    quantity: int = 1  # number of seats/licenses purchased


class VerifyPaymentRequest(BaseModel):
    razorpay_payment_id: str
    razorpay_subscription_id: str
    razorpay_signature: str


class RefundRequest(BaseModel):
    payment_id: str
    amount_cents: Optional[int] = None  # None = full refund

class CancelSubscriptionRequest(BaseModel):
    subscription_id: str

class SwitchPlanRequest(BaseModel):
    plan: str # The plan the admin wants to switch to consuming

class BillingMeResponse(BaseModel):
    plan: str
    billing_cycle: str
    subscription_status: Optional[str]
    razorpay_customer_id: Optional[str]
    razorpay_subscription_id: Optional[str]


# ── Helper — HMAC signature verification ─────────────────────────────────────

def _verify_razorpay_signature(payload: bytes, received_signature: str) -> bool:
    """Verify the X-Razorpay-Signature HMAC-SHA256 webhook header."""
    if not settings.razorpay_webhook_secret:
        log.warning("RAZORPAY_WEBHOOK_SECRET not set — skipping signature check (unsafe!)")
        return True
    expected = hmac.new(
        settings.razorpay_webhook_secret.encode("utf-8"),
        payload,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, received_signature)


def _verify_payment_signature(
    payment_id: str,
    subscription_id: str,
    signature: str,
) -> bool:
    """Verify Razorpay payment signature after Checkout completes."""
    message = f"{payment_id}|{subscription_id}"
    expected = hmac.new(
        settings.razorpay_key_secret.encode("utf-8"),
        message.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


# ── Endpoints ─────────────────────────────────────────────────────────────────

# 1. Create / fetch Razorpay customer
@router.post("/customer", status_code=status.HTTP_200_OK)
async def create_or_get_customer(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Create a Razorpay customer for the logged-in user (idempotent).
    If the user already has a razorpay_customer_id it is returned directly.
    """
    if current_user.razorpay_customer_id:
        return {
            "customer_id": current_user.razorpay_customer_id,
            "created": False,
        }

    client = _get_razorpay_client()
    try:
        customer = client.customer.create(
            {
                "name": current_user.name,
                "email": current_user.email,
                "fail_existing": "0",  # MUST be string "0", integer 0 is ignored by Razorpay API
            }
        )
    except Exception as exc:
        log.exception("Razorpay customer creation failed")
        raise HTTPException(status_code=502, detail=f"Payment gateway error: {exc}") from exc

    # Persist the customer ID
    result = await db.execute(select(User).where(User.id == current_user.id))
    user = result.scalar_one()
    user.razorpay_customer_id = customer["id"]
    await db.flush()

    return {"customer_id": customer["id"], "created": True}


# 2. Create subscription
@router.post("/subscription", status_code=status.HTTP_201_CREATED)
async def create_subscription(
    body: CreateSubscriptionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Create a Razorpay Subscription for the requested plan.
    Returns the subscription object — the frontend uses the `id` to open
    Razorpay Checkout and the `short_url` as a fallback payment link.

    NOTE: You must create the plan in the Razorpay Dashboard and set the
    plan IDs in RAZORPAY_PLAN_IDS above before this endpoint goes live.
    """
    plan_id = RAZORPAY_PLAN_IDS.get(body.plan, {}).get(body.cycle)
    if not plan_id or plan_id.startswith("plan_REPLACE"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Razorpay Plan ID for {body.plan}/{body.cycle} is not configured. "
                "Create the plan in the Razorpay Dashboard and set the ID in billing.py → RAZORPAY_PLAN_IDS."
            ),
        )

    # Ensure customer exists first
    if not current_user.razorpay_customer_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Create a Razorpay customer first via POST /api/billing/customer",
        )

    client = _get_razorpay_client()
    try:
        subscription = client.subscription.create(
            {
                "plan_id": plan_id,
                "customer_id": current_user.razorpay_customer_id,
                "total_count": body.total_count,
                "quantity": body.quantity,
                "notify_info": {
                    "notify_phone": None,
                    "notify_email": current_user.email,
                },
            }
        )
    except Exception as exc:
        log.exception("Razorpay subscription creation failed")
        raise HTTPException(status_code=502, detail=f"Payment gateway error: {exc}") from exc

    # Persist subscription object
    sub_record = Subscription(
        owner_id=current_user.id,
        razorpay_subscription_id=subscription["id"],
        plan=body.plan,
        billing_cycle=body.cycle,
        quantity=body.quantity,
        status=subscription.get("status", "created")
    )
    db.add(sub_record)
    
    # Do not set user.razorpay_subscription_id/licenses_purchased on User table anymore.
    
    await db.flush()

    return {
        "id": subscription["id"],
        "entity": "subscription",
        "short_url": subscription.get("short_url"),
        "status": subscription.get("status"),
        "plan_id": plan_id,
        "quantity": body.quantity,
    }


# 3. Fetch current subscription details
@router.get("/subscription")
async def get_subscription(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Fetch the current user's Razorpay subscriptions from the local database."""
    result = await db.execute(
        select(Subscription).where(
            Subscription.owner_id == current_user.id,
            Subscription.status != "created"
        ).order_by(Subscription.created_at.desc())
    )
    subscriptions = result.scalars().all()
    
    return {
        "subscriptions": [
            {
                "id": sub.razorpay_subscription_id,
                "plan": sub.plan,
                "billing_cycle": sub.billing_cycle,
                "quantity": sub.quantity,
                "status": sub.status,
            }
            for sub in subscriptions
        ],
        "plan": current_user.plan
    }


# 4. Cancel Subscription
@router.post("/cancel-subscription", status_code=status.HTTP_200_OK)
async def cancel_subscription(
    body: CancelSubscriptionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Cancel the active subscription at period end (cancel_at_cycle_end=1).
    The user keeps access until the current billing period ends.
    """
    result = await db.execute(select(Subscription).where(
        Subscription.razorpay_subscription_id == body.subscription_id,
        Subscription.owner_id == current_user.id
    ))
    sub_record = result.scalar_one_or_none()
    
    if not sub_record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Subscription not found.",
        )

    client = _get_razorpay_client()
    try:
        rzp_result = client.subscription.cancel(
            body.subscription_id,
            {"cancel_at_cycle_end": 1},
        )
    except Exception as exc:
        log.exception("Razorpay subscription cancel failed")
        raise HTTPException(status_code=502, detail=f"Payment gateway error: {exc}") from exc

    # We explicitly set the local status to "cancelled" so the frontend knows auto-renewal is off.
    # Razorpay will keep it "active" on their end until the cycle finishes, then send a webhook.
    sub_record.status = "cancelled"
    
    # Update the user's subscription status if this was their active plan
    if current_user.plan == sub_record.plan:
        # Check if they have any OTHER active subscriptions for this plan
        active_count_res = await db.execute(select(func.count(Subscription.id)).where(
            Subscription.owner_id == current_user.id,
            Subscription.plan == current_user.plan,
            Subscription.status == "active",
            Subscription.id != sub_record.id
        ))
        if not active_count_res.scalar():
            current_user.subscription_status = "cancelled"

    await db.flush()

    log.info("Subscription cancelled: user=%s sub_id=%s", current_user.id, body.subscription_id)
    return {"status": "success", "razorpay_status": rzp_result.get("status")}


# 5. Verify payment signature (called by frontend after Checkout success)
@router.post("/verify-payment", status_code=status.HTTP_200_OK)
async def verify_payment(
    body: VerifyPaymentRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Verify the Razorpay payment signature returned by Checkout.
    On success: update User.plan and subscription_status in DB.
    This is the ONLY place where plan activation happens — never on
    the frontend or before signature verification.
    """
    if not _verify_payment_signature(
        body.razorpay_payment_id,
        body.razorpay_subscription_id,
        body.razorpay_signature,
    ):
        log.warning(
            "Payment signature verification FAILED: user=%s payment=%s",
            current_user.id, body.razorpay_payment_id,
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payment signature verification failed. Do not activate plan.",
        )

    # Find subscription record in DB
    result = await db.execute(select(Subscription).where(Subscription.razorpay_subscription_id == body.razorpay_subscription_id))
    sub_record = result.scalar_one_or_none()
    if not sub_record:
        raise HTTPException(status_code=400, detail="Subscription record not found.")

    if sub_record.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Subscription belongs to another user.")

    # Derive plan from the subscription's plan_id via Razorpay API
    client = _get_razorpay_client()
    try:
        sub = client.subscription.fetch(body.razorpay_subscription_id)
        rzp_plan_id = sub.get("plan_id", "")
    except Exception as exc:
        log.exception("Could not fetch subscription for plan resolution")
        raise HTTPException(status_code=502, detail=f"Payment gateway error: {exc}") from exc

    # Map Razorpay plan_id back to our plan key
    activated_plan = sub_record.plan
    activated_cycle = sub_record.billing_cycle
    for plan_key, cycles in RAZORPAY_PLAN_IDS.items():
        for cycle_key, plan_id in cycles.items():
            if plan_id == rzp_plan_id:
                activated_plan = plan_key
                activated_cycle = cycle_key
                break

    # Activate subscription in DB
    sub_record.plan = activated_plan
    sub_record.billing_cycle = activated_cycle
    sub_record.status = "active"

    # Activate plan for the user ONLY if they are free or we want to auto-assign
    user_result = await db.execute(select(User).where(User.id == current_user.id))
    user = user_result.scalar_one()
    
    # Update the user's active subscription ID so they can fetch their invoices
    user.razorpay_subscription_id = body.razorpay_subscription_id

    # Auto-activate the newly purchased plan ONLY if it is an upgrade or equal tier.
    # If they are on "pro" and buy "basic" for interns, they should stay on "pro".
    PLAN_RANK = {"free": 0, "test_inr": 1, "test_usd": 1, "basic": 2, "pro": 3}
    current_rank = PLAN_RANK.get(user.plan, 0)
    new_rank = PLAN_RANK.get(activated_plan, 0)

    if new_rank >= current_rank:
        user.plan = activated_plan
        user.billing_cycle = activated_cycle
        user.subscription_status = "active"
        
    # Unlink if they were managed
    if user.team_owner_id:
        user.team_owner_id = None
        
    await db.flush()

    log.info(
        "Payment verified & plan activated: user=%s plan=%s cycle=%s payment=%s",
        current_user.id, activated_plan, activated_cycle, body.razorpay_payment_id,
    )
    return {
        "verified": True,
        "plan": activated_plan,
        "billing_cycle": activated_cycle,
        "subscription_status": "active",
    }


# 6. Refund
@router.post("/refund", status_code=status.HTTP_200_OK)
async def refund_payment(
    body: RefundRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Initiate a refund for a given Razorpay payment ID.
    Partial refund if amount_cents is specified; full refund otherwise.
    Access: any authenticated user can request a refund on their own payment_id.
    Admin validation / cross-checking should be added before production.
    """
    client = _get_razorpay_client()
    payload: dict = {}
    if body.amount_cents is not None:
        payload["amount"] = body.amount_cents  # in smallest currency unit

    try:
        refund = client.payment.refund(body.payment_id, payload)
    except Exception as exc:
        log.exception("Razorpay refund failed")
        raise HTTPException(status_code=502, detail=f"Payment gateway error: {exc}") from exc

    log.info(
        "Refund initiated: user=%s payment=%s refund_id=%s",
        current_user.id, body.payment_id, refund.get("id"),
    )
    return refund


# 7. Webhook (no auth — validated via HMAC signature)
@router.post("/webhook", status_code=status.HTTP_200_OK)
async def razorpay_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Razorpay webhook receiver.
    Configure in Razorpay Dashboard → Settings → Webhooks → Active Events:
      - subscription.activated
      - subscription.halted
      - subscription.cancelled
      - subscription.expired
      - payment.captured

    Razorpay sends POST with JSON body and X-Razorpay-Signature header.
    """
    raw_body = await request.body()
    received_sig = request.headers.get("X-Razorpay-Signature", "")

    if not _verify_razorpay_signature(raw_body, received_sig):
        log.warning("Webhook: invalid signature from %s", request.client)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid webhook signature")

    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    event = payload.get("event", "")
    entity = payload.get("payload", {}).get("subscription", {}).get("entity", {})
    sub_id = entity.get("id")

    log.info("Webhook received: event=%s sub_id=%s", event, sub_id)

    if not sub_id:
        # payment.captured events don't have subscription — safe to acknowledge
        return {"received": True}

    # Find subscription in DB
    result = await db.execute(
        select(Subscription).where(Subscription.razorpay_subscription_id == sub_id)
    )
    sub_record = result.scalar_one_or_none()
    if not sub_record:
        log.warning("Webhook: no subscription found for %s", sub_id)
        return {"received": True}

    # Map Razorpay event → local plan/status change
    if event == "subscription.activated":
        sub_record.status = "active"
        # Derive plan from plan_id in subscription entity
        rzp_plan_id = entity.get("plan_id", "")
        for plan_key, cycles in RAZORPAY_PLAN_IDS.items():
            for cycle_key, pid in cycles.items():
                if pid == rzp_plan_id:
                    sub_record.plan = plan_key
                    sub_record.billing_cycle = cycle_key
        sub_record.quantity = entity.get("quantity", sub_record.quantity)
        log.info("Subscription activated: sub_id=%s plan=%s", sub_id, sub_record.plan)

    elif event == "subscription.halted":
        sub_record.status = "halted"
        log.warning("Subscription halted (payment failed): sub_id=%s", sub_id)

    elif event in ("subscription.cancelled", "subscription.expired"):
        sub_record.status = event.split(".")[1]  # "cancelled" | "expired"
        log.info("Subscription %s: sub_id=%s", event, sub_id)
        
        # Check remaining active subscriptions for this plan
        active_subs = await db.execute(select(func.sum(Subscription.quantity)).where(
            Subscription.owner_id == sub_record.owner_id,
            Subscription.plan == sub_record.plan,
            Subscription.status == "active",
            Subscription.id != sub_record.id
        ))
        total_owned = active_subs.scalar() or 0

        # Calculate current usage
        members_res = await db.execute(select(User).where(
            User.team_owner_id == sub_record.owner_id, 
            User.plan == sub_record.plan
        ).order_by(User.created_at.desc()))
        members = members_res.scalars().all()

        invites_res = await db.execute(select(TeamInvite).where(
            TeamInvite.owner_id == sub_record.owner_id,
            TeamInvite.plan == sub_record.plan,
            TeamInvite.status == "pending"
        ).order_by(TeamInvite.created_at.desc()))
        invites = invites_res.scalars().all()

        owner_res = await db.execute(select(User).where(User.id == sub_record.owner_id))
        owner = owner_res.scalar_one()
        owner_used = 1 if owner.plan == sub_record.plan else 0

        total_used = owner_used + len(members) + len(invites)
        excess = total_used - total_owned

        if excess > 0:
            for inv in invites:
                if excess <= 0: break
                inv.status = "revoked"
                excess -= 1
            
            for mem in members:
                if excess <= 0: break
                mem.plan = "free"
                mem.subscription_status = event.split(".")[1]
                excess -= 1
            
            if excess > 0 and owner_used:
                owner.plan = "free"
                owner.subscription_status = event.split(".")[1]


    await db.flush()
    return {"received": True}


# 8. Invoices
@router.get("/invoices")
async def list_invoices(
    current_user: User = Depends(get_current_user),
):
    """
    Fetch invoices for the current user's Razorpay subscription.
    Returns an empty list for free users.
    """
    if not current_user.razorpay_subscription_id:
        return {"invoices": [], "count": 0}

    client = _get_razorpay_client()
    try:
        # Razorpay returns invoices paginated; fetch up to 100
        invoices_resp = client.invoice.all(
            {
                "type": "invoice",
                "count": 100,
                "subscription_id": current_user.razorpay_subscription_id,
            }
        )
        items = invoices_resp.get("items", [])
    except Exception as exc:
        log.exception("Razorpay invoices fetch failed")
        raise HTTPException(status_code=502, detail=f"Payment gateway error: {exc}") from exc

    return {"invoices": items, "count": len(items)}


# 9. Me — current billing state
@router.get("/me", response_model=BillingMeResponse)
async def billing_me(
    current_user: User = Depends(get_current_user),
):
    """Return the current user's billing plan and subscription status."""
    return BillingMeResponse(
        plan=current_user.plan,
        billing_cycle=current_user.billing_cycle,
        subscription_status=current_user.subscription_status,
        razorpay_customer_id=current_user.razorpay_customer_id,
        razorpay_subscription_id=current_user.razorpay_subscription_id,
    )
# 10. Switch personal plan
@router.post("/switch-plan", status_code=status.HTTP_200_OK)
async def switch_plan(
    body: SwitchPlanRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Allow an admin to switch which of their owned plans they are currently consuming.
    """
    if body.plan == "free":
        current_user.plan = "free"
        current_user.subscription_status = "cancelled"
        await db.commit()
        return {"status": "success", "plan": "free"}

    # Check if they own an active subscription for this plan
    result = await db.execute(select(Subscription).where(
        Subscription.owner_id == current_user.id,
        Subscription.plan == body.plan,
        Subscription.status == "active"
    ))
    sub_record = result.scalars().first()
    if not sub_record:
        raise HTTPException(status_code=400, detail=f"You do not own an active {body.plan} subscription.")

    # Calculate used licenses
    # Find all users using this plan from this owner (excluding the owner themselves)
    users_result = await db.execute(select(func.count(User.id)).where(
        User.team_owner_id == current_user.id,
        User.plan == body.plan
    ))
    used_users = users_result.scalar() or 0

    from app.models import TeamInvite
    invites_result = await db.execute(select(func.count(TeamInvite.id)).where(
        TeamInvite.owner_id == current_user.id,
        TeamInvite.plan == body.plan,
        TeamInvite.status == "pending"
    ))
    used_invites = invites_result.scalar() or 0

    total_used = used_users + used_invites
    
    # If the user is ALREADY consuming this plan, we don't need to check capacity for themselves.
    if current_user.plan != body.plan:
        total_owned_result = await db.execute(select(func.sum(Subscription.quantity)).where(
            Subscription.owner_id == current_user.id,
            Subscription.plan == body.plan,
            Subscription.status == "active"
        ))
        total_owned = total_owned_result.scalar() or 0

        if total_used + 1 > total_owned:
            raise HTTPException(status_code=400, detail=f"No {body.plan} licenses available for yourself.")

    current_user.plan = body.plan
    current_user.billing_cycle = sub_record.billing_cycle
    current_user.subscription_status = "active"
    await db.commit()

    return {"status": "success", "plan": body.plan}
