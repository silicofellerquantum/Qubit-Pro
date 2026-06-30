"""Structured JSON logging and correlation ID context tracking for Quantum Studio."""

from __future__ import annotations

import json
import logging
import sys
from datetime import datetime
from typing import Any
import contextvars

# Thread/Asyncio-safe context variable to store the current request's correlation ID
correlation_id_ctx: contextvars.ContextVar[str] = contextvars.ContextVar("correlation_id", default="")


class JSONFormatter(logging.Formatter):
    """Custom logging formatter that serializes log records to structured JSON."""

    def format(self, record: logging.LogRecord) -> str:
        # Extract base details
        log_data: dict[str, Any] = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "correlation_id": correlation_id_ctx.get() or getattr(record, "correlation_id", ""),
        }

        # Include standard log record metadata
        log_data["filename"] = record.filename
        log_data["line_number"] = record.lineno

        # Capture exception tracebacks if present
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)

        # Merge extra fields if passed via logging.info("...", extra={"foo": "bar"})
        if hasattr(record, "__dict__"):
            # Skip standard attributes to prevent pollution
            standard_attrs = {
                "args", "asctime", "created", "exc_info", "exc_text", "filename",
                "funcName", "levelname", "levelno", "lineno", "module", "msecs",
                "message", "msg", "name", "pathname", "process", "processName",
                "relativeCreated", "stack_info", "thread", "threadName", "correlation_id"
            }
            extra = {k: v for k, v in record.__dict__.items() if k not in standard_attrs}
            if extra:
                log_data["extra"] = extra

        return json.dumps(log_data)


def setup_logging(is_production: bool = False) -> None:
    """Configure the logging subsystem.
    
    In production mode, this configures the root logger to output structured JSON
    to stdout. In development, it falls back to a clean human-readable console format.
    """
    root_logger = logging.getLogger()
    
    # Remove existing handlers to prevent duplicate formatting
    for handler in list(root_logger.handlers):
        root_logger.removeHandler(handler)

    handler = logging.StreamHandler(sys.stdout)

    if is_production:
        handler.setFormatter(JSONFormatter())
        root_logger.setLevel(logging.INFO)
    else:
        # Development human-readable format
        formatter = logging.Formatter(
            fmt="%(asctime)s [%(levelname)s] %(name)s (%(filename)s:%(lineno)d) - %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S"
        )
        handler.setFormatter(formatter)
        root_logger.setLevel(logging.INFO)

    root_logger.addHandler(handler)

    # Prevent library logs from being excessively noisy (e.g., uvicorn, sqlalchemy)
    logging.getLogger("uvicorn.access").propagate = not is_production
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
    
    logging.info(
        "Logging initialized in %s mode.",
        "production (JSON)" if is_production else "development (text)"
    )
