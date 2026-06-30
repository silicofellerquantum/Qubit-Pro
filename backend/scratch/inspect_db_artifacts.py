import asyncio
from sqlalchemy import select
from app.database import get_db
from app.models import Simulation, SimulationExecution, SimulationArtifact
from pathlib import Path

async def main():
    sim_id = "2ec36422-6cee-4f58-9d10-aafd48c36fa4"
    
    async for db in get_db():
        # 1. Check Simulation
        sim_stmt = select(Simulation).where(Simulation.id == sim_id)
        sim_res = await db.execute(sim_stmt)
        sim = sim_res.scalar_one_or_none()
        if not sim:
            print("Simulation not found in DB!")
            return
        print(f"Simulation ID: {sim.id}")
        
        # 2. Check SimulationExecution
        exec_stmt = select(SimulationExecution).where(SimulationExecution.simulation_id == sim_id)
        exec_res = await db.execute(exec_stmt)
        executions = exec_res.scalars().all()
        print(f"\nFound {len(executions)} SimulationExecution rows:")
        for ex in executions:
            print(f"  Execution ID: {ex.id}")
            
            # 3. Check SimulationArtifact for this execution
            art_stmt = select(SimulationArtifact).where(SimulationArtifact.execution_id == ex.id)
            art_res = await db.execute(art_stmt)
            artifacts = art_res.scalars().all()
            print(f"  Found {len(artifacts)} SimulationArtifact rows:")
            for art in artifacts:
                print(f"    Artifact ID: {art.id}")
                print(f"    File Name: {art.file_name}")
                print(f"    Path: {art.path}")
                filepath = Path(art.path)
                print(f"    File exists on disk: {filepath.exists()}")

if __name__ == "__main__":
    asyncio.run(main())
