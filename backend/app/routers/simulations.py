"""Simulation management router."""

from __future__ import annotations

from datetime import datetime
import json
import os
import logging

logger = logging.getLogger(__name__)
import shutil
import zipfile
import io
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.config import settings
from app.database import get_db
from app.models import Project, Simulation, SimulationStatus, User
from app.services.physics import full_physics_analysis
from app.services.palace import (
    GeometryBuilder,
    ConfigGenerator,
    PalaceRunner,
    ResultParser,
    EMAdapter,
    PalaceSolverType,
    PalaceSimulationOutput,
    GeometryElementKind,
)
import uuid

router = APIRouter(prefix="/api/simulations", tags=["simulations"])


class SimulationCreate(BaseModel):
    project_id: str
    solver: str = "eigenmode"
    config: dict = {}


class RunSimulationRequest(BaseModel):
    engine: str = "analytic"


def _sim_out(s: Simulation) -> dict:
    return {
        "id": s.id,
        "project_id": s.project_id,
        "solver": s.solver,
        "status": s.status.value,
        "config": s.config,
        "results": s.results,
        "error_message": s.error_message,
        "runtime_seconds": s.runtime_seconds,
        "memory_gb": s.memory_gb,
        "created_at": s.created_at.isoformat(),
        "started_at": s.started_at.isoformat() if s.started_at else None,
        "finished_at": s.finished_at.isoformat() if s.finished_at else None,
    }


@router.get("")
async def list_simulations(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[dict]:
    # Get all sims for user's projects
    proj_result = await db.execute(select(Project.id).where(Project.owner_id == user.id))
    project_ids = [r[0] for r in proj_result.all()]

    if not project_ids:
        return []

    result = await db.execute(
        select(Simulation)
        .where(Simulation.project_id.in_(project_ids))
        .order_by(Simulation.created_at.desc())
        .limit(50)
    )
    return [_sim_out(s) for s in result.scalars().all()]


@router.post("", status_code=201)
async def create_simulation(
    body: SimulationCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    # Verify project ownership
    proj_result = await db.execute(
        select(Project).where(Project.id == body.project_id, Project.owner_id == user.id)
    )
    project = proj_result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    sim = Simulation(
        id=str(uuid.uuid4()),
        project_id=body.project_id,
        solver=body.solver,
        config=body.config,
    )
    db.add(sim)
    await db.flush()
    await db.refresh(sim)
    return _sim_out(sim)
def _copy_tree_robust(src: Path | str, dst: Path | str):
    src = Path(src)
    dst = Path(dst)
    dst.mkdir(parents=True, exist_ok=True)
    logger.info(f"Starting robust copy from {src} to {dst}")
    
    # We use rglob("*") for recursive directory scanning
    for item in src.rglob("*"):
        rel_path = item.relative_to(src)
        target = dst / rel_path
        logger.info(f"DISCOVERED: {item} (rel: {rel_path})")
        if item.is_dir():
            target.mkdir(parents=True, exist_ok=True)
            logger.info(f"CREATED DIR: {target}")
        else:
            try:
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(item, target)
                logger.info(f"COPIED: {item} -> {target}")
            except Exception as e:
                logger.warning(f"SKIPPED/FAILED: {item} -> {target} (error: {e})")


@router.post("/{sim_id}/run")
async def run_simulation(
    sim_id: str,
    body: RunSimulationRequest = RunSimulationRequest(),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    """
    Run a simulation analytically (physics engine) or using AWS Palace.
    """
    # Verify ownership BEFORE mutating any state
    result = await db.execute(
        select(Simulation)
        .join(Project, Simulation.project_id == Project.id)
        .where(Simulation.id == sim_id, Project.owner_id == user.id)
    )
    sim = result.scalar_one_or_none()
    if not sim:
        raise HTTPException(status_code=404, detail="Simulation not found")

    # Fetch the project (already verified ownership above)
    proj_result = await db.execute(
        select(Project).where(Project.id == sim.project_id)
    )
    project = proj_result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Run physics analysis
    sim.status = SimulationStatus.running
    sim.started_at = datetime.utcnow()
    
    # Commit the transaction here! This is crucial because Palace execution
    # takes 2-5+ minutes. If we don't commit, the SQLite database remains
    # locked for the entire duration, blocking all frontend autosave requests.
    await db.commit()

    try:
        payload = project.design_payload or {}
        
        if body.engine == "palace":
            # Create simulation artifact directory early!
            project_root = Path(__file__).resolve().parents[3]
            artifact_dir = project_root / "backend" / "storage" / "simulations" / sim_id
            images_dir = artifact_dir / "images"
            images_dir.mkdir(parents=True, exist_ok=True)
            
            # 1. Build EMGeometry
            geometry = GeometryBuilder.build_geometry(payload)
            
            # Generate mesh file directly in the permanent artifact directory first!
            mesh_file_path = artifact_dir / "mesh.msh"
            from app.services.palace.gmsh_builder import GmshBuilder
            GmshBuilder.generate_mesh(geometry, mesh_file_path, coarse=settings.palace_mock_mode)
            
            # Render the mesh file immediately to images/mesh_0.png
            try:
                from app.services.vtu_renderer import render_mesh_file
                render_mesh_file(mesh_file_path, images_dir / "mesh_0.png")
            except Exception as e:
                logger.warning(f"Failed to pre-render mesh image: {e}")
                
            # Set artifact path early and commit so the render endpoint can access it!
            sim.artifact_path = str(artifact_dir.relative_to(project_root))
            sim.artifact_retained = True
            await db.commit()
            
            # Load mesh bytes for runner
            with open(mesh_file_path, "rb") as f:
                mesh_bytes = f.read()

            # 2. Generate configurations for both solvers (both are required for full physics analysis)
            config_eig = ConfigGenerator.generate_config(geometry, PalaceSolverType.EIGENMODE)
            config_cap = ConfigGenerator.generate_config(geometry, PalaceSolverType.ELECTROSTATIC)
            
            # 3. Execute both runs
            mock_mode = settings.palace_mock_mode
            runner = PalaceRunner(mock_mode=mock_mode)
            
            run_eig = await runner.run_simulation(config_eig, mesh_content=mesh_bytes)
            temp_dir_eig = run_eig["temp_dir_obj"]
            
            try:
                run_cap = await runner.run_simulation(config_cap, mesh_content=mesh_bytes)
                temp_dir_cap = run_cap["temp_dir_obj"]
                
                try:
                    # 4. Parse simulation results
                    port_names = [f"JJ_{q.id}" for q in geometry.qubits]
                    parsed_eig = ResultParser.parse_eigenmode(run_eig["output_dir"], port_names=port_names)
                    
                    terminal_names = []
                    for el in geometry.elements:
                        if el.kind in (GeometryElementKind.QUBIT, GeometryElementKind.RESONATOR):
                            prefix = "" if el.id.startswith("comp_") else "comp_"
                            terminal_names.append(f"{prefix}{el.id}_island" if el.kind == GeometryElementKind.QUBIT else f"{prefix}{el.id}")
                    parsed_cap = ResultParser.parse_electrostatic(run_cap["output_dir"], terminal_names=terminal_names)
                    
                    # Combine into PalaceSimulationOutput
                    palace_output = PalaceSimulationOutput(
                        simulation_id=sim_id,
                        design_id=geometry.design_id,
                        timestamp=datetime.utcnow().isoformat() + "Z",
                        solver_type=PalaceSolverType.EIGENMODE,
                        eigenmode=parsed_eig,
                        electrostatic=parsed_cap,
                        runtime_seconds=run_eig["runtime_seconds"] + run_cap["runtime_seconds"],
                        stdout=run_eig["stdout"] + "\n" + run_cap["stdout"],
                        stderr=run_eig["stderr"] + "\n" + run_cap["stderr"]
                    )
                    
                    # 5. Adapt to standard EMResults
                    em_results = EMAdapter.to_em_results(palace_output)
                    
                    # 6. Convert design payload to DesignSpec
                    design_spec = EMAdapter.build_design_spec_from_payload(payload)
                    
                    # 7. Feed into downstream PhysicsAnalysisPipeline
                    from physics_engine.pipeline import PhysicsAnalysisPipeline
                    pipeline = PhysicsAnalysisPipeline()
                    report = pipeline.run(em_results, design_spec, output_dir=str(run_eig["output_dir"]))
                    
                    sim.results = json.loads(report.model_dump_json())
                    sim.runtime_seconds = round(palace_output.runtime_seconds, 3)

                    # 8. Preserve artifacts if configured
                    if settings.keep_simulation_artifacts:
                        # Copy both eigenmode and electrostatic job folders using robust copy helper
                        _copy_tree_robust(run_eig["temp_dir_obj"].name, artifact_dir / "eigenmode")
                        _copy_tree_robust(run_cap["temp_dir_obj"].name, artifact_dir / "electrostatic")
                        
                        # Generate Field Visualizations from VTU files
                        try:
                            from app.services.vtu_renderer import generate_field_visualizations
                            image_urls = generate_field_visualizations(sim_id, str(artifact_dir))
                            results_dict = dict(sim.results or {})
                            results_dict["field_images"] = image_urls
                            sim.results = results_dict
                        except Exception as render_err:
                            logger.warning(f"Field visualization generation failed (non-fatal): {render_err}", exc_info=True)
                finally:
                    temp_dir_cap.cleanup()
            finally:
                temp_dir_eig.cleanup()

            sim.status = SimulationStatus.completed
            sim.finished_at = datetime.utcnow()
            sim.memory_gb = 0.5
        else:
            # Legacy analytic flow
            physics_results = full_physics_analysis(payload)
            sim.results = physics_results
            sim.status = SimulationStatus.completed
            sim.finished_at = datetime.utcnow()
            sim.runtime_seconds = round(
                (sim.finished_at - sim.started_at).total_seconds(), 3
            )
            sim.memory_gb = 0.1
            
    except Exception as e:
        sim.status = SimulationStatus.failed
        sim.error_message = str(e)
        sim.finished_at = datetime.utcnow()

    return _sim_out(sim)


@router.get("/{sim_id}")
async def get_simulation(
    sim_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    result = await db.execute(select(Simulation).where(Simulation.id == sim_id))
    sim = result.scalar_one_or_none()
    if not sim:
        raise HTTPException(status_code=404, detail="Simulation not found")
    return _sim_out(sim)


@router.get("/{sim_id}/artifacts")
async def get_simulation_artifacts(
    sim_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    result = await db.execute(select(Simulation).where(Simulation.id == sim_id))
    sim = result.scalar_one_or_none()
    if not sim or not getattr(sim, "artifact_retained", False) or not getattr(sim, "artifact_path", None):
        raise HTTPException(status_code=404, detail="Artifacts not found or not retained")
        
    project_root = Path(__file__).resolve().parents[3]
    artifact_dir = project_root / sim.artifact_path
    if not artifact_dir.exists():
        raise HTTPException(status_code=404, detail="Artifact directory missing on disk")
        
    files = []
    for root, _, filenames in os.walk(artifact_dir):
        for name in filenames:
            abs_path = Path(root) / name
            rel_path = abs_path.relative_to(artifact_dir)
            files.append(str(rel_path))
            
    return {"artifact_path": sim.artifact_path, "files": files}

@router.get("/{sim_id}/download")
async def download_simulation_artifacts(
    sim_id: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Simulation).where(Simulation.id == sim_id))
    sim = result.scalar_one_or_none()
    if not sim or not getattr(sim, "artifact_retained", False) or not getattr(sim, "artifact_path", None):
        raise HTTPException(status_code=404, detail="Artifacts not found or not retained")
        
    project_root = Path(__file__).resolve().parents[3]
    artifact_dir = project_root / sim.artifact_path
    if not artifact_dir.exists():
        raise HTTPException(status_code=404, detail="Artifact directory missing on disk")
        
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zipf:
        for root, _, filenames in os.walk(artifact_dir):
            for name in filenames:
                file_path = Path(root) / name
                archive_name = file_path.relative_to(artifact_dir)
                zipf.write(file_path, arcname=str(archive_name))
                
    zip_buffer.seek(0)
    return StreamingResponse(
        zip_buffer, 
        media_type="application/zip", 
        headers={"Content-Disposition": f"attachment; filename=simulation_{sim_id}_artifacts.zip"}
    )

@router.get("/{sim_id}/render")
async def render_simulation_snapshot(
    sim_id: str,
    db: AsyncSession = Depends(get_db),
):
    from fastapi.responses import FileResponse
    from app.services.palace.renderer import PyVistaRenderer
    
    result = await db.execute(select(Simulation).where(Simulation.id == sim_id))
    sim = result.scalar_one_or_none()
    if not sim or not getattr(sim, "artifact_retained", False) or not getattr(sim, "artifact_path", None):
        raise HTTPException(status_code=404, detail="Artifacts not found or not retained")
        
    project_root = Path(__file__).resolve().parents[3]
    artifact_dir = project_root / sim.artifact_path
    if not artifact_dir.exists():
        raise HTTPException(status_code=404, detail="Artifact directory missing on disk")
        
    render_path = artifact_dir / "render.png"
    
    # Check if we have pre-rendered images in the new layout first
    images_dir = artifact_dir / "images"
    if images_dir.exists():
        # Prefer field visualization images if they exist
        pre_rendered_fields = sorted(list(images_dir.glob("*_field_*.png")))
        if pre_rendered_fields:
            return FileResponse(pre_rendered_fields[0], media_type="image/png")
            
        pre_rendered = sorted(list(images_dir.glob("*.png")))
        if pre_rendered:
            return FileResponse(pre_rendered[0], media_type="image/png")

    if not render_path.exists():
        # Generate on the fly
        success = PyVistaRenderer.render_simulation(str(artifact_dir), str(render_path))
        if not success or not render_path.exists():
            raise HTTPException(status_code=500, detail="Failed to render 3D snapshot")
            
    return FileResponse(render_path, media_type="image/png")

