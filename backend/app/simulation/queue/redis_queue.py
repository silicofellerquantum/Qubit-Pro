from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import List, Optional
from app.simulation.queue.interface import QueueBackend
from app.simulation.queue.models import SimulationJob, JobState, QueueMetrics

logger = logging.getLogger(__name__)

class RedisQueue(QueueBackend):
    """Redis-backed persistent queue implementation.

    Enables horizontal scaling of background workers by using Redis list
    and hash structures for job distribution and state management.
    """

    def __init__(self, redis_url: str = "redis://localhost:6379/0") -> None:
        self.redis_url = redis_url
        self._client = None
        self._initialized = False

    def _init_client(self):
        if self._initialized:
            return
        try:
            import redis
            self._client = redis.from_url(self.redis_url, decode_responses=True)
            self._initialized = True
        except ImportError:
            logger.warning("redis-py not installed. RedisQueue will operate in mock/fallback mode.")
            self._client = None
            self._initialized = True
        except Exception as e:
            logger.error("Failed to connect to Redis at %s: %s", self.redis_url, e)
            self._client = None
            self._initialized = True

    async def enqueue(self, job: SimulationJob) -> None:
        self._init_client()
        job.state = JobState.QUEUED
        job.enqueued_at = datetime.utcnow()
        job_data = job.model_dump_json()

        if self._client:
            try:
                # Use a pipeline for transaction-safe enqueue
                pipe = self._client.pipeline()
                # Store job payload in a hash
                pipe.hset("qs:jobs", job.job_id, job_data)
                # Enqueue the job_id into a priority list or simple queue
                pipe.lpush("qs:queue", job.job_id)
                pipe.execute()
            except Exception as e:
                logger.error("Redis enqueue failed: %s", e)
                raise

    async def dequeue(self) -> Optional[SimulationJob]:
        self._init_client()
        if not self._client:
            return None

        try:
            # Atomic pop from the queue
            job_id = self._client.rpop("qs:queue")
            if not job_id:
                return None

            job_data = self._client.hget("qs:jobs", job_id)
            if not job_data:
                return None

            job = SimulationJob.model_validate_json(job_data)
            job.state = JobState.STARTING
            job.started_at = datetime.utcnow()
            
            # Update state back in Redis
            self._client.hset("qs:jobs", job.job_id, job.model_dump_json())
            return job
        except Exception as e:
            logger.error("Redis dequeue failed: %s", e)
            return None

    async def get_job(self, job_id: str) -> Optional[SimulationJob]:
        self._init_client()
        if not self._client:
            return None

        try:
            # Direct hash lookup
            job_data = self._client.hget("qs:jobs", job_id)
            if job_data:
                return SimulationJob.model_validate_json(job_data)
            
            # Fallback scan for simulation_id matches
            all_jobs = self._client.hvals("qs:jobs")
            for jd in all_jobs:
                job = SimulationJob.model_validate_json(jd)
                if job.simulation_id == job_id:
                    return job
            return None
        except Exception as e:
            logger.error("Redis get_job failed: %s", e)
            return None

    async def update_job(self, job: SimulationJob) -> None:
        self._init_client()
        if not self._client:
            return

        try:
            self._client.hset("qs:jobs", job.job_id, job.model_dump_json())
        except Exception as e:
            logger.error("Redis update_job failed: %s", e)

    async def list_jobs(self, state: Optional[JobState] = None) -> List[SimulationJob]:
        self._init_client()
        if not self._client:
            return []

        try:
            all_data = self._client.hvals("qs:jobs")
            jobs = [SimulationJob.model_validate_json(jd) for jd in all_data]
            if state:
                return [j for j in jobs if j.state == state]
            return jobs
        except Exception as e:
            logger.error("Redis list_jobs failed: %s", e)
            return []

    async def delete_job(self, job_id: str) -> None:
        self._init_client()
        if not self._client:
            return

        try:
            self._client.hdel("qs:jobs", job_id)
        except Exception as e:
            logger.error("Redis delete_job failed: %s", e)

    async def get_metrics(self) -> QueueMetrics:
        self._init_client()
        if not self._client:
            return QueueMetrics()

        try:
            queue_depth = self._client.llen("qs:queue") or 0
            all_data = self._client.hvals("qs:jobs")
            jobs = [SimulationJob.model_validate_json(jd) for jd in all_data]
            
            completed = [j for j in jobs if j.state == JobState.COMPLETED]
            failed = [j for j in jobs if j.state == JobState.FAILED]
            retries = sum(j.retry_count for j in jobs)

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
                active_workers_count=sum(1 for j in jobs if j.state == JobState.RUNNING),
                average_runtime_seconds=round(avg_runtime, 2),
                success_rate=round(success_rate, 2),
                failure_rate=round(failure_rate, 2),
                retry_count=retries,
                total_processed=len(completed) + len(failed),
            )
        except Exception as e:
            logger.error("Redis get_metrics failed: %s", e)
            return QueueMetrics()
