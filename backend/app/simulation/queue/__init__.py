from __future__ import annotations

import asyncio
from app.simulation.queue.models import JobState, SimulationJob, WorkerHealth, QueueMetrics
from app.simulation.queue.interface import QueueBackend
from app.simulation.queue.in_memory import InMemoryQueue
from app.simulation.queue.redis_queue import RedisQueue
from app.simulation.queue.rabbitmq_queue import RabbitMQQueue
from app.simulation.queue.scheduler import JobScheduler
from app.simulation.queue.retry import RetryManager
from app.simulation.queue.limits import ResourceLimiter
from app.simulation.queue.worker import BackgroundWorker, active_workers

# Global queue and scheduler instances for in-process mode
global_queue = InMemoryQueue()
global_scheduler = JobScheduler(global_queue, max_concurrency=2)
global_worker: BackgroundWorker | None = None

async def start_global_worker() -> BackgroundWorker:
    """Start the global background worker thread/task inside the current process."""
    global global_worker
    if global_worker is None:
        global_worker = BackgroundWorker(
            worker_id="qs-inprocess-worker-01",
            queue_backend=global_queue,
            scheduler=global_scheduler,
        )
        # Spawn the worker start task in the background
        asyncio.create_task(global_worker.start())
    return global_worker
