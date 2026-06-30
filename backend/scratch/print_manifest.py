import asyncio
from pathlib import Path
from sqlalchemy import select
from app.database import get_db
from app.models import Simulation
from app.simulation.visualization import VisualizationService
import json

async def main():
    sim_id = "2ec36422-6cee-4f58-9d10-aafd48c36fa4"
    
    async for db in get_db():
        stmt = select(Simulation).where(Simulation.id == sim_id)
        res = await db.execute(stmt)
        sim = res.scalar_one_or_none()
        if not sim:
            print("Simulation not found!")
            return
            
        project_root = Path(__file__).resolve().parents[2]
        artifact_dir = project_root / sim.artifact_path
        
        svc = VisualizationService(artifact_dir=artifact_dir, sim_id=sim_id)
        manifest = svc.get_manifest()
        
        print("\n--- Visualization Manifest ---")
        print(json.dumps(manifest.model_dump(), indent=2))

if __name__ == "__main__":
    asyncio.run(main())
