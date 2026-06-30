from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.auth import get_current_user
from app.models import User
from app.simulation.queue import global_queue, global_scheduler, active_workers
from app.simulation.queue.models import SimulationJob, WorkerHealth, QueueMetrics, JobState

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/queue", tags=["simulation-queue"])

# ── Response Models ───────────────────────────────────────────────────────────

class QueueHealthResponse(BaseModel):
    workers: List[WorkerHealth]

class QueueMetricsResponse(BaseModel):
    metrics: QueueMetrics

class QueueJobsResponse(BaseModel):
    jobs: List[SimulationJob]

# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/health", response_model=QueueHealthResponse)
async def get_queue_health(
    user: User = Depends(get_current_user),
) -> QueueHealthResponse:
    """Retrieve the heartbeat and health metrics of all active background workers."""
    workers_list = list(active_workers.values())
    return QueueHealthResponse(workers=workers_list)

@router.get("/metrics", response_model=QueueMetricsResponse)
async def get_queue_metrics(
    user: User = Depends(get_current_user),
) -> QueueMetricsResponse:
    """Retrieve overall queue performance metrics (depth, success rates, runtimes)."""
    metrics = await global_queue.get_metrics()
    return QueueMetricsResponse(metrics=metrics)

@router.get("/jobs", response_model=QueueJobsResponse)
async def list_queue_jobs(
    state: Optional[JobState] = None,
    user: User = Depends(get_current_user),
) -> QueueJobsResponse:
    """List all active, queued, and historical jobs in the queue."""
    jobs = await global_queue.list_jobs(state)
    return QueueJobsResponse(jobs=jobs)

@router.post("/cancel/{simulation_id}", status_code=status.HTTP_200_OK)
async def cancel_queue_job(
    simulation_id: str,
    user: User = Depends(get_current_user),
) -> Dict[str, str]:
    """Cancel a queued or active simulation job."""
    # Find job in queue
    job = await global_queue.get_job(simulation_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No simulation job found with ID '{simulation_id}' in queue."
        )

    if job.state in (JobState.COMPLETED, JobState.FAILED, JobState.CANCELLED):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot cancel job '{simulation_id}' because it is already in terminal state '{job.state.value}'."
        )

    # Trigger cancellation
    if job.state == JobState.RUNNING:
        # Worker handles cancellation internally if we cancel the simulation
        from app.simulation.queue import global_worker
        if global_worker:
            await global_worker.simulation_service.cancel_simulation(simulation_id)
        job.state = JobState.CANCELLED
        await global_queue.update_job(job)
    else:
        # Just update queued job to CANCELLED
        job.state = JobState.CANCELLED
        await global_queue.update_job(job)

    logger.info("User %s cancelled simulation job %s", user.email, simulation_id)
    return {"message": f"Simulation job '{simulation_id}' cancellation request sent successfully."}

@router.post("/purge", status_code=status.HTTP_200_OK)
async def purge_queue(
    user: User = Depends(get_current_user),
) -> Dict[str, str]:
    """Purge all completed, failed, or cancelled jobs from queue memory."""
    jobs = await global_queue.list_jobs()
    purged_count = 0
    for j in jobs:
        if j.state in (JobState.COMPLETED, JobState.FAILED, JobState.CANCELLED):
            await global_queue.delete_job(j.job_id)
            purged_count += 1
            
    logger.info("User %s purged %d terminal jobs from queue", user.email, purged_count)
    return {"message": f"Successfully purged {purged_count} terminal jobs from the queue."}
