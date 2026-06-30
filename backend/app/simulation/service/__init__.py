"""Simulation Service package for coordinating full Palace simulation runs.

This package exposes the central SimulationService, Pydantic request/response schemas,
state managers, execution contexts, and orchestrator-level exceptions.
"""

from __future__ import annotations

from app.simulation.service.constants import ORCHESTRATOR_VERSION
from app.simulation.service.exceptions import (
    OrchestratorCancellationError,
    OrchestratorError,
    PipelinePhaseError,
)
from app.simulation.service.execution_context import ExecutionContext, RollbackPolicy
from app.simulation.service.pipeline import PipelineManager
from app.simulation.service.simulation_service import (
    SimulationExecutionSummary,
    SimulationRequest,
    SimulationResponse,
    SimulationService,
)
from app.simulation.service.state_manager import PipelineState, StateManager

__all__ = [
    "SimulationService",
    "SimulationRequest",
    "SimulationResponse",
    "SimulationExecutionSummary",
    "PipelineManager",
    "ExecutionContext",
    "RollbackPolicy",
    "PipelineState",
    "StateManager",
    "OrchestratorError",
    "PipelinePhaseError",
    "OrchestratorCancellationError",
    "ORCHESTRATOR_VERSION",
]
