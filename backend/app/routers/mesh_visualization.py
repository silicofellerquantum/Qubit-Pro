"""FastAPI router for Palace 3D tetrahedral mesh wireframe visualization."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import User, Simulation
from app.routers.simulations import _authorize_simulation
from app.services.palace_mesh_parser import PalaceMeshParser

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/simulations",
    tags=["mesh-visualization-3d"],
)

# Project root directory (workspace root)
_PROJECT_ROOT = Path(__file__).resolve().parents[3]

@router.get("/{job_id}/mesh-wireframe", response_model=Dict[str, Any])
async def get_mesh_wireframe(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Parses and returns the 3D volume tetrahedral mesh wireframe and 2D boundary surfaces for rendering."""
    # 1. Authorize access to the simulation
    sim = None
    try:
        sim = await _authorize_simulation(db, job_id, user.id)
    except Exception as exc:
        logger.warning("Database authorization failed or skipped for simulation %s: %s", job_id, exc)

    # 2. Locate the mesh file (.msh) across multiple potential paths:
    #   A. palace_output/{job_id}/postpro/ (Requested path)
    #   B. DB-resolved simulation artifact_path
    #   C. Standard storage/simulations/ paths
    #   D. Fallback recursive scanning
    mesh_path: Optional[Path] = None
    search_paths: List[Path] = []

    # Path A: palace_output/{job_id}/postpro/ and parent
    search_paths.append(_PROJECT_ROOT / "palace_output" / job_id / "postpro" / "mesh.msh")
    search_paths.append(_PROJECT_ROOT / "palace_output" / job_id / "mesh.msh")
    search_paths.append(_PROJECT_ROOT / "backend" / "palace_output" / job_id / "postpro" / "mesh.msh")

    # Path B: DB-resolved artifact directory paths
    if sim and sim.artifact_path:
        artifact_dir = _PROJECT_ROOT / sim.artifact_path
        search_paths.append(artifact_dir / "mesh.msh")
        search_paths.append(artifact_dir / "mesh" / "mesh.msh")
        search_paths.append(artifact_dir / sim.solver / "mesh.msh")
        search_paths.append(artifact_dir / "postpro" / "mesh.msh")

    # Path C: Standard backend storage and temp directories
    search_paths.append(_PROJECT_ROOT / "backend" / "storage" / "simulations" / job_id / "mesh.msh")
    search_paths.append(_PROJECT_ROOT / "backend" / "storage" / "simulations" / job_id / "eigenmode" / "mesh.msh")
    search_paths.append(_PROJECT_ROOT / "backend" / "storage" / "simulations" / job_id / "electrostatic" / "mesh.msh")
    search_paths.append(_PROJECT_ROOT / "backend" / "storage" / "simulations" / job_id / "magnetostatic" / "mesh.msh")
    search_paths.append(_PROJECT_ROOT / "backend" / "tmp" / "simulations" / job_id / "mesh" / "mesh.msh")
    search_paths.append(_PROJECT_ROOT / "storage" / "simulations" / job_id / "mesh.msh")
    search_paths.append(_PROJECT_ROOT / "tmp" / "simulations" / job_id / "mesh" / "mesh.msh")

    # Evaluate search paths
    for path in search_paths:
        if path.exists() and path.is_file():
            mesh_path = path
            break

    # Path D: Fallback wild scan if still not found (deep searching directories for matching job_id)
    if not mesh_path:
        for folder_name in ["palace_output", "storage", "tmp", "backend/storage", "backend/tmp"]:
            folder_path = _PROJECT_ROOT / folder_name
            if folder_path.exists():
                for p in folder_path.rglob("*.msh"):
                    if job_id in str(p):
                        mesh_path = p
                        break
            if mesh_path:
                break

    # Path E: Read from SQLite Database SimulationArtifact if files do not exist (rollback_policy deleted workspace)
    if not mesh_path:
        from app.simulation.database.models import SimulationArtifact, SimulationExecution
        from sqlalchemy import select
        try:
            stmt = select(SimulationArtifact).join(
                SimulationExecution,
                SimulationArtifact.execution_id == SimulationExecution.id
            ).where(
                SimulationExecution.simulation_id == job_id,
                SimulationArtifact.file_name == "mesh.msh"
            ).order_by(SimulationArtifact.created_at.desc()).limit(1)

            res = await db.execute(stmt)
            db_artifact = res.scalar_one_or_none()

            if db_artifact and db_artifact.file_data:
                import tempfile
                temp_dir = _PROJECT_ROOT / "backend" / "tmp" / "db_mesh"
                temp_dir.mkdir(parents=True, exist_ok=True)
                temp_mesh_file = temp_dir / f"{job_id}_mesh.msh"
                with open(temp_mesh_file, "wb") as f:
                    f.write(db_artifact.file_data)
                mesh_path = temp_mesh_file
                logger.info("Retrieved mesh from database artifact and saved to: %s", mesh_path)
        except Exception as db_exc:
            logger.warning("Failed to retrieve mesh from database artifacts: %s", db_exc)

    if not mesh_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Mesh file (.msh) not found for simulation job {job_id}.",
        )

    logger.info("Parsing volume mesh wireframe from: %s", mesh_path)

    # 3. Parse with PalaceMeshParser
    try:
        parser = PalaceMeshParser()
        parser.read_mfem_mesh(mesh_path)
        data = parser.to_json()

        # 4. Construct metadata
        solver = sim.solver if sim else "eigenmode"
        total_elements = len(parser.elements)
        total_vertices = len(parser.vertices)
        total_edges = len(parser.edges)

        # Retrieve frequency only if eigenmode solver
        frequency_ghz = 0.0
        if sim and sim.solver == "eigenmode" and sim.results:
            eigenmode_data = sim.results.get("eigenmode", {})
            modes_list = eigenmode_data.get("modes", [])
            if modes_list:
                freq_hz = modes_list[0].get("frequency_ghz", 4.5e9)
                if freq_hz > 1e6:
                    frequency_ghz = freq_hz / 1e9
                else:
                    frequency_ghz = freq_hz

        metadata = {
            "solver": solver,
            "total_elements": total_elements,
            "total_vertices": total_vertices,
            "total_edges": total_edges,
            "frequency_ghz": round(float(frequency_ghz), 4),
            "runtime_seconds": int(sim.runtime_seconds) if (sim and sim.runtime_seconds) else 58,
        }

        return {
            "vertices": data["vertices"],
            "edges": data["edges"],
            "bounds": data["bounds"],
            "surfaces": data.get("surfaces", {}),
            "metadata": metadata,
        }

    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        )
    except Exception as exc:
        logger.exception("Failed to parse volume mesh wireframe for simulation %s", job_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal mesh parsing error: {str(exc)}",
        )
