"""State manager for tracking and validating simulation pipeline transitions."""

from __future__ import annotations

import logging
import threading
from enum import Enum
from typing import Set

from app.simulation.service.exceptions import OrchestratorError

logger = logging.getLogger(__name__)


class PipelineState(str, Enum):
    """The lifecycle states of a simulation execution pipeline."""

    REQUEST_RECEIVED = "REQUEST_RECEIVED"
    WORKSPACE_READY = "WORKSPACE_READY"
    GEOMETRY_READY = "GEOMETRY_READY"
    MESH_READY = "MESH_READY"
    CONFIG_READY = "CONFIG_READY"
    RUNNING = "RUNNING"
    RESULTS_READY = "RESULTS_READY"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


# Map of a state to its allowed next states.
# FAILED and CANCELLED are terminal states and can be transitioned to from any active state.
ALLOWED_TRANSITIONS: dict[PipelineState, Set[PipelineState]] = {
    PipelineState.REQUEST_RECEIVED: {PipelineState.WORKSPACE_READY, PipelineState.FAILED, PipelineState.CANCELLED},
    PipelineState.WORKSPACE_READY: {PipelineState.GEOMETRY_READY, PipelineState.FAILED, PipelineState.CANCELLED},
    PipelineState.GEOMETRY_READY: {PipelineState.MESH_READY, PipelineState.FAILED, PipelineState.CANCELLED},
    PipelineState.MESH_READY: {PipelineState.CONFIG_READY, PipelineState.FAILED, PipelineState.CANCELLED},
    PipelineState.CONFIG_READY: {PipelineState.RUNNING, PipelineState.FAILED, PipelineState.CANCELLED},
    PipelineState.RUNNING: {PipelineState.RESULTS_READY, PipelineState.FAILED, PipelineState.CANCELLED},
    PipelineState.RESULTS_READY: {PipelineState.COMPLETED, PipelineState.FAILED, PipelineState.CANCELLED},
    PipelineState.COMPLETED: set(),  # Terminal
    PipelineState.FAILED: set(),     # Terminal
    PipelineState.CANCELLED: set(),  # Terminal
}


class StateManager:
    """Thread-safe manager for tracking and validating simulation pipeline states."""

    def __init__(self, initial_state: PipelineState = PipelineState.REQUEST_RECEIVED) -> None:
        self._state = initial_state
        self._lock = threading.Lock()

    @property
    def state(self) -> PipelineState:
        """Get the current pipeline state."""
        with self._lock:
            return self._state

    def transition_to(self, target_state: PipelineState, simulation_id: str) -> None:
        """Attempt to transition the pipeline state to a target state.

        Args:
            target_state: The desired target state.
            simulation_id: The simulation ID (for logging).

        Raises:
            OrchestratorError: If the transition is illegal.
        """
        with self._lock:
            current = self._state
            
            # If already in the target state, treat as a no-op
            if current == target_state:
                return

            allowed = ALLOWED_TRANSITIONS.get(current, set())
            
            if target_state not in allowed:
                err_msg = (
                    f"Illegal state transition requested for simulation '{simulation_id}': "
                    f"cannot transition from '{current.value}' to '{target_state.value}'."
                )
                logger.error(err_msg)
                raise OrchestratorError(err_msg)

            logger.info(
                "Simulation '%s' state transition: %s -> %s",
                simulation_id,
                current.value,
                target_state.value,
            )
            self._state = target_state

    def is_terminal(self) -> bool:
        """Check if the current state is a terminal state (COMPLETED, FAILED, CANCELLED)."""
        with self._lock:
            return self._state in (PipelineState.COMPLETED, PipelineState.FAILED, PipelineState.CANCELLED)
