"""
Team / Licensing Router
"""
import uuid
import logging
import smtplib
from email.message import EmailMessage
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from datetime import datetime, timedelta
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.config import settings
from app.database import get_db
from app.models import User, TeamInvite, Subscription, UserRole

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/team", tags=["team"])


class InviteRequest(BaseModel):
    email: str
    plan: str


class AcceptInviteRequest(BaseModel):
    token: str


def send_invite_email(to_email: str, token: str, inviter_name: str, plan: str):
    """
    Sends an invitation email. If SMTP is not configured, prints to console.
    """
    invite_url = f"http://localhost:8080/signup?invite_token={token}"
    
    subject = f"You've been invited to join {inviter_name}'s team on Quantum Studio"
    body = f"""
Hello,

{inviter_name} has invited you to join their team on Quantum Studio!
You will automatically be upgraded to the {plan.capitalize()} plan.

Click here to accept the invitation and sign up:
{invite_url}

If you already have an account with this email, simply click the link to join the team.
    """
    
    # Simple fallback for local dev without SMTP
    smtp_host = getattr(settings, "smtp_host", None)
    if not smtp_host:
        log.warning(f"SMTP not configured. Printing email to console instead:\n\n=== EMAIL TO: {to_email} ===\n{subject}\n{body}\n===========================")
        return

    try:
        msg = EmailMessage()
        msg.set_content(body)
        msg["Subject"] = subject
        msg["From"] = getattr(settings, "smtp_from", "noreply@quantumstudio.com")
        msg["To"] = to_email

        with smtplib.SMTP(smtp_host, getattr(settings, "smtp_port", 587)) as server:
            if getattr(settings, "smtp_tls", True):
                server.starttls()
            
            smtp_user = getattr(settings, "smtp_user", None)
            smtp_pass = getattr(settings, "smtp_password", None)
            if smtp_user and smtp_pass:
                server.login(smtp_user, smtp_pass)
                
            server.send_message(msg)
    except Exception as e:
        log.error(f"Failed to send email to {to_email}: {e}")
        raise HTTPException(status_code=500, detail="Failed to send invitation email.")


@router.post("/invite")
async def invite_member(
    body: InviteRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Invite a new team member via email, assigning them a specific plan."""
    
    plan_to_assign = body.plan.lower()
    
    # 1. Total licenses owned for this plan
    total_owned_result = await db.execute(select(func.sum(Subscription.quantity)).where(
        Subscription.owner_id == current_user.id,
        Subscription.plan == plan_to_assign,
        Subscription.status == "active"
    ))
    total_owned = total_owned_result.scalar() or 0
    
    if total_owned <= 0:
        raise HTTPException(status_code=400, detail=f"You do not own any active {plan_to_assign.capitalize()} licenses.")

    # 2. Used licenses for this plan (Team members)
    members_result = await db.execute(select(func.count(User.id)).where(
        User.team_owner_id == current_user.id,
        User.plan == plan_to_assign
    ))
    active_members = members_result.scalar() or 0
    
    # 3. Used licenses for this plan (Pending invites within last 7 days)
    seven_days_ago = datetime.utcnow() - timedelta(days=7)
    invites_result = await db.execute(select(func.count(TeamInvite.id)).where(
        TeamInvite.owner_id == current_user.id,
        TeamInvite.status == "pending",
        TeamInvite.plan == plan_to_assign,
        TeamInvite.created_at >= seven_days_ago
    ))
    pending_invites = invites_result.scalar() or 0
    
    # 4. Is the owner using one of these licenses themselves?
    owner_used = 1 if current_user.plan == plan_to_assign else 0
    
    total_used = owner_used + active_members + pending_invites
    
    if total_used >= total_owned:
        raise HTTPException(
            status_code=400, 
            detail=f"License limit reached for {plan_to_assign.capitalize()}. You own {total_owned} and have used {total_used}."
        )

    # Check if they are inviting themselves
    if body.email.lower() == current_user.email.lower():
        raise HTTPException(status_code=400, detail="Cannot invite yourself.")

    # Check if a pending invite already exists
    existing = await db.execute(select(TeamInvite).where(
        TeamInvite.email == body.email.lower(), 
        TeamInvite.status == "pending",
        TeamInvite.created_at >= seven_days_ago
    ))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="A valid invitation to this email is already pending.")

    # Generate token and save
    token = str(uuid.uuid4())
    invite = TeamInvite(owner_id=current_user.id, email=body.email.lower(), token=token, plan=plan_to_assign)
    db.add(invite)
    await db.commit()

    # Send the email
    send_invite_email(body.email, token, current_user.name, plan_to_assign)

    return {"status": "success", "message": "Invitation sent successfully."}


@router.get("/members")
async def list_members(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List active team members, pending invites, and license availability."""
    
    # Get all active subscriptions owned by user
    subs_result = await db.execute(select(Subscription).where(
        Subscription.owner_id == current_user.id,
        Subscription.status == "active"
    ))
    subs = subs_result.scalars().all()
    
    # Calculate total owned per plan
    owned_by_plan = {}
    for sub in subs:
        owned_by_plan[sub.plan] = owned_by_plan.get(sub.plan, 0) + sub.quantity
        
    members_result = await db.execute(select(User).where(User.team_owner_id == current_user.id))
    members = members_result.scalars().all()
    
    seven_days_ago = datetime.utcnow() - timedelta(days=7)
    invites_result = await db.execute(select(TeamInvite).where(
        TeamInvite.owner_id == current_user.id, 
        TeamInvite.status == "pending",
        TeamInvite.created_at >= seven_days_ago
    ))
    invites = invites_result.scalars().all()
    
    # Calculate used per plan
    used_by_plan = {}
    for m in members:
        used_by_plan[m.plan] = used_by_plan.get(m.plan, 0) + 1
    for i in invites:
        used_by_plan[i.plan] = used_by_plan.get(i.plan, 0) + 1
        
    # Don't forget the owner!
    if current_user.plan != "free" and current_user.plan in owned_by_plan:
        used_by_plan[current_user.plan] = used_by_plan.get(current_user.plan, 0) + 1
        
    # Structure the limits
    limits = []
    for plan, count in owned_by_plan.items():
        limits.append({
            "plan": plan,
            "total": count,
            "used": used_by_plan.get(plan, 0)
        })

    return {
        "limits": limits,
        "members": [{"id": m.id, "name": m.name, "email": m.email, "plan": m.plan, "joined_at": m.created_at} for m in members],
        "pending_invites": [{"id": i.id, "email": i.email, "plan": i.plan, "created_at": i.created_at} for i in invites],
    }


@router.post("/accept-invite")
async def accept_invite(
    body: AcceptInviteRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Accept an invitation to join a team. 
    The current_user must be logged in.
    """
    result = await db.execute(select(TeamInvite).where(TeamInvite.token == body.token, TeamInvite.status == "pending"))
    invite = result.scalar_one_or_none()
    
    if not invite:
        raise HTTPException(status_code=400, detail="Invalid or already used invitation token.")
        
    seven_days_ago = datetime.utcnow() - timedelta(days=7)
    if invite.created_at < seven_days_ago:
        raise HTTPException(status_code=400, detail="Invitation has expired (older than 7 days).")
        
    # Get the owner to inherit their billing cycle (but we use the invite's plan)
    owner_result = await db.execute(select(User).where(User.id == invite.owner_id))
    owner = owner_result.scalar_one_or_none()
    
    if not owner:
        raise HTTPException(status_code=400, detail="The team owner no longer exists.")

    # Ensure the owner still has active licenses for this plan
    subs_result = await db.execute(select(Subscription).where(
        Subscription.owner_id == owner.id,
        Subscription.plan == invite.plan,
        Subscription.status == "active"
    ))
    valid_sub = subs_result.scalars().first()
    
    if not valid_sub:
        raise HTTPException(status_code=400, detail=f"The team owner no longer has an active {invite.plan} subscription.")

    # Link user to team
    current_user.team_owner_id = owner.id
    current_user.plan = invite.plan
    current_user.billing_cycle = valid_sub.billing_cycle
    current_user.subscription_status = "managed"
    
    # Mark invite as accepted
    invite.status = "accepted"
    await db.commit()
    
    return {"status": "success", "plan": current_user.plan}

@router.delete("/invite/{invite_id}")
async def revoke_invite(
    invite_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Revoke a pending invitation."""
    result = await db.execute(select(TeamInvite).where(TeamInvite.id == invite_id, TeamInvite.owner_id == current_user.id))
    invite = result.scalar_one_or_none()
    
    if not invite:
        raise HTTPException(status_code=404, detail="Invitation not found.")
        
    invite.status = "revoked"
    await db.commit()
    return {"status": "success"}

@router.delete("/members/{member_id}")
async def remove_member(
    member_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Remove an active team member.
    
    The member's account is downgraded to the free plan — their projects,
    designs, and all work are fully preserved (not deleted). Access to
    paid features is locked at the free-tier limits until they purchase
    their own subscription or are re-invited to a team.
    """
    result = await db.execute(select(User).where(User.id == member_id, User.team_owner_id == current_user.id))
    member = result.scalar_one_or_none()
    
    if not member:
        raise HTTPException(status_code=404, detail="Team member not found.")

    # Preserve all work — only revoke the team license.
    # subscription_status = "locked" signals that the account has been
    # downgraded from a team seat; projects are retained in read-only/free mode.
    member.team_owner_id = None
    member.plan = "free"
    member.subscription_status = "locked"
    await db.commit()
    return {"status": "success", "message": "Member removed. Their work is preserved and locked at the free tier."}
