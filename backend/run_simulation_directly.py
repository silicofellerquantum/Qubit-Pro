import asyncio
import sys
import logging
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models import Simulation, Project, SimulationParameter, User
from app.simulation.service.simulation_service import SimulationService, SimulationRequest
from app.simulation.service.execution_context import RollbackPolicy

# Configure logging to show all INFO/DEBUG messages from the simulation engine
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout
)

async def main():
    async with AsyncSessionLocal() as db:
        # 1. Fetch the latest simulations
        stmt = select(Simulation).order_by(Simulation.created_at.desc())
        result = await db.execute(stmt)
        sims = result.scalars().all()
        
        sim = None
        project = None
        for s in sims:
            p = await db.get(Project, s.project_id)
            if p:
                sim = s
                project = p
                break

        if not sim or not project:
            print("No simulations with a valid associated project found in the database.")
            return

        print(f"=== Found latest valid simulation ===")
        print(f"ID: {sim.id}")
        print(f"Project ID: {sim.project_id}")
        print(f"Solver: {sim.solver}")
        print(f"Status: {sim.status}")
        print(f"Created At: {sim.created_at}")
        print("================================")

        # 3. Fetch simulation parameters
        stmt_params = select(SimulationParameter).where(SimulationParameter.simulation_id == sim.id)
        res_params = await db.execute(stmt_params)
        params = res_params.scalars().all()

        design_payload = project.design_payload or {}
        user_settings = sim.config or {}
        terminal_names = None
        qubits = None
        port_names = None

        for p in params:
            if p.parameter_key == "design_payload":
                design_payload = p.parameter_value
            elif p.parameter_key == "user_settings":
                user_settings = p.parameter_value
            elif p.parameter_key == "terminal_names":
                terminal_names = p.parameter_value.get("names")
            elif p.parameter_key == "qubits":
                qubits = p.parameter_value.get("qubits")
            elif p.parameter_key == "port_names":
                port_names = p.parameter_value.get("ports")

        # 4. Fetch a user to associate with the run
        stmt_user = select(User).limit(1)
        res_user = await db.execute(stmt_user)
        user = res_user.scalar_one_or_none()
        user_id = user.id if user else "dummy-user-id"

        # 5. Build the SimulationRequest
        # We use DELETE_ON_SUCCESS rollback policy so the workspace is kept if it fails,
        # but we also set coarse_mesh=True for speed.
        request = SimulationRequest(
            simulation_id=sim.id,
            design_payload=design_payload,
            solver_type=sim.solver,
            user_settings=user_settings,
            terminal_names=terminal_names,
            qubits=qubits,
            port_names=port_names,
            coarse_mesh=True,
            rollback_policy=RollbackPolicy.DELETE_ON_SUCCESS
        )

        print("\nStarting execution via SimulationService...")
        service = SimulationService()
        
        # Define progress callback to show step changes in terminal
        def on_progress(state):
            print(f"[PROGRESS UPDATE] Phase: {state.get('phase')}, Status: {state.get('status')}")

        try:
            response = await service.execute_simulation(
                request=request,
                session=db,
                project_id=sim.project_id,
                user_id=user_id,
                on_progress=on_progress
            )
            print("\n=== SIMULATION COMPLETED SUCCESSFULLY ===")
            print(f"Total Runtime: {response.summary.total_runtime_seconds} seconds")
            print("Phase Timings:", response.summary.phase_timings)
            print("Results:", response.results)
        except Exception as e:
            print(f"\n=== SIMULATION RUN FAILED ===")
            print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(main())
