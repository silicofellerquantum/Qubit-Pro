from __future__ import annotations

import logging
from app.simulation.service.exceptions import OrchestratorError, PipelinePhaseError

logger = logging.getLogger(__name__)

class RetryManager:
    """Manages retry policies, distinguishing transient system errors from deterministic configuration failures."""

    def __init__(self, max_retries: int = 3, base_backoff_seconds: int = 2) -> None:
        self.max_retries = max_retries
        self.base_backoff_seconds = base_backoff_seconds

    def should_retry(self, exception: Exception, current_retry_count: int) -> bool:
        """Evaluate if the job should be retried based on the exception type and retry count."""
        if current_retry_count >= self.max_retries:
            logger.info("Max retries (%d) reached. Will not retry.", self.max_retries)
            return False

        exc_str = str(exception).lower()

        # Deterministic configuration errors should NOT be retried
        non_retryable_keywords = [
            "empty design",
            "validation failed",
            "bad request",
            "cannot run simulation on an empty design",
            "invalid solver",
            "syntax error",
            "invalid geometry",
            "missing port",
            "missing terminal",
            "keyerror",
            "valueerror",
            "typeerror",
            "pydantic.error_wrappers.validationerror",
        ]

        for kw in non_retryable_keywords:
            if kw in exc_str:
                logger.info("Deterministic configuration error identified ('%s'). Skipping retry.", kw)
                return False

        # If it's a PipelinePhaseError, drill down
        if isinstance(exception, PipelinePhaseError):
            # If the phase failed because of an empty design or syntax, do not retry
            phase_err_str = str(exception.message).lower()
            for kw in non_retryable_keywords:
                if kw in phase_err_str:
                    logger.info("Deterministic phase error identified ('%s'). Skipping retry.", kw)
                    return False

        # Otherwise, assume it could be transient (e.g. database locks, file locks, runner timeouts)
        logger.info("Transient/system error identified. Scheduling retry %d/%d.", current_retry_count + 1, self.max_retries)
        return True

    def get_backoff_delay(self, retry_count: int) -> float:
        """Calculate exponential backoff delay: base * (2 ** retry_count)"""
        return float(self.base_backoff_seconds * (2 ** retry_count))
