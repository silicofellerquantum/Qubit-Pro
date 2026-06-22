import os
import re
import html
import time
import json
import logging
import smtplib
import ssl
import threading
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from collections import defaultdict
from logging.handlers import TimedRotatingFileHandler
from fastapi import APIRouter, Request, HTTPException, status
from pydantic import BaseModel, Field

from app.config import settings

# ── Logging Configuration ────────────────────────────────────────────────────
LOG_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "logs"))
os.makedirs(LOG_DIR, exist_ok=True)

log_file_path = os.path.join(LOG_DIR, "contact_submissions.log")

contact_logger = logging.getLogger("contact_api")
contact_logger.setLevel(logging.INFO)

if not contact_logger.handlers:
    # Rotate daily, keep 30 days of logs
    handler = TimedRotatingFileHandler(
        log_file_path,
        when="midnight",
        interval=1,
        backupCount=30,
        encoding="utf-8"
    )
    formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
    handler.setFormatter(formatter)
    contact_logger.addHandler(handler)

# ── Router Initialization ────────────────────────────────────────────────────
router = APIRouter(prefix="/api/contact", tags=["contact"])

# ── In-Memory Rate Limiting State ─────────────────────────────────────────────
# { IP_address: [timestamp1, timestamp2, ...] }
ip_history = defaultdict(list)
rate_limit_lock = threading.Lock()

# ── Regex Configuration ──────────────────────────────────────────────────────
# Strict email format matching client-side regex
EMAIL_REGEX = re.compile(r'^[^\s@]+@[^\s@]+\.[^\s@]+$')

# ── HTML Email Templates ─────────────────────────────────────────────────────
ADMIN_EMAIL_TEMPLATE = """<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; background-color: #f6f9fc; color: #333333; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 20px auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
    .header { background-color: #1a1a1a; color: #ffffff; padding: 24px; text-align: center; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 600; letter-spacing: 0.5px; }
    .content { padding: 32px 24px; }
    .field { margin-bottom: 20px; }
    .label { font-size: 12px; font-weight: 600; color: #718096; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
    .value { font-size: 15px; color: #1a202c; line-height: 1.5; white-space: pre-wrap; background-color: #f7fafc; padding: 12px; border-radius: 6px; border: 1px solid #edf2f7; }
    .footer { background-color: #f7fafc; padding: 16px 24px; border-top: 1px solid #edf2f7; font-size: 12px; color: #a0aec0; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>New Contact Submission</h1>
    </div>
    <div class="content">
      <div class="field">
        <div class="label">Name</div>
        <div class="value">{name}</div>
      </div>
      <div class="field">
        <div class="label">Email</div>
        <div class="value"><a href="mailto:{email}" style="color: #4f46e5; text-decoration: none;">{email}</a></div>
      </div>
      <div class="field">
        <div class="label">Company</div>
        <div class="value">{company}</div>
      </div>
      <div class="field">
        <div class="label">Message</div>
        <div class="value">{message}</div>
      </div>
    </div>
    <div class="footer">
      Submitted from IP: {ip} | Timestamp: {timestamp}
    </div>
  </div>
</body>
</html>"""

USER_EMAIL_TEMPLATE = """<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; background-color: #f4f5f7; color: #2d3748; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 30px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; }
    .header { background: linear-gradient(135deg, #1a1a1a 0%, #333333 100%); color: #ffffff; padding: 36px 24px; text-align: center; }
    .logo { font-size: 22px; font-weight: 700; letter-spacing: 2px; color: #ffffff; text-transform: uppercase; margin-bottom: 8px; }
    .header p { margin: 0; font-size: 14px; color: #a0aec0; }
    .content { padding: 40px 32px; line-height: 1.6; }
    .content h2 { margin-top: 0; color: #1a1a1a; font-size: 20px; font-weight: 600; }
    .content p { color: #4a5568; margin-bottom: 24px; font-size: 15px; }
    .summary-box { background-color: #f7fafc; border-left: 4px solid #1a1a1a; padding: 16px 20px; margin-bottom: 24px; border-radius: 0 8px 8px 0; }
    .summary-title { font-size: 13px; font-weight: 600; color: #718096; text-transform: uppercase; margin-bottom: 8px; }
    .summary-text { font-style: italic; color: #4a5568; font-size: 14px; }
    .footer { background-color: #1a1a1a; color: #a0aec0; padding: 24px; text-align: center; font-size: 12px; }
    .footer a { color: #ffffff; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">SILICOFELLER</div>
      <p>Quantum Hardware EDA Platform</p>
    </div>
    <div class="content">
      <h2>We've received your message</h2>
      <p>Hi {name},</p>
      <p>Thank you for reaching out to Silicofeller Quantum Studio. We have received your inquiry and our quantum engineering team is reviewing it. We will get back to you within 24 hours.</p>
      
      <div class="summary-box">
        <div class="summary-title">Your message summary</div>
        <div class="summary-text">"{message}"</div>
      </div>
      
      <p>If you have any urgent updates, feel free to reply directly to this email.</p>
      <p>Best regards,<br>The Silicofeller Team</p>
    </div>
    <div class="footer">
      &copy; 2026 Silicofeller, Inc. All rights reserved.<br>
      <a href="https://silicofeller.com">silicofeller.com</a>
    </div>
  </div>
</body>
</html>"""

# ── Fallback Queuing System ──────────────────────────────────────────────────
FALLBACK_FILE = os.path.join(LOG_DIR, "contact_fallback.json")
fallback_lock = threading.Lock()

def add_to_fallback(payload: dict):
    with fallback_lock:
        items = []
        if os.path.exists(FALLBACK_FILE):
            try:
                with open(FALLBACK_FILE, "r", encoding="utf-8") as f:
                    items = json.load(f)
            except Exception:
                items = []
        items.append(payload)
        try:
            with open(FALLBACK_FILE, "w", encoding="utf-8") as f:
                json.dump(items, f, indent=2)
            
            contact_logger.info(f"Submissions logged to fallback. Current queue length: {len(items)}.")
            if len(items) >= 10:
                contact_logger.error(
                    f"CRITICAL ALERT: Fallback contact form queue has reached {len(items)} messages. "
                    "Admin attention is required to inspect SMTP server health immediately."
                )
        except Exception as e:
            contact_logger.error(f"Failed to write to fallback file: {e}")

def get_and_clear_fallback() -> list[dict]:
    with fallback_lock:
        if not os.path.exists(FALLBACK_FILE):
            return []
        try:
            with open(FALLBACK_FILE, "r", encoding="utf-8") as f:
                items = json.load(f)
            with open(FALLBACK_FILE, "w", encoding="utf-8") as f:
                json.dump([], f)
            return items
        except Exception as e:
            contact_logger.error(f"Failed to read/clear fallback file: {e}")
            return []

def restore_to_fallback(items: list[dict]):
    with fallback_lock:
        existing = []
        if os.path.exists(FALLBACK_FILE):
            try:
                with open(FALLBACK_FILE, "r", encoding="utf-8") as f:
                    existing = json.load(f)
            except Exception:
                existing = []
        existing = items + existing
        try:
            with open(FALLBACK_FILE, "w", encoding="utf-8") as f:
                json.dump(existing, f, indent=2)
        except Exception as e:
            contact_logger.error(f"Failed to restore items to fallback file: {e}")

# ── SMTP Mailing Logic ───────────────────────────────────────────────────────
def send_email(to_email: str, subject: str, html_content: str) -> bool:
    smtp_host = settings.smtp_host
    smtp_port = settings.smtp_port
    smtp_user = settings.smtp_user
    smtp_pass = settings.final_smtp_password
    mail_from = settings.final_mail_from
    
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = mail_from
    msg["To"] = to_email
    msg.attach(MIMEText(html_content, "html"))
    
    try:
        # Create SMTP client
        server = smtplib.SMTP(smtp_host, smtp_port, timeout=10)
        
        # Configure TLS bypass certificate checks if needed (rejectUnauthorized: false equivalent)
        context = ssl.create_default_context()
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE
        
        server.starttls(context=context)
        server.login(smtp_user, smtp_pass)
        server.sendmail(mail_from, [to_email], msg.as_string())
        server.quit()
        return True
    except Exception as e:
        contact_logger.error(f"Failed to send email to {to_email}: {e}")
        return False

# ── Fallback Background Retry Worker ─────────────────────────────────────────
def fallback_retry_worker():
    contact_logger.info("Fallback SMTP retry worker thread started.")
    while True:
        # Sleep for 10 minutes (600 seconds)
        time.sleep(600)
        
        items = get_and_clear_fallback()
        if not items:
            continue
            
        contact_logger.info(f"Fallback worker attempting to retry sending {len(items)} emails...")
        failed_to_retry = []
        
        for item in items:
            name = item.get("name")
            email = item.get("email")
            company = item.get("company", "N/A")
            message = item.get("message")
            ip = item.get("ip", "unknown")
            timestamp = item.get("timestamp", "unknown")
            
            admin_subject = f"New contact form submission from {name} (Fallback Retry)"
            admin_html = (ADMIN_EMAIL_TEMPLATE
                          .replace("{name}", name)
                          .replace("{email}", email)
                          .replace("{company}", company)
                          .replace("{message}", message)
                          .replace("{ip}", ip)
                          .replace("{timestamp}", timestamp))
            
            user_subject = "We received your message"
            user_html = (USER_EMAIL_TEMPLATE
                         .replace("{name}", name)
                         .replace("{message}", message))
            
            # Send emails
            success_admin = send_email(settings.admin_email, admin_subject, admin_html)
            success_user = send_email(email, user_subject, user_html)
            
            if not (success_admin and success_user):
                contact_logger.warning(f"Retry failed again for {email}. Restoring to fallback list.")
                failed_to_retry.append(item)
            else:
                contact_logger.info(f"Retry succeeded for {email}. Emails sent successfully.")
                
        if failed_to_retry:
            restore_to_fallback(failed_to_retry)

# Start background worker daemon thread
retry_thread = threading.Thread(target=fallback_retry_worker, daemon=True, name="contact-smtp-retry")
retry_thread.start()

# ── Helper Functions ─────────────────────────────────────────────────────────
def sanitize_input(text: str) -> str:
    if not text:
        return ""
    # Strip HTML tags
    tag_re = re.compile(r'<[^>]*>')
    no_tags = tag_re.sub('', text)
    # HTML escape special characters
    return html.escape(no_tags)

def get_client_ip(request: Request) -> str:
    x_forwarded_for = request.headers.get("x-forwarded-for")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    x_real_ip = request.headers.get("x-real-ip")
    if x_real_ip:
        return x_real_ip.strip()
    if request.client:
        return request.client.host
    return "unknown"

SPAM_KEYWORDS = [
    "viagra", "casino", "poker", "buy bitcoin", "double your crypto", 
    "seo ranking", "link building", "cheap slots", "earn money fast"
]

def is_spam(message: str) -> bool:
    message_lower = message.lower()
    for keyword in SPAM_KEYWORDS:
        if keyword in message_lower:
            return True
    
    # Check for excessive URLs
    urls = re.findall(r'https?://[^\s]+', message_lower)
    if len(urls) > 2:
        return True
        
    return False

# ── Request Validation Model ─────────────────────────────────────────────────
class ContactRequest(BaseModel):
    name: str = Field(..., min_length=2)
    email: str
    company: str | None = None
    message: str = Field(..., min_length=10, max_length=5000)

# ── POST Router Endpoint ─────────────────────────────────────────────────────
@router.post("")
async def submit_contact(body: ContactRequest, request: Request):
    ip = get_client_ip(request)
    now = time.time()
    
    # 1. Rate Limiting Check (Max 5 requests per IP per hour)
    with rate_limit_lock:
        one_hour_ago = now - 3600
        ip_history[ip] = [t for t in ip_history[ip] if t > one_hour_ago]
        
        if len(ip_history[ip]) >= 5:
            # Check for suspicious patterns: 10+ requests in a single minute
            one_minute_ago = now - 60
            recent_reqs = [t for t in ip_history[ip] if t > one_minute_ago]
            if len(recent_reqs) >= 10:
                contact_logger.warning(
                    f"SUSPICIOUS RATE LIMIT PATTERN: IP {ip} submitted {len(recent_reqs)} requests in 1 minute."
                )
            
            contact_logger.warning(f"Rate limit exceeded for IP: {ip}. Email: {body.email}.")
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests. Please try again later."
            )
        
        # Record current submission time
        ip_history[ip].append(now)

    # 2. Re-validate Email Format Strictly (Never trust frontend)
    if not EMAIL_REGEX.match(body.email):
        contact_logger.warning(f"Validation error: Invalid email format '{body.email}' from IP: {ip}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid email format"
        )

    # 3. Input Sanitization
    clean_name = sanitize_input(body.name)
    clean_email = sanitize_input(body.email)
    clean_company = sanitize_input(body.company) if body.company else "N/A"
    clean_message = sanitize_input(body.message)

    # 4. Spam Pattern Checks
    if is_spam(clean_message):
        contact_logger.warning(f"Spam filter triggered by submission from IP: {ip}, email: {clean_email}")
        # Return generic validation error to not alert spammers
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Message content flagged by automated filters."
        )

    # Log successful validation and sanitization
    timestamp_str = time.strftime('%Y-%m-%d %H:%M:%S', time.gmtime(now))
    contact_logger.info(f"Submission validated. IP: {ip}, Name: {clean_name}, Email: {clean_email}")

    # 5. Build HTML Email Bodies
    admin_subject = f"New contact form submission from {clean_name}"
    admin_html = (ADMIN_EMAIL_TEMPLATE
                  .replace("{name}", clean_name)
                  .replace("{email}", clean_email)
                  .replace("{company}", clean_company)
                  .replace("{message}", clean_message)
                  .replace("{ip}", ip)
                  .replace("{timestamp}", timestamp_str))

    user_subject = "We received your message"
    user_html = (USER_EMAIL_TEMPLATE
                 .replace("{name}", clean_name)
                 .replace("{message}", clean_message))

    # 6. Send Emails
    success_admin = send_email(settings.admin_email, admin_subject, admin_html)
    success_user = send_email(clean_email, user_subject, user_html)

    # 7. Check Send Status and Handle Fallback
    if not (success_admin and success_user):
        # Log SMTP failure
        contact_logger.error(
            f"SMTP send failed for {clean_email}. Admin success: {success_admin}, User success: {success_user}. "
            "Adding submission to fallback queue."
        )
        
        # Save to fallback file
        fallback_payload = {
            "name": clean_name,
            "email": clean_email,
            "company": clean_company,
            "message": clean_message,
            "ip": ip,
            "timestamp": timestamp_str
        }
        add_to_fallback(fallback_payload)
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send email. Please try again."
        )

    contact_logger.info(f"Emails successfully sent for submission from {clean_email}.")
    return {
        "success": True,
        "message": "Thank you for reaching out. We'll be in touch soon."
    }
