from __future__ import annotations

from abc import ABC, abstractmethod
from typing import List, Optional
from app.simulation.queue.models import SimulationJob, JobState, QueueMetrics

class QueueBackend(ABC):
    """Abstract Base Class defining the contract for queue storage engines."""

    @abstractmethod
    async def enqueue(self, job: SimulationJob) -> None:
        """Enqueue a new simulation job."""
        pass

    @abstractmethod
    async def dequeue(self) -> Optional[SimulationJob]:
        """Retrieve and lock the next eligible job from the queue (FIFO / Priority)."""
        pass

    @abstractmethod
    async def get_job(self, job_id: str) -> Optional[SimulationJob]:
        """Retrieve a job by its unique job_id or simulation_id."""
        pass

    @abstractmethod
    async def update_job(self, job: SimulationJob) -> None:
        """Update a job's status, progress, timings, or errors."""
        pass

    @abstractmethod
    async def list_jobs(self, state: Optional[JobState] = None) -> List[SimulationJob]:
        """List all jobs optionally filtered by state."""
        pass

    @abstractmethod
    async def delete_job(self, job_id: str) -> None:
        """Delete / purge a job from queue memory."""
        pass

    @abstractmethod
    async def get_metrics(self) -> QueueMetrics:
        """Retrieve overall queue depth, processing rates, and worker stats."""
        pass
