"""Custom exception hierarchy for the Palace simulation runner."""

from __future__ import annotations


class RunnerError(Exception):
    """Base exception for all runner-related errors."""
    pass


class PalaceExecutableNotFoundError(RunnerError):
    """Raised when the Palace executable cannot be located."""
    pass


class MPIUnavailableError(RunnerError):
    """Raised when MPI execution is requested but MPI tools are unavailable."""
    pass


class RunnerTimeoutError(RunnerError):
    """Raised when a Palace simulation execution times out."""
    pass


class RunnerCancelledError(RunnerError):
    """Raised when a Palace simulation is explicitly cancelled by the user."""
    pass


class RunnerExecutionError(RunnerError):
    """Raised when Palace exits with a non-zero exit code or crashes."""
    pass


class RunnerConfigurationError(RunnerError):
    """Raised when the workspace lacks required configuration or mesh files."""
    pass


class RunnerEnvironmentError(RunnerError):
    """Raised when there is an issue with the OS or execution environment."""
    pass


class ProcessLaunchError(RunnerError):
    """Raised when spawning the Palace process fails."""
    pass
