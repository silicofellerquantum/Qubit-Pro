from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Dict, List, Optional
from app.simulation.queue.interface import QueueBackend
from app.simulation.queue.models import SimulationJob, JobState, QueueMetrics

class InMemoryQueue(QueueBackend):
    """Thread-safe in-memory queue implementation for development and single-host setups.

    Maintains jobs in a memory dictionary and supports priority-FIFO dequeuing.
    """

    def __init__(self) -> None:
        self._jobs: Dict[str, SimulationJob] = {}
        self._lock = asyncio.Lock()
        self._total_processed = 0

    async def enqueue(self, job: SimulationJob) -> None:
        async with self._lock:
            job.state = JobState.QUEUED
            job.enqueued_at = datetime.utcnow()
            self._jobs[job.job_id] = job

    async def dequeue(self) -> Optional[SimulationJob]:
        async with self._lock:
            # Find all queued jobs
            queued_jobs = [j for j in self._jobs.values() if j.state == JobState.QUEUED]
            if not queued_jobs:
                return None

            # Sort: Priority descending (10 is highest), enqueued_at ascending (FIFO)
            queued_jobs.sort(key=lambda j: (-j.priority, j.enqueued_at))
            
            selected = queued_jobs[0]
            selected.state = JobState.STARTING
            selected.started_at = datetime.utcnow()
            return selected

    async def get_job(self, job_id: str) -> Optional[SimulationJob]:
        async with self._lock:
            # Check by job_id or simulation_id
            job = self._jobs.get(job_id)
            if job:
                return job
            for j in self._jobs.values():
                if j.simulation_id == job_id:
                    return j
            return None

    async def update_job(self, job: SimulationJob) -> None:
        async with self._lock:
            self._jobs[job.job_id] = job
            if job.state in (JobState.COMPLETED, JobState.FAILED, JobState.CANCELLED):
                self._total_processed += 1

    async def list_jobs(self, state: Optional[JobState] = None) -> List[SimulationJob]:
        async with self._lock:
            if state:
                return [j.model_copy() for j in self._jobs.values() if j.state == state]
            return [j.model_copy() for j in self._jobs.values()]

    async def delete_job(self, job_id: str) -> None:
        async with self._lock:
            self._jobs.pop(job_id, None)

    async def get_metrics(self) -> QueueMetrics:
        async with self._lock:
            all_jobs = list(self._jobs.values())
            queue_depth = sum(1 for j in all_jobs if j.state in (JobState.QUEUED, JobState.STARTING))
            completed = [j for j in all_jobs if j.state == JobState.COMPLETED]
            failed = [j for j in all_jobs if j.state == JobState.FAILED]
            retries = sum(j.retry_count for j in all_jobs)
            
            total = len(completed) + len(failed)
            success_rate = (len(completed) / total * 100.0) if total > 0 else 100.0
            failure_rate = (len(failed) / total * 100.0) if total > 0 else 0.0
            
            runtimes = [
                (j.finished_at - j.started_at).total_seconds()
                for j in completed
                if j.finished_at and j.started_at
            ]
            avg_runtime = sum(runtimes) / len(runtimes) if runtimes else 0.0

            return QueueMetrics(
                queue_depth=queue_depth,
                active_workers_count=sum(1 for j in all_jobs if j.state == JobState.RUNNING),
                average_runtime_seconds=round(avg_runtime, 2),
                success_rate=round(success_rate, 2),
                failure_rate=round(failure_rate, 2),
                retry_count=retries,
                total_processed=self._total_processed,
            )
