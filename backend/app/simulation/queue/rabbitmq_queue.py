from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import List, Optional, Dict
from app.simulation.queue.interface import QueueBackend
from app.simulation.queue.models import SimulationJob, JobState, QueueMetrics

logger = logging.getLogger(__name__)

class RabbitMQQueue(QueueBackend):
    """RabbitMQ AMQP persistent queue implementation.

    Decouples job producers and consumers using standard AMQP exchange and routing keys.
    """

    def __init__(self, amqp_url: str = "amqp://guest:guest@localhost:5672/") -> None:
        self.amqp_url = amqp_url
        self._connection = None
        self._channel = None
        self._jobs: Dict[str, SimulationJob] = {}  # Local fallback / tracking cache
        self._initialized = False

    async def _init_amqp(self):
        if self._initialized:
            return
        try:
            import aio_pika
            self._connection = await aio_pika.connect_robust(self.amqp_url)
            self._channel = await self._connection.channel()
            await self._channel.declare_queue("qs_simulation_jobs", durable=True)
            self._initialized = True
        except ImportError:
            logger.warning("aio-pika not installed. RabbitMQQueue will operate in hybrid local-cached mode.")
            self._initialized = True
        except Exception as e:
            logger.error("Failed to connect to RabbitMQ at %s: %s", self.amqp_url, e)
            self._initialized = True

    async def enqueue(self, job: SimulationJob) -> None:
        await self._init_amqp()
        job.state = JobState.QUEUED
        job.enqueued_at = datetime.utcnow()
        self._jobs[job.job_id] = job

        if self._channel:
            try:
                import aio_pika
                message = aio_pika.Message(
                    body=job.model_dump_json().encode(),
                    delivery_mode=aio_pika.DeliveryMode.PERSISTENT
                )
                await self._channel.default_exchange.publish(
                    message,
                    routing_key="qs_simulation_jobs"
                )
            except Exception as e:
                logger.error("RabbitMQ enqueue failed: %s", e)
                raise

    async def dequeue(self) -> Optional[SimulationJob]:
        await self._init_amqp()
        if not self._channel:
            # Fallback to local cache dequeue
            queued = [j for j in self._jobs.values() if j.state == JobState.QUEUED]
            if not queued:
                return None
            queued.sort(key=lambda j: (-j.priority, j.enqueued_at))
            selected = queued[0]
            selected.state = JobState.STARTING
            selected.started_at = datetime.utcnow()
            return selected

        try:
            import aio_pika
            queue = await self._channel.get_queue("qs_simulation_jobs")
            # Get single message (no ack yet, or auto_ack=False)
            message = await queue.get(fail=False)
            if not message:
                return None

            async with message.process():
                job = SimulationJob.model_validate_json(message.body.decode())
                job.state = JobState.STARTING
                job.started_at = datetime.utcnow()
                self._jobs[job.job_id] = job
                return job
        except Exception as e:
            logger.error("RabbitMQ dequeue failed: %s", e)
            return None

    async def get_job(self, job_id: str) -> Optional[SimulationJob]:
        # Reads from local tracking cache
        job = self._jobs.get(job_id)
        if job:
            return job
        for j in self._jobs.values():
            if j.simulation_id == job_id:
                return j
        return None

    async def update_job(self, job: SimulationJob) -> None:
        self._jobs[job.job_id] = job

    async def list_jobs(self, state: Optional[JobState] = None) -> List[SimulationJob]:
        if state:
            return [j.model_copy() for j in self._jobs.values() if j.state == state]
        return [j.model_copy() for j in self._jobs.values()]

    async def delete_job(self, job_id: str) -> None:
        self._jobs.pop(job_id, None)

    async def get_metrics(self) -> QueueMetrics:
        all_jobs = list(self._jobs.values())
        queue_depth = sum(1 for j in all_jobs if j.state in (JobState.QUEUED, JobState.STARTING))
        completed = [j for j in all_jobs if j.state == JobState.COMPLETED]
        failed = [j for j in all_jobs if j.state == JobState.FAILED]
        
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
            retry_count=sum(j.retry_count for j in all_jobs),
            total_processed=len(completed) + len(failed),
        )
