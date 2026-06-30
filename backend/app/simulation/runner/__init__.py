"""Palace simulation runner package.

This package orchestrates launching and monitoring the AWS Palace EM solver,
handling MPI configurations, capturing logs, tracking progress, and managing
process timeouts and cancellations.
"""

from __future__ import annotations

from app.simulation.runner.exceptions import (
    MPIUnavailableError,
    PalaceExecutableNotFoundError,
    ProcessLaunchError,
    RunnerCancelledError,
    RunnerConfigurationError,
    RunnerEnvironmentError,
    RunnerError,
    RunnerExecutionError,
    RunnerTimeoutError,
)
from app.simulation.runner.palace_runner import PalaceRunner
from app.simulation.runner.runner_models import (
    ProgressState,
    RunnerMetadata,
    SimulationStage,
)

__all__ = [
    "PalaceRunner",
    "RunnerError",
    "PalaceExecutableNotFoundError",
    "MPIUnavailableError",
    "RunnerTimeoutError",
    "RunnerCancelledError",
    "RunnerExecutionError",
    "RunnerConfigurationError",
    "RunnerEnvironmentError",
    "ProcessLaunchError",
    "RunnerMetadata",
    "ProgressState",
    "SimulationStage",
]
