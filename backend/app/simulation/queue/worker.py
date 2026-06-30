from __future__ import annotations

import asyncio
import logging
import time
import os
import sys
import signal
from datetime import datetime
from typing import Dict, Optional, Any

from app.database import AsyncSessionLocal
from app.simulation.service.simulation_service import SimulationService, SimulationRequest, RollbackPolicy
from app.simulation.service.state_manager import PipelineState
from app.simulation.queue.models import SimulationJob, JobState, WorkerHealth
from app.simulation.queue.interface import QueueBackend
from app.simulation.queue.in_memory import InMemoryQueue
from app.simulation.queue.scheduler import JobScheduler
from app.simulation.queue.retry import RetryManager
from app.simulation.queue.limits import ResourceLimiter

logger = logging.getLogger(__name__)

# Global registry of active workers for monitoring
active_workers: Dict[str, WorkerHealth] = {}

class BackgroundWorker:
    """Standalone background worker that processes simulation jobs from the queue."""

    def __init__(
        self,
        worker_id: str,
        queue_backend: QueueBackend,
        scheduler: JobScheduler,
        max_cpu_cores: int = 4,
        max_ram_mb: float = 8192.0,
        max_runtime_seconds: float = 1800.0,
    ) -> None:
        self.worker_id = worker_id
        self.queue_backend = queue_backend
        self.scheduler = scheduler
        self.simulation_service = SimulationService()
        
        self.retry_manager = RetryManager()
        self.limiter = ResourceLimiter(
            max_cpu_cores=max_cpu_cores,
            max_ram_mb=max_ram_mb,
            max_runtime_seconds=max_runtime_seconds,
        )
        
        self.status = "idle"
        self.current_job_id: Optional[str] = None
        self.start_time = datetime.utcnow()
        
        self._running = False
        self._active_task: Optional[asyncio.Task[Any]] = None
        self._shutdown_event = asyncio.Event()
        self._heartbeat_task: Optional[asyncio.Task[Any]] = None
        self._retry_tasks: set[asyncio.Task[Any]] = set()
        self._main_task: Optional[asyncio.Task[Any]] = None

    def get_health(self) -> WorkerHealth:
        """Collect current system metrics and return the WorkerHealth status."""
        uptime = (datetime.utcnow() - self.start_time).total_seconds()
        
        # Safe defaults if psutil or checks fail
        cpu_percent = 0.0
        memory_usage_mb = 0.0
        disk_usage_percent = 0.0
        
        try:
            import psutil
            cpu_percent = psutil.cpu_percent()
            memory_usage_mb = psutil.Process(os.getpid()).memory_info().rss / (1024 * 1024)
            disk_usage_percent = psutil.disk_usage("/").percent
        except Exception:
            # Fallback using shutil for disk
            try:
                total, used, free = shutil.disk_usage("/")
                disk_usage_percent = (used / total) * 100.0
            except Exception:
                pass

        health = WorkerHealth(
            worker_id=self.worker_id,
            status=self.status,
            current_job_id=self.current_job_id,
            uptime_seconds=round(uptime, 1),
            memory_usage_mb=round(memory_usage_mb, 1),
            cpu_percent=round(cpu_percent, 1),
            disk_usage_percent=round(disk_usage_percent, 1),
            last_heartbeat=datetime.utcnow(),
        )
        active_workers[self.worker_id] = health
        return health

    async def start(self) -> None:
        """Start the worker loop."""
        self._main_task = asyncio.current_task()
        self._running = True
        logger.info("BackgroundWorker '%s' started.", self.worker_id)
        self.get_health()
        
        # Spawn heartbeat task
        self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())
        
        while self._running:
            try:
                if self.scheduler.can_run_more():
                    job = await self.scheduler.acquire_next_job()
                    if job:
                        self.status = "busy"
                        self.current_job_id = job.job_id
                        self.get_health()
                        
                        # Spawn simulation execution task
                        self._active_task = asyncio.create_task(self._execute_job(job))
                        try:
                            await self._active_task
                        except asyncio.CancelledError:
                            logger.warning("Active job task cancelled.")
                        finally:
                            self._active_task = None
                            self.status = "idle"
                            self.current_job_id = None
                            self.get_health()
                
                # Yield control / throttle polling
                await asyncio.sleep(1.0)
            except Exception as e:
                logger.error("Error in worker loop: %s", e)
                await asyncio.sleep(2.0)

    async def stop(self) -> None:
        """Signal the worker to stop and cancel any running job."""
        logger.info("Stopping BackgroundWorker '%s'...", self.worker_id)
        self._running = False
        self._shutdown_event.set()
        
        if self._heartbeat_task:
            self._heartbeat_task.cancel()
            try:
                await self._heartbeat_task
            except (asyncio.CancelledError, Exception):
                pass
            self._heartbeat_task = None
            
        for t in list(self._retry_tasks):
            t.cancel()
            try:
                await t
            except (asyncio.CancelledError, Exception):
                pass
        self._retry_tasks.clear()
        
        if self._active_task:
            logger.info("Cancelling active simulation job task...")
            self._active_task.cancel()
            
            # If there's an active job, cancel the simulation orchestrator
            if self.current_job_id:
                try:
                    # Retrieve the simulation_id from the job
                    job = await self.queue_backend.get_job(self.current_job_id)
                    if job:
                        await self.simulation_service.cancel_simulation(job.simulation_id)
                except Exception as ce:
                    logger.error("Error during Palace runner cancellation on shutdown: %s", ce)
            
            try:
                await self._active_task
            except (asyncio.CancelledError, Exception):
                pass
                
        if self._main_task and self._main_task != asyncio.current_task():
            self._main_task.cancel()
            try:
                await self._main_task
            except (asyncio.CancelledError, Exception):
                pass
            self._main_task = None
        
        if self.worker_id in active_workers:
            active_workers.pop(self.worker_id)
        logger.info("Worker '%s' stopped successfully.", self.worker_id)

    async def _heartbeat_loop(self) -> None:
        """Periodic loop to post worker metrics and heartbeat status."""
        while self._running:
            try:
                self.get_health()
            except Exception as e:
                logger.error("Heartbeat generation failed: %s", e)
            await asyncio.sleep(5.0)

    async def _execute_job(self, job: SimulationJob) -> None:
        """Coordinate the preflight limits, execution, progress tracking, retries, and database sync."""
        if job.correlation_id:
            from app.core.logging import correlation_id_ctx
            correlation_id_ctx.set(job.correlation_id)

        logger.info("Worker '%s' initiating job '%s' (Simulation: %s)", self.worker_id, job.job_id, job.simulation_id)
        
        # 1. Preflight limits check (e.g. Disk Space)
        workspace_dir = os.path.join(os.getcwd(), "workspaces")
        os.makedirs(workspace_dir, exist_ok=True)
        passed, limit_err = self.limiter.check_preflight_limits(workspace_dir)
        if not passed:
            job.state = JobState.FAILED
            job.error_message = limit_err
            job.finished_at = datetime.utcnow()
            await self.queue_backend.update_job(job)
            await self.scheduler.register_completion(job.job_id)
            # Persist failure to DB
            await self._persist_failure_to_db(job, limit_err)
            return

        # 2. Register execution start in scheduler
        await self.scheduler.register_start(job, self.worker_id)

        # 3. Form the SimulationRequest
        # Map rollback policy string to enum
        rb_policy = RollbackPolicy.DELETE_ON_SUCCESS
        if job.rollback_policy == "DELETE_ALL":
            rb_policy = RollbackPolicy.DELETE_ALL
        elif job.rollback_policy == "KEEP_ALL":
            rb_policy = RollbackPolicy.KEEP_ALL

        request = SimulationRequest(
            simulation_id=job.simulation_id,
            design_payload=job.design_payload,
            solver_type=job.solver_type,
            user_settings=job.user_settings,
            terminal_names=job.terminal_names,
            qubits=job.qubits,
            port_names=job.port_names,
            mesh_settings=job.mesh_settings,
            coarse_mesh=job.coarse_mesh,
            rollback_policy=rb_policy,
        )

        # Progress callback function
        def on_progress_callback(phase_info: Any) -> None:
            # Schedule the async update on the running loop
            async def do_update():
                ctx = self.simulation_service.get_active_context(job.simulation_id)
                if ctx:
                    progress_map = {
                        PipelineState.REQUEST_RECEIVED: 10.0,
                        PipelineState.WORKSPACE_READY: 20.0,
                        PipelineState.GEOMETRY_READY: 40.0,
                        PipelineState.MESH_READY: 60.0,
                        PipelineState.CONFIG_READY: 70.0,
                        PipelineState.RUNNING: 80.0,
                        PipelineState.RESULTS_READY: 90.0,
                        PipelineState.COMPLETED: 100.0,
                        PipelineState.FAILED: 100.0,
                        PipelineState.CANCELLED: 100.0,
                    }
                    job.progress = progress_map.get(ctx.status, 5.0)
                    job.current_phase = ctx.current_phase or ctx.status.value
                    job.warnings = list(ctx.warnings)
                    job.error_message = ctx.errors[0] if ctx.errors else None
                    await self.queue_backend.update_job(job)
                    
                    # Also check memory limits dynamically
                    mem_ok, current_mem = self.limiter.check_memory_consumption()
                    if not mem_ok:
                        logger.error("Worker memory limit exceeded. Cancelling simulation.")
                        await self.simulation_service.cancel_simulation(job.simulation_id)

            try:
                loop = asyncio.get_running_loop()
                if loop.is_running():
                    loop.create_task(do_update())
            except RuntimeError:
                # Fallback if run outside an active event loop
                pass

        # 4. Run the simulation
        async with AsyncSessionLocal() as session:
            try:
                # Restrict CPU affinity/nice on the current worker process
                self.limiter.enforce_cpu_limit(os.getpid())
                
                # Execute simulation. Database persistence is handled automatically by SimulationService!
                logger.info("Worker calling simulation service...")
                response = await self.simulation_service.execute_simulation(
                    request=request,
                    session=session,
                    project_id=job.project_id,
                    user_id=job.user_id,
                    on_progress=on_progress_callback,
                )
                
                # Success!
                job.state = JobState.COMPLETED
                job.progress = 100.0
                job.finished_at = datetime.utcnow()
                await self.queue_backend.update_job(job)
                logger.info("Job '%s' completed successfully.", job.job_id)

            except asyncio.CancelledError:
                job.state = JobState.CANCELLED
                job.finished_at = datetime.utcnow()
                job.error_message = "Simulation job was cancelled."
                await self.queue_backend.update_job(job)
                logger.warning("Job '%s' was cancelled.", job.job_id)

            except Exception as e:
                logger.exception("Error executing simulation in worker: %s", e)
                
                # Evaluate retry policy
                if self.retry_manager.should_retry(e, job.retry_count):
                    job.state = JobState.RETRYING
                    job.retry_count += 1
                    job.error_message = f"Failed with: {e}. Retrying..."
                    await self.queue_backend.update_job(job)
                    
                    # Wait for backoff delay and re-enqueue
                    delay = self.retry_manager.get_backoff_delay(job.retry_count)
                    logger.info("Backoff delay for %s: %.1f seconds.", job.job_id, delay)
                    
                    async def re_enqueue_after_delay():
                        try:
                            await asyncio.sleep(delay)
                            job.state = JobState.QUEUED
                            await self.queue_backend.enqueue(job)
                        except asyncio.CancelledError:
                            logger.info("Re-enqueue task for job %s cancelled.", job.job_id)
                        
                    t = asyncio.create_task(re_enqueue_after_delay())
                    self._retry_tasks.add(t)
                    t.add_done_callback(self._retry_tasks.discard)
                else:
                    job.state = JobState.FAILED
                    job.finished_at = datetime.utcnow()
                    job.error_message = str(e)
                    await self.queue_backend.update_job(job)
                    
            finally:
                await self.scheduler.register_completion(job.job_id)

    async def _persist_failure_to_db(self, job: SimulationJob, error_message: str) -> None:
        """Helper to create a failed Simulation record in the database for preflight aborts."""
        try:
            async with AsyncSessionLocal() as session:
                from app.models import Simulation, SimulationStatus
                from app.simulation.database.persistence_service import SimulationPersistenceService
                from app.simulation.service.simulation_service import SimulationResponse, SimulationExecutionSummary
                
                summary = SimulationExecutionSummary(
                    simulation_id=job.simulation_id,
                    status=PipelineState.FAILED,
                    start_time=datetime.utcnow().isoformat() + "Z",
                    end_time=datetime.utcnow().isoformat() + "Z",
                    total_runtime_seconds=0.0,
                    phase_timings={},
                    generated_files=[],
                    warnings=[],
                    errors=[error_message],
                )
                
                persist_service = SimulationPersistenceService()
                await persist_service.save_simulation_run(
                    session=session,
                    request=SimulationRequest(
                        simulation_id=job.simulation_id,
                        design_payload=job.design_payload,
                        solver_type=job.solver_type,
                        user_settings=job.user_settings,
                    ),
                    response=SimulationResponse(results={}, summary=summary),
                    project_id=job.project_id,
                    user_id=job.user_id,
                )
                await session.commit()
        except Exception as db_err:
            logger.error("Failed to persist preflight failure to database: %s", db_err)
