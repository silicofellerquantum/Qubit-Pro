"""ASGI and HTTP middlewares for security, rate limiting, and request correlation tracing."""

from __future__ import annotations

import json
import time
import uuid
import logging
from collections import defaultdict
from threading import Lock
from typing import Any

from fastapi import Request, Response, status
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.logging import correlation_id_ctx

logger = logging.getLogger(__name__)


# ── Token Bucket Rate Limiter ────────────────────────────────────────────────

class TokenBucket:
    """Thread-safe implementation of the Token Bucket algorithm for rate limiting."""

    def __init__(self, rate: float, capacity: float) -> None:
        """Initialize the Token Bucket.
        
        Args:
            rate: Rate at which tokens are added to the bucket (tokens per second).
            capacity: Maximum number of tokens the bucket can hold.
        """
        self.rate = rate
        self.capacity = capacity
        self.lock = Lock()
        self.buckets: dict[str, float] = defaultdict(lambda: capacity)
        self.last_update: dict[str, float] = defaultdict(time.time)

    def consume(self, key: str, tokens: int = 1) -> bool:
        """Attempt to consume the specified number of tokens from the key's bucket.
        
        Returns:
            True if tokens were consumed, False if rate limit was exceeded.
        """
        with self.lock:
            now = time.time()
            elapsed = now - self.last_update[key]
            self.last_update[key] = now

            # Replenish bucket based on elapsed time
            self.buckets[key] = min(
                self.capacity,
                self.buckets[key] + elapsed * self.rate
            )

            if self.buckets[key] >= tokens:
                self.buckets[key] -= tokens
                return True
            return False


# ── Middlewares ─────────────────────────────────────────────────────────────

class CorrelationIDMiddleware(BaseHTTPMiddleware):
    """Middleware that injects and propagates a unique Correlation ID for every request.
    
    Checks for an incoming 'X-Correlation-ID' header, otherwise generates a new UUID.
    Binds the value to contextvars so it is automatically included in all structured logs.
    """

    async def dispatch(self, request: Request, call_next: Any) -> Response:
        correlation_id = request.headers.get("X-Correlation-ID") or str(uuid.uuid4())
        
        # Bind correlation ID to the async context variable
        token = correlation_id_ctx.set(correlation_id)
        try:
            response = await call_next(request)
            response.headers["X-Correlation-ID"] = correlation_id
            return response
        finally:
            # Reset context variable to prevent cross-context leakage
            correlation_id_ctx.reset(token)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Middleware that injects HTTP security headers to protect against common web vulnerabilities."""

    async def dispatch(self, request: Request, call_next: Any) -> Response:
        response: Response = await call_next(request)
        
        # Prevent clickjacking
        response.headers["X-Frame-Options"] = "DENY"
        
        # Prevent MIME-sniffing
        response.headers["X-Content-Type-Options"] = "nosniff"
        
        # Referrer disclosure policy
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        
        # Enforce HTTPS in production
        if request.url.scheme == "https":
            response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload"
            
        # Hardened Content Security Policy (CSP) for APIs and static outputs
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: blob:; "
            "connect-src 'self' ws: wss:;"
        )
        return response


class RateLimitingMiddleware(BaseHTTPMiddleware):
    """Middleware enforcing API rate limits using the Token Bucket algorithm."""

    def __init__(self, app: Any, rate: float = 5.0, capacity: float = 20.0) -> None:
        """Initialize the rate limiting middleware.
        
        Args:
            app: The ASGI application.
            rate: Replenish rate (default 5 requests/sec).
            capacity: Maximum burst capacity (default 20 requests).
        """
        super().__init__(app)
        self.limiter = TokenBucket(rate, capacity)

    async def dispatch(self, request: Request, call_next: Any) -> Response:
        # Skip rate limiting for static assets, documentation, and health endpoints
        path = request.url.path
        skip_prefixes = {"/docs", "/redoc", "/openapi.json", "/health", "/live", "/ready", "/metrics"}
        if any(path.startswith(prefix) for prefix in skip_prefixes):
            return await call_next(request)

        # Resolve client IP
        client_ip = request.client.host if request.client else "127.0.0.1"

        # Consume token
        if not self.limiter.consume(client_ip):
            logger.warning(
                "Rate limit exceeded for client IP: %s on path: %s",
                client_ip, path, extra={"client_ip": client_ip, "path": path}
            )
            return Response(
                content=json.dumps({
                    "detail": "Too many requests. Please slow down and try again later."
                }),
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                media_type="application/json"
            )

        return await call_next(request)
