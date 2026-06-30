from __future__ import annotations

import logging
from typing import Dict, Optional
from app.simulation.queue.interface import QueueBackend
from app.simulation.queue.models import SimulationJob, JobState

logger = logging.getLogger(__name__)

class JobScheduler:
    """Orchestrates job scheduling, enforcing concurrency limits, FIFO priority, and worker allocation."""

    def __init__(self, queue_backend: QueueBackend, max_concurrency: int = 2) -> None:
        self.queue_backend = queue_backend
        self.max_concurrency = max_concurrency
        self.active_jobs: Dict[str, SimulationJob] = {}

    def can_run_more(self) -> bool:
        """Check if the scheduler has available capacity to run another simulation job."""
        return len(self.active_jobs) < self.max_concurrency

    async def register_start(self, job: SimulationJob, worker_id: str) -> None:
        """Register that a job has started execution on a worker."""
        job.state = JobState.RUNNING
        job.worker_id = worker_id
        self.active_jobs[job.job_id] = job
        await self.queue_backend.update_job(job)
        logger.info("Scheduler: registered job %s running on worker %s", job.job_id, worker_id)

    async def register_completion(self, job_id: str) -> None:
        """Register that a job has completed execution (success or failure)."""
        job = self.active_jobs.pop(job_id, None)
        if job:
            logger.info("Scheduler: de-registered completed job %s", job_id)
        else:
            logger.warning("Scheduler: tried to de-register unknown job %s", job_id)

    async def acquire_next_job(self) -> Optional[SimulationJob]:
        """Poll the queue and return the next eligible job, if capacity permits."""
        if not self.can_run_more():
            return None

        job = await self.queue_backend.dequeue()
        return job
