"""FastAPI router for 3D mesh and electromagnetic field visualizations."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.auth import get_current_user
from app.database import get_db
from app.models import User, Project, Simulation
from app.services.visualization import extract_3d_visualization
from app.services.palace_mesh_parser import parse_palace_mesh

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/simulations",
    tags=["visualization-3d"],
)

# Project root — used to resolve artifact_path stored in DB as relative path
_PROJECT_ROOT = Path(__file__).resolve().parents[2]

async def _authorize_simulation(db: AsyncSession, simulation_id: str, user_id: str) -> Simulation:
    """Helper verifying that the simulation exists and belongs to a project owned by the user."""
    stmt = (
        select(Simulation)
        .join(Project, Simulation.project_id == Project.id)
        .where(Simulation.id == simulation_id, Project.owner_id == user_id)
    )
    result = await db.execute(stmt)
    sim = result.scalar_one_or_none()
    if not sim:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Simulation not found or access unauthorized."
        )
    return sim

@router.get("/{sim_id}/visualization", response_model=Dict[str, Any])
async def get_3d_visualization(
    sim_id: str,
    mode: int = Query(1, ge=1, description="Eigenmode index (1-based) to visualize"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Extracts and returns the 3D surface mesh vertices, faces, normals, and E-field magnitude.

    This data is formatted specifically for direct rendering in a Three.js scene.
    """
    # 1. Authorize access to the simulation
    sim = await _authorize_simulation(db, sim_id, user.id)

    # 2. Verify that artifacts are retained and exist
    if not sim.artifact_retained or not sim.artifact_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No artifacts available for this simulation. Ensure artifact_retained=True.",
        )

    artifact_dir = _PROJECT_ROOT / sim.artifact_path
    if not artifact_dir.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Artifact directory does not exist on disk: {sim.artifact_path}",
        )

    # 3. Extract the 3D mesh and E-field data
    try:
        data = extract_3d_visualization(
            artifact_dir=artifact_dir,
            sim_solver=sim.solver,
            sim_results=sim.results,
            mode=mode,
        )
        
        # Override metadata runtime from the actual DB record if available
        if sim.runtime_seconds:
            data["metadata"]["runtime_seconds"] = int(sim.runtime_seconds)
            
        return data
        
    except FileNotFoundError as exc:
        logger.exception("Visualization VTU files not found for simulation %s", sim_id)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        )
    except Exception as exc:
        logger.exception("Failed to extract 3D visualization for simulation %s", sim_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal visualization extraction error: {str(exc)}",
        )


@router.get("/{sim_id}/mesh", response_model=Dict[str, Any])
async def get_3d_mesh(
    sim_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Extracts and returns the 3D volume tetrahedral mesh for rendering.

    This data is formatted specifically for line wireframe rendering in a Three.js scene.
    """
    sim = await _authorize_simulation(db, sim_id, user.id)

    if not sim.artifact_retained or not sim.artifact_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No artifacts available for this simulation. Ensure artifact_retained=True.",
        )

    artifact_dir = _PROJECT_ROOT / sim.artifact_path
    if not artifact_dir.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Artifact directory does not exist on disk: {sim.artifact_path}",
        )

    try:
        data = parse_palace_mesh(
            artifact_dir=artifact_dir,
            sim_solver=sim.solver,
            sim_results=sim.results,
        )
        if sim.runtime_seconds:
            data["metadata"]["runtime_seconds"] = int(sim.runtime_seconds)
        return data
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except Exception as exc:
        logger.exception("Failed to parse volume mesh")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal mesh parsing error: {str(exc)}",
        )

