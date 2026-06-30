"""Pydantic models for the Palace simulation runner metadata and progress state."""

from __future__ import annotations

from enum import Enum
from typing import Dict, List, Optional
from pydantic import BaseModel, Field


class SimulationStage(str, Enum):
    """Execution stages of a Palace simulation run."""
    STARTING = "Starting"
    LAUNCHING_PALACE = "Launching Palace"
    LOADING_MESH = "Loading Mesh"
    INITIALIZING_SOLVER = "Initializing Solver"
    SOLVING = "Solving"
    POSTPROCESSING = "Postprocessing"
    COMPLETED = "Completed"
    FAILED = "Failed"
    CANCELLED = "Cancelled"


class ProgressState(BaseModel):
    """Live progress state of a simulation run."""
    stage: SimulationStage
    percentage: float = Field(..., ge=0.0, le=100.0)
    message: Optional[str] = None


class RunnerMetadata(BaseModel):
    """Comprehensive execution and system metadata written to runner_metadata.json."""
    execution_id: str = Field(..., description="Unique ID for this simulation execution run")
    workspace_id: str = Field(..., description="ID of the sandboxed workspace")
    runner_version: str = Field(..., description="Version of the Palace runner package")
    palace_version: str = Field(..., description="Commit hash or tag of the Palace solver")
    mpi_version: Optional[str] = Field(None, description="Version of the MPI package used, if any")
    start_time: str = Field(..., description="ISO 8601 start timestamp")
    end_time: Optional[str] = Field(None, description="ISO 8601 end timestamp")
    duration_seconds: Optional[float] = Field(None, description="Total execution time in seconds")
    exit_code: Optional[int] = Field(None, description="Process exit code")
    termination_reason: str = Field(..., description="Reason for termination: completed, timeout, cancelled, failed")
    command: List[str] = Field(..., description="Full command arguments list executed")
    environment: Dict[str, str] = Field(..., description="Captured environment variables for debugging and reproducibility")
    processor_count: int = Field(..., description="Number of MPI processes requested")
