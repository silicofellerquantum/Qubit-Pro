"""Production-grade health checking and telemetry (Prometheus metrics) endpoints."""

from __future__ import annotations

import os
import time
import shutil
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.simulation.queue import global_queue
from app.simulation.queue.worker import active_workers

logger = logging.getLogger(__name__)
router = APIRouter(tags=["health"])

# Track server startup time for uptime metric
START_TIME = time.time()


# ── Health Diagnostic Helpers ────────────────────────────────────────────────

async def check_database(db: AsyncSession) -> tuple[bool, float]:
    """Verify database connectivity and measure latency.
    
    Returns:
        A tuple of (is_healthy, latency_ms).
    """
    t0 = time.perf_counter()
    try:
        # Run a minimal query to verify connection pool and driver
        await db.execute(text("SELECT 1"))
        latency = (time.perf_counter() - t0) * 1000.0
        return True, round(latency, 2)
    except Exception as e:
        logger.error("Health check database failure: %s", e, exc_info=True)
        return False, 0.0


async def check_queue() -> tuple[bool, int, float]:
    """Verify queue backend connectivity and retrieve metrics.
    
    Returns:
        A tuple of (is_healthy, queue_depth, success_rate).
    """
    try:
        metrics = await global_queue.get_metrics()
        return True, metrics.queue_depth, metrics.success_rate
    except Exception as e:
        logger.error("Health check queue failure: %s", e, exc_info=True)
        return False, 0, 0.0


def check_disk_space() -> dict[str, Any]:
    """Measure disk space utilization on the workspace partition.
    
    Returns:
        A dictionary with disk usage details.
    """
    path = settings.workspace_root
    # Fallback if directory not yet created
    if not os.path.exists(path):
        path = "/"
    try:
        usage = shutil.disk_usage(path)
        percent_used = (usage.used / usage.total) * 100.0
        return {
            "total_bytes": usage.total,
            "used_bytes": usage.used,
            "free_bytes": usage.free,
            "percent_used": round(percent_used, 2),
            "status": "healthy" if percent_used < 90.0 else "warning"
        }
    except Exception as e:
        logger.error("Health check disk space failure: %s", e, exc_info=True)
        return {"status": "unknown", "error": str(e)}


def check_solvers() -> dict[str, Any]:
    """Verify presence of Palace, GMSH, and MPI launcher executables."""
    # 1. Check GMSH
    gmsh_ok = shutil.which("gmsh") is not None
    
    # 2. Check Palace (check PATH, Spack locations, and fallbacks)
    palace_ok = shutil.which("palace") is not None
    if not palace_ok:
        # Fallback check standard Spack directory roots
        standard_spack_roots = [
            os.path.expanduser("~/spack/opt/spack"),
            "/opt/spack"
        ]
        for root in standard_spack_roots:
            if os.path.exists(root):
                palace_ok = True
                break

    # 3. Check MPI
    mpi_ok = (shutil.which("mpirun") is not None) or (shutil.which("mpiexec") is not None)

    return {
        "gmsh_available": gmsh_ok,
        "palace_available": palace_ok or settings.palace_mock_mode,  # OK if in mock mode
        "palace_mock_mode": settings.palace_mock_mode,
        "mpi_available": mpi_ok
    }


# ── REST Endpoints ───────────────────────────────────────────────────────────

@router.get("/live")
async def live() -> dict[str, str]:
    """Liveness probe. Returns a basic status code with minimal footprint."""
    return {"status": "alive"}


@router.get("/ready")
async def ready(db: AsyncSession = Depends(get_db)) -> dict[str, str]:
    """Readiness probe. Verifies database and queue connections.
    
    Returns:
        HTTP 200 if healthy, otherwise HTTP 503 Service Unavailable.
    """
    db_ok, _ = await check_database(db)
    queue_ok, _, _ = await check_queue()

    if not db_ok or not queue_ok:
        reasons = []
        if not db_ok:
            reasons.append("database")
        if not queue_ok:
            reasons.append("queue")
        
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Service not ready due to unhealthy components: {', '.join(reasons)}"
        )

    return {"status": "ready"}


@router.get("/health")
async def health(db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    """Deep diagnostics endpoint. Reports status, performance, and resources of all services."""
    db_ok, db_latency = await check_database(db)
    queue_ok, queue_depth, queue_success_rate = await check_queue()
    disk = check_disk_space()
    solvers = check_solvers()

    uptime = time.time() - START_TIME

    overall_status = "healthy"
    if not db_ok or not queue_ok or disk.get("status") == "warning":
        overall_status = "degraded"
    if not db_ok and not queue_ok:
        overall_status = "unhealthy"

    return {
        "status": overall_status,
        "timestamp": time.time(),
        "uptime_seconds": round(uptime, 2),
        "app_env": settings.app_env,
        "database": {
            "status": "healthy" if db_ok else "unhealthy",
            "latency_ms": db_latency
        },
        "queue": {
            "status": "healthy" if queue_ok else "unhealthy",
            "backend": settings.redis_url.split(":")[0] if "redis" in settings.redis_url else "in_memory",
            "depth": queue_depth,
            "success_rate_percent": queue_success_rate
        },
        "workers": {
            "active_count": len(active_workers),
            "worker_details": [
                {
                    "worker_id": w.worker_id,
                    "status": w.status,
                    "uptime_seconds": w.uptime_seconds,
                    "memory_usage_mb": w.memory_usage_mb,
                    "cpu_percent": w.cpu_percent,
                    "disk_usage_percent": w.disk_usage_percent
                }
                for w in active_workers.values()
            ]
        },
        "system": {
            "disk_workspace": disk,
            "solvers": solvers
        }
    }


@router.get("/metrics")
async def metrics(db: AsyncSession = Depends(get_db)) -> Response:
    """Exposes Prometheus-compatible plain-text performance metrics."""
    db_ok, db_latency = await check_database(db)
    queue_ok, queue_depth, queue_success_rate = await check_queue()
    disk = check_disk_space()
    solvers = check_solvers()
    
    uptime = time.time() - START_TIME
    active_worker_count = len(active_workers)

    # Compile standard Prometheus gauge metrics
    lines = [
        "# HELP quantum_studio_up Server online status (1 = online)",
        "# TYPE quantum_studio_up gauge",
        f"quantum_studio_up 1",
        
        "# HELP quantum_studio_uptime_seconds Server execution duration",
        "# TYPE quantum_studio_uptime_seconds gauge",
        f"quantum_studio_uptime_seconds {uptime:.2f}",

        "# HELP quantum_studio_db_healthy Database connection status (1 = healthy, 0 = down)",
        "# TYPE quantum_studio_db_healthy gauge",
        f"quantum_studio_db_healthy {1 if db_ok else 0}",

        "# HELP quantum_studio_db_latency_ms Database response latency",
        "# TYPE quantum_studio_db_latency_ms gauge",
        f"quantum_studio_db_latency_ms {db_latency:.2f}",

        "# HELP quantum_studio_queue_healthy Task queue connection status (1 = healthy, 0 = down)",
        "# TYPE quantum_studio_queue_healthy gauge",
        f"quantum_studio_queue_healthy {1 if queue_ok else 0}",

        "# HELP quantum_studio_queue_depth Number of jobs currently in the queue",
        "# TYPE quantum_studio_queue_depth gauge",
        f"quantum_studio_queue_depth {queue_depth}",

        "# HELP quantum_studio_queue_success_rate_percent Historical queue job success rate",
        "# TYPE quantum_studio_queue_success_rate_percent gauge",
        f"quantum_studio_queue_success_rate_percent {queue_success_rate:.2f}",

        "# HELP quantum_studio_active_workers Number of online background workers",
        "# TYPE quantum_studio_active_workers gauge",
        f"quantum_studio_active_workers {active_worker_count}",

        "# HELP quantum_studio_free_disk_space_bytes Free disk space on the workspace partition",
        "# TYPE quantum_studio_free_disk_space_bytes gauge",
        f"quantum_studio_free_disk_space_bytes {disk.get('free_bytes', 0)}",

        "# HELP quantum_studio_disk_usage_percent Disk utilization percentage on the workspace partition",
        "# TYPE quantum_studio_disk_usage_percent gauge",
        f"quantum_studio_disk_usage_percent {disk.get('percent_used', 0.0):.2f}",

        "# HELP quantum_studio_palace_available Solver availability status (1 = found, 0 = missing)",
        "# TYPE quantum_studio_palace_available gauge",
        f"quantum_studio_palace_available {1 if solvers.get('palace_available') else 0}",

        "# HELP quantum_studio_mpi_available MPI availability status (1 = found, 0 = missing)",
        "# TYPE quantum_studio_mpi_available gauge",
        f"quantum_studio_mpi_available {1 if solvers.get('mpi_available') else 0}"
    ]

    # Include resource metrics for active workers
    for w in active_workers.values():
        clean_id = w.worker_id.replace("-", "_").replace(".", "_")
        lines.extend([
            f'# HELP quantum_studio_worker_cpu_percent CPU utilization of worker {w.worker_id}',
            f'# TYPE quantum_studio_worker_cpu_percent gauge',
            f'quantum_studio_worker_cpu_percent{{worker_id="{w.worker_id}"}} {w.cpu_percent:.2f}',
            
            f'# HELP quantum_studio_worker_memory_usage_mb RAM utilization of worker {w.worker_id}',
            f'# TYPE quantum_studio_worker_memory_usage_mb gauge',
            f'quantum_studio_worker_memory_usage_mb{{worker_id="{w.worker_id}"}} {w.memory_usage_mb:.2f}'
        ])

    content = "\n".join(lines) + "\n"
    return Response(content=content, media_type="text/plain")


# ── Add direct mappings to standard root paths for ingress/proxy compatibility ─

def register_root_health_endpoints(app: Any) -> None:
    """Register root-level aliases for the health endpoints.
    
    This exposes /live, /ready, and /health at the root level, making them
    instantly compatible with standard Kubernetes and load balancer probes.
    """
    app.include_router(router)
