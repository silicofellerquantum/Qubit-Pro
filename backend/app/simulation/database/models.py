"""SQLAlchemy ORM models for the Simulation Orchestrator subsystem."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def _uuid() -> str:
    """Generate a unique UUID string."""
    return str(uuid.uuid4())


def _now() -> datetime:
    """Generate the current UTC datetime."""
    return datetime.utcnow()


class SimulationExecution(Base):
    """Tracks a single execution run of a simulation pipeline."""

    __tablename__ = "simulation_executions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    simulation_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("simulations.id", ondelete="CASCADE"), index=True
    )
    workspace_id: Mapped[str] = mapped_column(String(100), index=True)
    status: Mapped[str] = mapped_column(String(50))  # e.g., 'completed', 'failed', 'cancelled'
    palace_version: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    mpi_version: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    configuration_checksum: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    duration_seconds: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Structured JSON metadata captures
    geometry_metadata: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    mesh_metadata: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    config_metadata: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    runner_metadata: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    execution_summary: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    warnings: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    errors: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)

    # Relationships
    simulation: Mapped["Simulation"] = relationship("Simulation", back_populates="executions")
    result: Mapped[Optional["SimulationResult"]] = relationship(
        "SimulationResult", back_populates="execution", uselist=False, cascade="all, delete-orphan"
    )
    artifacts: Mapped[List["SimulationArtifact"]] = relationship(
        "SimulationArtifact", back_populates="execution", cascade="all, delete-orphan"
    )
    logs: Mapped[List["SimulationLog"]] = relationship(
        "SimulationLog", back_populates="execution", cascade="all, delete-orphan"
    )
    metrics: Mapped[List["SimulationMetric"]] = relationship(
        "SimulationMetric", back_populates="execution", cascade="all, delete-orphan"
    )
    workspace_snapshot: Mapped[Optional["WorkspaceSnapshot"]] = relationship(
        "WorkspaceSnapshot", back_populates="execution", uselist=False, cascade="all, delete-orphan"
    )


class SimulationResult(Base):
    """Stores the parsed physics results produced by a simulation run."""

    __tablename__ = "simulation_results"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    execution_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("simulation_executions.id", ondelete="CASCADE"), unique=True, index=True
    )
    simulation_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("simulations.id", ondelete="CASCADE"), index=True
    )
    solver_type: Mapped[str] = mapped_column(String(64))
    parsed_results: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    # Relationships
    execution: Mapped["SimulationExecution"] = relationship("SimulationExecution", back_populates="result")


class SimulationArtifact(Base):
    """Tracks and indexes individual file assets generated during the simulation lifecycle."""

    __tablename__ = "simulation_artifacts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    execution_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("simulation_executions.id", ondelete="CASCADE"), index=True
    )
    file_name: Mapped[str] = mapped_column(String(255))
    path: Mapped[str] = mapped_column(String(512))
    size: Mapped[int] = mapped_column(Integer)
    checksum: Mapped[str] = mapped_column(String(64))
    artifact_type: Mapped[str] = mapped_column(String(64))  # mesh | geometry | config | csv | plot | log
    retention_status: Mapped[str] = mapped_column(String(32), default="active")  # active | pruned
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    # Relationships
    execution: Mapped["SimulationExecution"] = relationship("SimulationExecution", back_populates="artifacts")


class SimulationLog(Base):
    """Stores execution logs, stderr, stdout, and orchestrator event narratives."""

    __tablename__ = "simulation_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    execution_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("simulation_executions.id", ondelete="CASCADE"), index=True
    )
    log_type: Mapped[str] = mapped_column(String(64))  # runner | orchestrator | stdout | stderr
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    # Relationships
    execution: Mapped["SimulationExecution"] = relationship("SimulationExecution", back_populates="logs")


class SimulationMetric(Base):
    """Persists fine-grained phase execution timings and performance/hardware metrics."""

    __tablename__ = "simulation_metrics"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    execution_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("simulation_executions.id", ondelete="CASCADE"), index=True
    )
    metric_key: Mapped[str] = mapped_column(String(100), index=True)  # e.g., 'mesh_duration'
    metric_value: Mapped[float] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    # Relationships
    execution: Mapped["SimulationExecution"] = relationship("SimulationExecution", back_populates="metrics")


class SimulationParameter(Base):
    """Archives the configurations, design parameters, and inputs to ensure reproducibility."""

    __tablename__ = "simulation_parameters"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    simulation_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("simulations.id", ondelete="CASCADE"), index=True
    )
    parameter_key: Mapped[str] = mapped_column(String(100), index=True)
    parameter_value: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    # Relationships
    simulation: Mapped["Simulation"] = relationship("Simulation", back_populates="parameters")


class WorkspaceSnapshot(Base):
    """Snapshots the sandboxed workspace folder settings and permission configurations."""

    __tablename__ = "workspace_snapshots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    execution_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("simulation_executions.id", ondelete="CASCADE"), unique=True, index=True
    )
    snapshot_metadata: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    # Relationships
    execution: Mapped["SimulationExecution"] = relationship("SimulationExecution", back_populates="workspace_snapshot")
