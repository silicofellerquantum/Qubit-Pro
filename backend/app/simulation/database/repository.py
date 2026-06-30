"""Repository layer for encapsulating database access for simulation models."""

from __future__ import annotations

from typing import Generic, List, Optional, Type, TypeVar

from sqlalchemy import and_, desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Simulation
from app.simulation.database.models import (
    SimulationArtifact,
    SimulationExecution,
    SimulationLog,
    SimulationMetric,
    SimulationParameter,
    SimulationResult,
    WorkspaceSnapshot,
)

T = TypeVar("T")


class BaseRepository(Generic[T]):
    """Generic async base repository providing common database operations."""

    def __init__(self, session: AsyncSession, model_class: Type[T]) -> None:
        self.session = session
        self.model_class = model_class

    async def get_by_id(self, id_val: str) -> Optional[T]:
        """Retrieve a record by its primary key ID."""
        return await self.session.get(self.model_class, id_val)

    async def list(self, limit: int = 100, offset: int = 0) -> List[T]:
        """List all records with optional limit and offset pagination."""
        stmt = select(self.model_class).limit(limit).offset(offset)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def create(self, instance: T) -> T:
        """Add a new record to the session."""
        self.session.add(instance)
        await self.session.flush()
        return instance

    async def update(self, instance: T) -> T:
        """Flush modifications to the session."""
        await self.session.flush()
        return instance

    async def delete(self, instance: T) -> None:
        """Delete a record from the session."""
        await self.session.delete(instance)
        await self.session.flush()


class SimulationRepository(BaseRepository[Simulation]):
    """Encapsulates database access for the Simulation root model."""

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, Simulation)

    async def get_with_executions(self, simulation_id: str) -> Optional[Simulation]:
        """Retrieve a simulation and eagerly load all its execution runs."""
        stmt = (
            select(Simulation)
            .where(Simulation.id == simulation_id)
            .options(selectinload(Simulation.executions))
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_project(
        self, project_id: str, limit: int = 50, offset: int = 0
    ) -> List[Simulation]:
        """Retrieve simulations associated with a specific project."""
        stmt = (
            select(Simulation)
            .where(Simulation.project_id == project_id)
            .order_by(desc(Simulation.created_at))
            .limit(limit)
            .offset(offset)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def query_simulations(
        self,
        project_id: Optional[str] = None,
        status: Optional[str] = None,
        solver: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[Simulation]:
        """Query and filter simulations with support for pagination."""
        stmt = select(Simulation)
        filters = []
        if project_id:
            filters.append(Simulation.project_id == project_id)
        if status:
            filters.append(Simulation.status == status)
        if solver:
            filters.append(Simulation.solver == solver)

        if filters:
            stmt = stmt.where(and_(*filters))

        stmt = stmt.order_by(desc(Simulation.created_at)).limit(limit).offset(offset)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())


class SimulationExecutionRepository(BaseRepository[SimulationExecution]):
    """Encapsulates database access for the SimulationExecution model."""

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, SimulationExecution)

    async def get_latest_execution(self, simulation_id: str) -> Optional[SimulationExecution]:
        """Retrieve the most recent execution run for a given simulation ID."""
        stmt = (
            select(SimulationExecution)
            .where(SimulationExecution.simulation_id == simulation_id)
            .order_by(desc(SimulationExecution.started_at))
            .limit(1)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_execution_with_details(self, execution_id: str) -> Optional[SimulationExecution]:
        """Retrieve an execution, eagerly loading results, artifacts, logs, and metrics."""
        stmt = (
            select(SimulationExecution)
            .where(SimulationExecution.id == execution_id)
            .options(
                selectinload(SimulationExecution.result),
                selectinload(SimulationExecution.artifacts),
                selectinload(SimulationExecution.logs),
                selectinload(SimulationExecution.metrics),
                selectinload(SimulationExecution.workspace_snapshot),
            )
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()


class ResultRepository(BaseRepository[SimulationResult]):
    """Encapsulates database access for simulation results."""

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, SimulationResult)

    async def get_by_execution_id(self, execution_id: str) -> Optional[SimulationResult]:
        """Retrieve the result record associated with an execution."""
        stmt = select(SimulationResult).where(SimulationResult.execution_id == execution_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()


class ArtifactRepository(BaseRepository[SimulationArtifact]):
    """Encapsulates database access for tracking simulation files/artifacts."""

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, SimulationArtifact)

    async def get_by_execution_id(self, execution_id: str) -> List[SimulationArtifact]:
        """Retrieve all file artifacts indexed for a specific execution."""
        stmt = select(SimulationArtifact).where(SimulationArtifact.execution_id == execution_id)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_by_checksum(self, checksum: str) -> List[SimulationArtifact]:
        """Find any indexed artifacts matching a given file checksum (for deduplication)."""
        stmt = select(SimulationArtifact).where(SimulationArtifact.checksum == checksum)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_active_artifacts(self, limit: int = 100, offset: int = 0) -> List[SimulationArtifact]:
        """Retrieve all active (non-pruned) artifacts (useful for retention policies)."""
        stmt = (
            select(SimulationArtifact)
            .where(SimulationArtifact.retention_status == "active")
            .limit(limit)
            .offset(offset)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())


class MetricRepository(BaseRepository[SimulationMetric]):
    """Encapsulates database access for performance and timing metrics."""

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, SimulationMetric)

    async def get_metrics_for_execution(self, execution_id: str) -> List[SimulationMetric]:
        """Retrieve all numerical metrics/timings recorded for an execution."""
        stmt = select(SimulationMetric).where(SimulationMetric.execution_id == execution_id)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())
