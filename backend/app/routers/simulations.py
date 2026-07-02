"""Simulation management router."""

from __future__ import annotations

from datetime import datetime
from typing import Any
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import Project, Simulation, SimulationStatus, User
from app.services.physics import full_physics_analysis
import uuid

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/simulations", tags=["simulations"])


class SimulationCreate(BaseModel):
    project_id: str
    solver: str = "eigenmode"
    config: dict = {}


class SimulationRunParams(BaseModel):
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


@router.post("/{sim_id}/run")
async def run_simulation(
    sim_id: str,
    params: SimulationRunParams = SimulationRunParams(),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    """
    Run a simulation analytically or using AWS Palace.
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
    await db.flush()

    try:
        payload = project.design_payload or {}

        if params.engine == "palace":
            # Run AWS Palace pipeline
            from app.services.palace import (
                build_geometry,
                PalaceConfigGenerator,
                PalaceRunner,
                PalaceResultParser,
                build_em_results,
                build_design_spec,
                SolverType,
            )

            # Map simulator/solver string to Palace SolverType
            solver_map = {
                "eigenmode": SolverType.EIGENMODE,
                "electrostatic": SolverType.ELECTROSTATIC,
                "driven": SolverType.DRIVEN,
            }
            solver_type = solver_map.get(sim.solver.lower(), SolverType.EIGENMODE)

            # 1. Geometry Builder
            geometry = build_geometry(payload)

            # 2. Config Generator
            config_gen = PalaceConfigGenerator(geometry)
            palace_config = config_gen.generate(solver_type=solver_type, config_override=sim.config)

            # 3. Palace Runner (Docker container + mock fallback)
            runner = PalaceRunner()
            result_dir = runner.run(geometry, palace_config, solver_type=solver_type)

            # 4. Result Parser
            parser = PalaceResultParser()
            postpro_dir = result_dir / "postpro"

            eigenmodes = []
            capacitance = None

            if solver_type == SolverType.EIGENMODE:
                eig_csv = postpro_dir / "eig.csv"
                epr_csv = postpro_dir / "port-EPR.csv"
                eigenmodes = parser.parse_eigenmodes(
                    eig_csv=eig_csv,
                    epr_csv=epr_csv if epr_csv.exists() else None,
                )
            elif solver_type == SolverType.ELECTROSTATIC:
                cap_csv = postpro_dir / "terminal-C.csv"
                if not cap_csv.exists():
                    cap_csv = postpro_dir / "capacitance.csv"
                capacitance = parser.parse_capacitance(cap_csv)

            from app.services.palace.result_parser import PalaceSimulationOutputs
            parsed_outputs = PalaceSimulationOutputs(
                eigenmodes=eigenmodes,
                capacitance=capacitance,
                inductances=[],
            )

            # 5. EM Adapter
            em_results = build_em_results(
                simulation_id=sim.id,
                design_id=project.id,
                parsed=parsed_outputs,
            )

            design_spec = build_design_spec(
                design_id=project.id,
                project_name=project.name,
                payload_or_graph=payload,
            )

            # 6. Run post-simulation physics analysis pipeline
            from physics_engine.pipeline import PhysicsAnalysisPipeline
            pipeline = PhysicsAnalysisPipeline()
            report = pipeline.run(
                em_results=em_results,
                design_spec=design_spec,
                output_dir=str(result_dir / "plots"),
            )

            sim.results = report.dict()
            sim.memory_gb = 0.5
        else:
            # Run traditional analytic approximations
            physics_results = full_physics_analysis(payload)
            sim.results = physics_results
            sim.memory_gb = 0.1

        sim.status = SimulationStatus.completed
        sim.finished_at = datetime.utcnow()
        sim.runtime_seconds = round(
            (sim.finished_at - sim.started_at).total_seconds(), 3
        )
    except Exception as e:
        logger.exception("Simulation run failed")
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


@router.get("/{sim_id}/results/full")
async def get_simulation_full_results(
    sim_id: str,
    result_path: str = "",   # optional override: direct path to run folder
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    """
    Fetch full parsed Palace outputs for sim_id.

    Query param `result_path` is a temporary workaround until Simulation model
    has a `result_dir` column populated by PalaceRunner.

    Example:
      GET /api/simulations/abc123/results/full?result_path=backend/test_data/simulation_results/sim_abc7d49230ed4258_eigenmode

    Returns PalaceSimulationOutputs.dict().
    """
    # Verify ownership
    result = await db.execute(
        select(Simulation)
        .join(Project, Simulation.project_id == Project.id)
        .where(Simulation.id == sim_id, Project.owner_id == user.id)
    )
    sim = result.scalar_one_or_none()
    if not sim:
        raise HTTPException(status_code=404, detail="Simulation not found")

    # Resolve result_dir
    if result_path:
        run_dir = Path(result_path)
    else:
        # Default heuristic: backend/test_data/simulation_results/sim_{sim_id}_{solver}
        run_dir = Path("backend/test_data/simulation_results") / f"sim_{sim_id}_{sim.solver}"

    if not run_dir.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Palace result directory not found: {run_dir}. "
                   "Provide ?result_path=<path> or ensure Simulation.result_dir is set."
        )

    # Parse
    try:
        from app.services.palace.result_parser import PalaceResultParser
        parser = PalaceResultParser()
        outputs = parser.parse_run(run_dir)
        return outputs.dict()
    except Exception as e:
        logger.exception("Failed to parse Palace results from %s", run_dir)
        raise HTTPException(status_code=500, detail=f"Parse error: {e}") from e
