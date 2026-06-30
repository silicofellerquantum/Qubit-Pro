from __future__ import annotations

import os
import asyncio
import pytest
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient
from app.main import app
from app.auth import get_current_user
from app.models import User, UserRole
from app.simulation.queue.models import SimulationJob, JobState, WorkerHealth
from app.simulation.queue.in_memory import InMemoryQueue
from app.simulation.queue.redis_queue import RedisQueue
from app.simulation.queue.rabbitmq_queue import RabbitMQQueue
from app.simulation.queue.scheduler import JobScheduler
from app.simulation.queue.retry import RetryManager
from app.simulation.queue.limits import ResourceLimiter
from app.simulation.queue.worker import BackgroundWorker
from app.simulation.service.exceptions import PipelinePhaseError, OrchestratorError

# Mock user for authenticated router tests
MOCK_USER = User(
    id="test-user-id",
    name="Test Engineer",
    email="test@silicofeller.com",
    role=UserRole.engineer,
)

@pytest.fixture
def test_client():
    """FastAPI TestClient with overridden auth dependency."""
    app.dependency_overrides[get_current_user] = lambda: MOCK_USER
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


def test_job_model_validation():
    """Verify SimulationJob Pydantic validation and defaults."""
    job = SimulationJob(
        job_id="job-123",
        simulation_id="sim-456",
        project_id="proj-789",
        user_id="user-abc",
        solver_type="eigenmode",
        design_payload={"components": []},
    )
    assert job.job_id == "job-123"
    assert job.state == JobState.QUEUED
    assert job.priority == 5
    assert isinstance(job.enqueued_at, datetime)


@pytest.mark.asyncio
async def test_in_memory_queue_operations():
    """Test enqueue, dequeue, priority sorting, get_job, and metrics for InMemoryQueue."""
    queue = InMemoryQueue()

    # Enqueue three jobs with different priorities
    job_low = SimulationJob(
        job_id="job-low",
        simulation_id="sim-low",
        project_id="p-1",
        user_id="u-1",
        solver_type="eigenmode",
        design_payload={},
        priority=2,
    )
    job_high = SimulationJob(
        job_id="job-high",
        simulation_id="sim-high",
        project_id="p-1",
        user_id="u-1",
        solver_type="eigenmode",
        design_payload={},
        priority=8,
    )
    job_mid = SimulationJob(
        job_id="job-mid",
        simulation_id="sim-mid",
        project_id="p-1",
        user_id="u-1",
        solver_type="eigenmode",
        design_payload={},
        priority=5,
    )

    await queue.enqueue(job_low)
    await queue.enqueue(job_high)
    await queue.enqueue(job_mid)

    # Dequeue should return job_high first (priority 8 > 5 > 2)
    first = await queue.dequeue()
    assert first is not None
    assert first.job_id == "job-high"
    assert first.state == JobState.STARTING

    # Dequeue second should return job_mid (priority 5)
    second = await queue.dequeue()
    assert second is not None
    assert second.job_id == "job-mid"

    # Test get_job
    fetched = await queue.get_job("job-low")
    assert fetched is not None
    assert fetched.simulation_id == "sim-low"

    # Test metrics (3 enqueued, 2 dequeued are in STARTING state, 1 in QUEUED state)
    metrics = await queue.get_metrics()
    assert metrics.queue_depth == 3
    assert metrics.success_rate == 100.0


def test_retry_manager():
    """Verify RetryManager retry policies on transient vs deterministic errors."""
    manager = RetryManager(max_retries=2)

    # Transient error (should retry)
    transient_err = Exception("Database lock timeout")
    assert manager.should_retry(transient_err, 0) is True
    assert manager.should_retry(transient_err, 1) is True
    assert manager.should_retry(transient_err, 2) is False  # max retries reached

    # Deterministic error (should NOT retry)
    deterministic_err = Exception("Cannot run simulation on an empty design.")
    assert manager.should_retry(deterministic_err, 0) is False

    # PipelinePhaseError with deterministic inner message (should NOT retry)
    phase_err = PipelinePhaseError("mesh", "Empty design coordinates")
    assert manager.should_retry(phase_err, 0) is False

    # Exponential backoff calculation
    assert manager.get_backoff_delay(0) == 2.0
    assert manager.get_backoff_delay(1) == 4.0
    assert manager.get_backoff_delay(2) == 8.0


def test_resource_limiter():
    """Verify ResourceLimiter preflight and dynamic checks."""
    limiter = ResourceLimiter(min_disk_space_mb=100.0, max_ram_mb=4096.0)

    # Test preflight check on current directory (should pass under normal test environments)
    passed, err = limiter.check_preflight_limits(os.getcwd())
    assert passed is True
    assert err == ""

    # Test preflight check failure with abnormally high disk demand
    strict_limiter = ResourceLimiter(min_disk_space_mb=999999999.0)
    passed, err = strict_limiter.check_preflight_limits(os.getcwd())
    assert passed is False
    assert "Insufficient disk space" in err

    # Test memory check (should pass as current process memory is normally < 4GB)
    safe, mem = limiter.check_memory_consumption()
    assert safe is True


@pytest.mark.asyncio
async def test_job_scheduler():
    """Verify JobScheduler concurrency and dispatch limits."""
    queue = InMemoryQueue()
    scheduler = JobScheduler(queue, max_concurrency=1)

    assert scheduler.can_run_more() is True

    job1 = SimulationJob(
        job_id="job1", simulation_id="sim1", project_id="p", user_id="u", solver_type="eigenmode", design_payload={}
    )
    job2 = SimulationJob(
        job_id="job2", simulation_id="sim2", project_id="p", user_id="u", solver_type="eigenmode", design_payload={}
    )

    await queue.enqueue(job1)
    await queue.enqueue(job2)

    # Register start of job1
    await scheduler.register_start(job1, "worker-1")
    assert scheduler.can_run_more() is False  # Max concurrency 1 reached

    # Acquire next job should return None because capacity is full
    next_job = await scheduler.acquire_next_job()
    assert next_job is None

    # Register completion
    await scheduler.register_completion("job1")
    assert scheduler.can_run_more() is True


@pytest.mark.asyncio
@patch("app.simulation.queue.worker.AsyncSessionLocal")
@patch("app.simulation.queue.worker.SimulationService")
async def test_background_worker_execution(mock_sim_service_cls, mock_session_cls):
    """Test BackgroundWorker enqueuing, progress updates, and success path."""
    # Setup mocks
    mock_service = MagicMock()
    mock_service.execute_simulation = AsyncMock(return_value={"eigenfrequencies": [5.1, 5.2]})
    mock_service.get_active_context = MagicMock(return_value=None)
    mock_sim_service_cls.return_value = mock_service

    queue = InMemoryQueue()
    scheduler = JobScheduler(queue, max_concurrency=2)
    worker = BackgroundWorker("test-worker", queue, scheduler)

    job = SimulationJob(
        job_id="job-1",
        simulation_id="sim-1",
        project_id="proj-1",
        user_id="user-1",
        solver_type="eigenmode",
        design_payload={"placement": {"qubits": ["Q1"]}},
    )
    await queue.enqueue(job)

    # Run execution directly on the worker
    await worker._execute_job(job)

    # Assert job state was updated to COMPLETED
    updated_job = await queue.get_job("job-1")
    assert updated_job is not None
    assert updated_job.state == JobState.COMPLETED
    assert updated_job.progress == 100.0


def test_redis_and_rabbitmq_stubs():
    """Verify that Redis and RabbitMQ queue stubs compile and initialize safely without crashing."""
    rq = RedisQueue(redis_url="redis://localhost:9999/0")
    # Verify we can construct and call methods safely (they will run in mock/fallback mode)
    assert rq.redis_url == "redis://localhost:9999/0"

    rmq = RabbitMQQueue(amqp_url="amqp://guest:guest@localhost:9999/")
    assert rmq.amqp_url == "amqp://guest:guest@localhost:9999/"


# ── REST API Tests ────────────────────────────────────────────────────────────

def test_get_queue_health(test_client):
    """Verify GET /api/queue/health returns active workers list."""
    # Inject a mock worker into active_workers registry
    from app.simulation.queue.worker import active_workers
    active_workers["test-worker-id"] = WorkerHealth(
        worker_id="test-worker-id",
        status="idle",
        uptime_seconds=3600.0,
        memory_usage_mb=150.0,
        cpu_percent=12.5,
        disk_usage_percent=45.2,
    )

    response = test_client.get("/api/queue/health")
    assert response.status_code == 200
    data = response.json()
    assert "workers" in data
    assert len(data["workers"]) >= 1
    
    worker_ids = [w["worker_id"] for w in data["workers"]]
    assert "test-worker-id" in worker_ids

    # Clean up
    active_workers.pop("test-worker-id", None)


def test_get_queue_metrics(test_client):
    """Verify GET /api/queue/metrics returns depth and runtime metrics."""
    response = test_client.get("/api/queue/metrics")
    assert response.status_code == 200
    data = response.json()
    assert "metrics" in data
    assert "queue_depth" in data["metrics"]
    assert "success_rate" in data["metrics"]


@pytest.mark.asyncio
async def test_list_queue_jobs(test_client):
    """Verify GET /api/queue/jobs lists jobs in queue."""
    from app.simulation.queue import global_queue
    job = SimulationJob(
        job_id="api-test-job",
        simulation_id="api-test-sim",
        project_id="proj",
        user_id="user",
        solver_type="eigenmode",
        design_payload={},
    )
    await global_queue.enqueue(job)

    response = test_client.get("/api/queue/jobs")
    assert response.status_code == 200
    data = response.json()
    assert "jobs" in data
    job_ids = [j["job_id"] for j in data["jobs"]]
    assert "api-test-job" in job_ids

    # Clean up
    await global_queue.delete_job("api-test-job")
