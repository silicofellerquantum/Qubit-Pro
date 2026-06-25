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
import logging

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.config import settings
from app.database import get_db, AsyncSessionLocal
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
from app.drc.runner import run_drc_from_payload
import uuid

logger = logging.getLogger(__name__)

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


async def _run_simulation_background_task(
    sim_id: str,
    project_id: str,
    payload: dict,
    engine: str,
) -> None:
    """
    Non-blocking background worker to execute Palace simulation jobs.
    Uses its own database session context to prevent closed-session/transaction errors.
    """
    logger.info(f"Starting background simulation {sim_id} for project {project_id}...")
    
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Simulation).where(Simulation.id == sim_id))
        sim = result.scalar_one_or_none()
        if not sim:
            logger.error(f"Simulation {sim_id} not found in background task.")
            return

        try:
            if engine == "palace":
                project_root = Path(__file__).resolve().parents[3]
                artifact_dir = project_root / "backend" / "storage" / "simulations" / sim_id
                images_dir = artifact_dir / "images"
                images_dir.mkdir(parents=True, exist_ok=True)

                # 1. Build EMGeometry
                geometry = GeometryBuilder.build_geometry(payload)
                
                # Check if there are any qubits or resonators in the design
                has_terminals = any(el.kind in (GeometryElementKind.QUBIT, GeometryElementKind.RESONATOR) for el in geometry.elements)
                if not has_terminals:
                    raise ValueError(
                        "Cannot run simulation on an empty design. Please add qubits or resonators to your design first."
                    )

                # Generate mesh file directly in the permanent artifact directory
                mesh_file_path = artifact_dir / "mesh.msh"
                from app.services.palace.gmsh_builder import GmshBuilder
                GmshBuilder.generate_mesh(geometry, mesh_file_path, coarse=settings.palace_mock_mode)
                
                # Render the mesh file immediately
                try:
                    from app.services.vtu_renderer import render_mesh_file
                    render_mesh_file(mesh_file_path, images_dir / "mesh_0.png")
                except Exception as e:
                    logger.warning(f"Failed to pre-render mesh image: {e}")
                    
                # Load mesh bytes for runner
                with open(mesh_file_path, "rb") as f:
                    mesh_bytes = f.read()

                # 2. Generate configurations for all three solvers (Eigenmode, Electrostatic, Magnetostatic)
                config_eig = ConfigGenerator.generate_config(geometry, PalaceSolverType.EIGENMODE)
                config_cap = ConfigGenerator.generate_config(geometry, PalaceSolverType.ELECTROSTATIC)
                config_mag = ConfigGenerator.generate_config(geometry, PalaceSolverType.MAGNETOSTATIC)

                # 3. Execute runs concurrently, wrapped in safe try-except handlers for Partial Success
                mock_mode = settings.palace_mock_mode
                runner = PalaceRunner(mock_mode=mock_mode)

                import asyncio

                async def run_safe(solver_type: str, config: dict) -> dict:
                    try:
                        logger.info(f"Launching {solver_type} solver in background...")
                        res = await runner.run_simulation(config, mesh_content=mesh_bytes)
                        return {"status": "success", "data": res}
                    except Exception as err:
                        logger.error(f"Solver {solver_type} failed: {err}")
                        return {"status": "error", "error": str(err)}

                run_eig_task = asyncio.create_task(run_safe("eigenmode", config_eig))
                run_cap_task = asyncio.create_task(run_safe("electrostatic", config_cap))
                run_mag_task = asyncio.create_task(run_safe("magnetostatic", config_mag))

                # Await all runs simultaneously
                res_eig, res_cap, res_mag = await asyncio.gather(run_eig_task, run_cap_task, run_mag_task)

                temp_dirs = []
                errors = {}
                success_count = 0

                # Process Eigenmode
                parsed_eig = None
                run_eig_time = 0.0
                run_eig_stdout = ""
                run_eig_stderr = ""
                if res_eig["status"] == "success":
                    success_count += 1
                    run_eig = res_eig["data"]
                    temp_dirs.append(run_eig["temp_dir_obj"])
                    run_eig_time = run_eig.get("runtime_seconds", 0.0)
                    run_eig_stdout = run_eig.get("stdout", "")
                    run_eig_stderr = run_eig.get("stderr", "")
                    try:
                        if settings.keep_simulation_artifacts:
                            _copy_tree_robust(run_eig["temp_dir_obj"].name, artifact_dir / "eigenmode")
                        
                        port_names = [f"JJ_{q.id}" for q in geometry.qubits]
                        parsed_eig = ResultParser.parse_eigenmode(
                            artifact_dir / "eigenmode" / "out" if settings.keep_simulation_artifacts else run_eig["output_dir"],
                            port_names=port_names
                        )
                    except Exception as parse_err:
                        logger.warning(f"Failed to parse/copy eigenmode results: {parse_err}")
                        errors["eigenmode_parse"] = str(parse_err)
                else:
                    errors["eigenmode"] = res_eig["error"]

                # Process Electrostatic
                parsed_cap = None
                run_cap_time = 0.0
                run_cap_stdout = ""
                run_cap_stderr = ""
                if res_cap["status"] == "success":
                    success_count += 1
                    run_cap = res_cap["data"]
                    temp_dirs.append(run_cap["temp_dir_obj"])
                    run_cap_time = run_cap.get("runtime_seconds", 0.0)
                    run_cap_stdout = run_cap.get("stdout", "")
                    run_cap_stderr = run_cap.get("stderr", "")
                    try:
                        if settings.keep_simulation_artifacts:
                            _copy_tree_robust(run_cap["temp_dir_obj"].name, artifact_dir / "electrostatic")
                        
                        terminal_names = []
                        for el in geometry.elements:
                            if el.kind in (GeometryElementKind.QUBIT, GeometryElementKind.RESONATOR):
                                prefix = "" if el.id.startswith("comp_") else "comp_"
                                terminal_names.append(f"{prefix}{el.id}_island" if el.kind == GeometryElementKind.QUBIT else f"{prefix}{el.id}")
                        parsed_cap = ResultParser.parse_electrostatic(
                            artifact_dir / "electrostatic" / "out" if settings.keep_simulation_artifacts else run_cap["output_dir"],
                            terminal_names=terminal_names
                        )
                    except Exception as parse_err:
                        logger.warning(f"Failed to parse/copy electrostatic results: {parse_err}")
                        errors["electrostatic_parse"] = str(parse_err)
                else:
                    errors["electrostatic"] = res_cap["error"]

                # Process Magnetostatic
                parsed_mag = None
                run_mag_time = 0.0
                run_mag_stdout = ""
                run_mag_stderr = ""
                if res_mag["status"] == "success":
                    success_count += 1
                    run_mag = res_mag["data"]
                    temp_dirs.append(run_mag["temp_dir_obj"])
                    run_mag_time = run_mag.get("runtime_seconds", 0.0)
                    run_mag_stdout = run_mag.get("stdout", "")
                    run_mag_stderr = run_mag.get("stderr", "")
                    try:
                        if settings.keep_simulation_artifacts:
                            _copy_tree_robust(run_mag["temp_dir_obj"].name, artifact_dir / "magnetostatic")
                        
                        terminal_names = []
                        for el in geometry.elements:
                            if el.kind in (GeometryElementKind.QUBIT, GeometryElementKind.RESONATOR):
                                prefix = "" if el.id.startswith("comp_") else "comp_"
                                terminal_names.append(f"{prefix}{el.id}_island" if el.kind == GeometryElementKind.QUBIT else f"{prefix}{el.id}")
                        parsed_mag = ResultParser.parse_magnetostatic(
                            artifact_dir / "magnetostatic" / "out" if settings.keep_simulation_artifacts else run_mag["output_dir"],
                            terminal_names=terminal_names
                        )
                    except Exception as parse_err:
                        logger.warning(f"Failed to parse/copy magnetostatic results: {parse_err}")
                        errors["magnetostatic_parse"] = str(parse_err)
                else:
                    errors["magnetostatic"] = res_mag["error"]

                # Cleanup temp workspace directories
                for temp_dir in temp_dirs:
                    try:
                        temp_dir.cleanup()
                    except Exception as clean_err:
                        logger.warning(f"Failed to cleanup temp workspace directory (non-fatal): {clean_err}")

                # If at least one solver succeeded, capture results (Partial Success)
                if success_count > 0:
                    image_urls = []
                    if settings.keep_simulation_artifacts:
                        try:
                            from app.services.vtu_renderer import generate_field_visualizations
                            image_urls = generate_field_visualizations(sim_id, str(artifact_dir), geometry=geometry)
                            logger.info(f"Generated {len(image_urls)} field visualization(s): {image_urls}")
                        except Exception as render_err:
                            logger.warning(f"Field visualization generation failed (non-fatal): {render_err}", exc_info=True)

                    # Combine into PalaceSimulationOutput
                    palace_output = PalaceSimulationOutput(
                        simulation_id=sim_id,
                        design_id=geometry.design_id,
                        timestamp=datetime.utcnow().isoformat() + "Z",
                        solver_type=PalaceSolverType.EIGENMODE,
                        eigenmode=parsed_eig,
                        electrostatic=parsed_cap,
                        magnetostatic=parsed_mag,
                        runtime_seconds=run_eig_time + run_cap_time + run_mag_time,
                        stdout=run_eig_stdout + "\n" + run_cap_stdout + "\n" + run_mag_stdout,
                        stderr=run_eig_stderr + "\n" + run_cap_stderr + "\n" + run_mag_stderr
                    )

                    # Translate to standard EMResults
                    em_results = EMAdapter.to_em_results(palace_output)

                    # Build DesignSpec
                    design_spec = EMAdapter.build_design_spec_from_payload(payload)

                    # Find a successful output directory to feed the physics pipeline
                    output_dir_for_pipeline = None
                    if res_eig["status"] == "success":
                        output_dir_for_pipeline = str(artifact_dir / "eigenmode" / "out" if settings.keep_simulation_artifacts else res_eig["data"]["output_dir"])
                    elif res_cap["status"] == "success":
                        output_dir_for_pipeline = str(artifact_dir / "electrostatic" / "out" if settings.keep_simulation_artifacts else res_cap["data"]["output_dir"])
                    else:
                        output_dir_for_pipeline = str(artifact_dir / "magnetostatic" / "out" if settings.keep_simulation_artifacts else res_mag["data"]["output_dir"])

                    # Run downstream Physics Analysis
                    from physics_engine.pipeline import PhysicsAnalysisPipeline
                    pipeline = PhysicsAnalysisPipeline()
                    report = pipeline.run(em_results, design_spec, output_dir=output_dir_for_pipeline)

                    results_dict = json.loads(report.model_dump_json())
                    if settings.keep_simulation_artifacts and image_urls:
                        results_dict["field_images"] = image_urls

                    if errors:
                        results_dict["solver_errors"] = errors

                    sim.results = results_dict
                    sim.runtime_seconds = round(palace_output.runtime_seconds, 3)
                    sim.status = SimulationStatus.completed
                    if errors:
                        sim.error_message = f"Partial success with errors: {errors}"
                else:
                    raise RuntimeError(f"All concurrent solvers failed. Details: {errors}")

            else:
                # Legacy analytic flow
                physics_results = full_physics_analysis(payload)
                sim.results = physics_results
                sim.status = SimulationStatus.completed
                sim.runtime_seconds = 0.1

            sim.finished_at = datetime.utcnow()
            sim.memory_gb = 0.5 if engine == "palace" else 0.1
            db.add(sim)
            await db.commit()
            logger.info(f"Background simulation {sim_id} completed successfully.")

        except Exception as e:
            logger.exception(f"Background simulation {sim_id} failed")
            sim.status = SimulationStatus.failed
            sim.error_message = str(e)
            sim.finished_at = datetime.utcnow()
            db.add(sim)
            await db.commit()


@router.post("/{sim_id}/run")
async def run_simulation(
    sim_id: str,
    body: RunSimulationRequest = RunSimulationRequest(),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    background_tasks: BackgroundTasks = BackgroundTasks(),
) -> dict:
    """
    Verify design, pre-validate via DRC, and launch simulation job in a non-blocking background task.
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

    payload = project.design_payload or {}

    # --- Phase 2: Pre-Solve Geometry Validation ---
    if body.engine == "palace":
        # Check ALL possible sources of qubit/resonator data in the payload.
        # The design can store components in several places depending on how it was created.
        placement = payload.get("placement", {})
        design = payload.get("design", {})
        freq_plan = payload.get("frequency_plan", {})
        v2_graph = payload.get("v2", {}).get("graph")

        has_components = bool(
            placement.get("qubits")                          # Legacy placement qubits
            or placement.get("resonators")                   # Legacy placement resonators
            or design.get("placements")                      # V2 design placements
            or freq_plan.get("qubit_frequencies_GHz")        # Frequency plan (always present for generated designs)
            or v2_graph                                      # V2 graph object
        )
        if not has_components:
            raise HTTPException(
                status_code=400,
                detail="Cannot run simulation on an empty design. Please add qubits or resonators to your design first."
            )

        # --- Phase 2b: DRC Pre-validation ---
        drc_report = run_drc_from_payload(payload)
        errors = [v for v in drc_report.violations if v.severity == "ERROR"]
        if errors:
            err_messages = []
            for err in errors:
                err_messages.append(f"[{err.domain.upper()}] {err.message}")
            detail_msg = f"Design Rule Check (DRC) failed with errors:\n" + "\n".join(err_messages)
            raise HTTPException(
                status_code=400,
                detail=detail_msg
            )

    # Transition status to running immediately, register started_at, and commit
    sim.status = SimulationStatus.running
    sim.started_at = datetime.utcnow()
    
    if body.engine == "palace":
        project_root = Path(__file__).resolve().parents[3]
        artifact_dir = project_root / "backend" / "storage" / "simulations" / sim_id
        sim.artifact_path = str(artifact_dir.relative_to(project_root))
        sim.artifact_retained = True
    else:
        sim.artifact_path = None
        sim.artifact_retained = False
        
    await db.commit()
    await db.refresh(sim)

    # Queue the heavy FEM solver execution into a non-blocking background task
    background_tasks.add_task(
        _run_simulation_background_task,
        sim_id=sim_id,
        project_id=sim.project_id,
        payload=payload,
        engine=body.engine,
    )

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
    variant: str = "e",
    mode: int | None = None,
    db: AsyncSession = Depends(get_db),
):
    from fastapi.responses import FileResponse
    
    result = await db.execute(select(Simulation).where(Simulation.id == sim_id))
    sim = result.scalar_one_or_none()
    if not sim or not getattr(sim, "artifact_retained", False) or not getattr(sim, "artifact_path", None):
        raise HTTPException(status_code=404, detail="No field renders — Palace Paraview output not yet available")
        
    project_root = Path(__file__).resolve().parents[3]
    artifact_dir = project_root / sim.artifact_path
    if not artifact_dir.exists():
        raise HTTPException(status_code=404, detail="Artifact directory missing on disk")
    
    images_dir = artifact_dir / "images"
    if images_dir.exists():
        mode_suffix = f"_{mode}" if mode is not None else ""
        
        # 1. Prioritize the flat 2D chip design overlay (*_chip_e_{mode}.png)
        target_chip = list(images_dir.glob(f"*_chip_{variant.lower()}{mode_suffix}.png"))
        if target_chip:
            return FileResponse(target_chip[0], media_type="image/png")
            
        # Fallback to Mode 1 (unsuffixed) if the specific mode is missing
        if mode is not None:
            target_chip_fallback = list(images_dir.glob(f"*_chip_{variant.lower()}.png"))
            if target_chip_fallback:
                return FileResponse(target_chip_fallback[0], media_type="image/png")

        # 2. Fall back to the 3D volumetric field renders (*_field_e_{mode}.png)
        target_field = list(images_dir.glob(f"*_field_{variant.lower()}{mode_suffix}.png"))
        if target_field:
            return FileResponse(target_field[0], media_type="image/png")
            
        # Fallback to Mode 1 (unsuffixed) 3D field if specific mode is missing
        if mode is not None:
            target_field_fallback = list(images_dir.glob(f"*_field_{variant.lower()}.png"))
            if target_field_fallback:
                return FileResponse(target_field_fallback[0], media_type="image/png")

        # 3. Fall back to any chip overlay image
        pre_rendered_chips = sorted(list(images_dir.glob("*_chip_*.png")))
        if pre_rendered_chips:
            return FileResponse(pre_rendered_chips[0], media_type="image/png")
            
        # 4. Fall back to any field visualization image
        pre_rendered_fields = sorted(list(images_dir.glob("*_field_*.png")))
        if pre_rendered_fields:
            return FileResponse(pre_rendered_fields[0], media_type="image/png")

    # No VTU-derived field renders found — return 404 so frontend shows the waiting state
    raise HTTPException(status_code=404, detail="No Palace field renders available yet. Run a simulation with Paraview output enabled.")


@router.get("/{sim_id}/mesh")
async def get_simulation_mesh(
    sim_id: str,
    db: AsyncSession = Depends(get_db),
):
    from fastapi.responses import FileResponse
    result = await db.execute(select(Simulation).where(Simulation.id == sim_id))
    sim = result.scalar_one_or_none()
    if not sim or not getattr(sim, "artifact_retained", False) or not getattr(sim, "artifact_path", None):
        raise HTTPException(status_code=404, detail="Artifacts not found or not retained")
        
    project_root = Path(__file__).resolve().parents[3]
    artifact_dir = project_root / sim.artifact_path
    if not artifact_dir.exists():
        raise HTTPException(status_code=404, detail="Artifact directory missing on disk")
        
    # Check for pre-rendered mesh images
    images_dir = artifact_dir / "images"
    mesh_paths = [
        images_dir / "eigenmode_mesh.png",
        images_dir / "mesh_0.png",
        images_dir / "electrostatic_mesh.png",
    ]
    for p in mesh_paths:
        if p.exists():
            return FileResponse(p, media_type="image/png")
            
    # Try generic png file as fallback
    if images_dir.exists():
        all_pngs = sorted(list(images_dir.glob("*.png")))
        if all_pngs:
            return FileResponse(all_pngs[0], media_type="image/png")
            
    # If no png exists, try generating the mesh image from mesh.msh on the fly
    mesh_file_path = artifact_dir / "mesh.msh"
    if mesh_file_path.exists():
        try:
            images_dir.mkdir(parents=True, exist_ok=True)
            mesh_img = images_dir / "mesh_0.png"
            from app.services.vtu_renderer import render_mesh_file
            if render_mesh_file(mesh_file_path, mesh_img):
                return FileResponse(mesh_img, media_type="image/png")
        except Exception as e:
            logger.warning(f"Failed to render mesh on the fly: {e}")
            
    raise HTTPException(status_code=404, detail="Mesh image not found")


