"""Custom exceptions for the Simulation Orchestrator subsystem."""

from __future__ import annotations


class OrchestratorError(Exception):
    """Base exception for all simulation orchestrator errors."""


class PipelinePhaseError(OrchestratorError):
    """Exception raised when a specific pipeline phase fails.

    Attributes:
        phase: The name of the phase that failed (e.g. 'geometry', 'mesh').
        message: Explanation of the error.
    """

    def __init__(self, phase: str, message: str) -> None:
        self.phase = phase
        self.message = message
        super().__init__(f"Pipeline phase '{phase}' failed: {message}")


class OrchestratorCancellationError(OrchestratorError):
    """Exception raised when a simulation pipeline is explicitly cancelled."""
