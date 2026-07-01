from __future__ import annotations

import asyncio
import logging
from app.simulation.queue.models import JobState, SimulationJob, WorkerHealth, QueueMetrics
from app.simulation.queue.interface import QueueBackend
from app.simulation.queue.in_memory import InMemoryQueue
from app.simulation.queue.redis_queue import RedisQueue
from app.simulation.queue.rabbitmq_queue import RabbitMQQueue
from app.simulation.queue.scheduler import JobScheduler
from app.simulation.queue.retry import RetryManager
from app.simulation.queue.limits import ResourceLimiter
from app.simulation.queue.worker import BackgroundWorker, active_workers

logger = logging.getLogger(__name__)


def _build_queue_backend() -> QueueBackend:
    """Instantiate the appropriate queue backend based on settings.queue_backend.

    Defaults to InMemoryQueue for zero-setup local development.  Set
    QUEUE_BACKEND=redis or QUEUE_BACKEND=rabbitmq in the environment (or .env)
    to switch to a persistent, multi-process capable backend.
    """
    from app.config import settings  # import here to avoid circular import at module load

    backend = settings.queue_backend
    if backend == "redis":
        logger.info("Queue backend: RedisQueue (url=%s)", settings.redis_url)
        return RedisQueue(redis_url=settings.redis_url)
    elif backend == "rabbitmq":
        logger.info("Queue backend: RabbitMQQueue")
        return RabbitMQQueue()
    else:
        logger.info("Queue backend: InMemoryQueue (default, local-dev mode)")
        return InMemoryQueue()


# Global queue and scheduler instances — backend selected from settings at startup
global_queue: QueueBackend = _build_queue_backend()

# max_concurrency is now configurable via settings.simulation_max_concurrency (env: SIMULATION_MAX_CONCURRENCY)
from app.config import settings as _settings  # noqa: E402
global_scheduler = JobScheduler(global_queue, max_concurrency=_settings.simulation_max_concurrency)
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
