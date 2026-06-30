from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

class JobState(str, Enum):
    """The execution lifecycle states of a queued simulation job."""
    QUEUED = "QUEUED"
    STARTING = "STARTING"
    RUNNING = "RUNNING"
    PAUSED = "PAUSED"
    CANCELLED = "CANCELLED"
    FAILED = "FAILED"
    COMPLETED = "COMPLETED"
    RETRYING = "RETRYING"

class SimulationJob(BaseModel):
    """Pydantic model representing a simulation job in the background queue."""
    job_id: str = Field(..., description="Unique UUID associated with the queue job.")
    simulation_id: str = Field(..., description="The simulation ID of the run.")
    project_id: str = Field(..., description="The project UUID.")
    user_id: str = Field(..., description="The owner user UUID.")
    solver_type: str = Field(..., description="Palace solver type.")
    design_payload: Dict[str, Any] = Field(..., description="Full design payload.")
    user_settings: Dict[str, Any] = Field(default_factory=dict, description="Solver settings and overrides.")
    terminal_names: Optional[List[str]] = Field(default=None)
    qubits: Optional[List[Dict[str, Any]]] = Field(default=None)
    port_names: Optional[List[str]] = Field(default=None)
    mesh_settings: Optional[Any] = Field(default=None)
    coarse_mesh: bool = Field(default=False)
    rollback_policy: str = Field(default="DELETE_ON_SUCCESS")
    correlation_id: Optional[str] = Field(default=None)
    
    state: JobState = Field(default=JobState.QUEUED, description="Current queue lifecycle state.")
    priority: int = Field(default=5, description="Priority value, higher is more urgent (0-10).")
    enqueued_at: datetime = Field(default_factory=datetime.utcnow)
    started_at: Optional[datetime] = Field(default=None)
    finished_at: Optional[datetime] = Field(default=None)
    retry_count: int = Field(default=0)
    worker_id: Optional[str] = Field(default=None)
    progress: float = Field(default=0.0)
    current_phase: Optional[str] = Field(default=None)
    error_message: Optional[str] = Field(default=None)
    warnings: List[str] = Field(default_factory=list)

class WorkerHealth(BaseModel):
    """Pydantic model representing worker status, uptime, and system utilization."""
    worker_id: str
    status: str = Field(..., description="'idle' | 'busy' | 'offline'")
    current_job_id: Optional[str] = None
    uptime_seconds: float = 0.0
    memory_usage_mb: float = 0.0
    cpu_percent: float = 0.0
    disk_usage_percent: float = 0.0
    last_heartbeat: datetime = Field(default_factory=datetime.utcnow)

class QueueMetrics(BaseModel):
    """Pydantic model summarizing performance metrics for the queue scheduler."""
    queue_depth: int = 0
    active_workers_count: int = 0
    average_runtime_seconds: float = 0.0
    success_rate: float = 0.0
    failure_rate: float = 0.0
    retry_count: int = 0
    total_processed: int = 0
