import asyncio
from sqlalchemy import select
from app.database import get_db
from app.models import Simulation
import json

async def main():
    async for db in get_db():
        for sim_id in ["2ec36422-6cee-4f58-9d10-aafd48c36fa4"]:
            stmt = select(Simulation).where(Simulation.id == sim_id)
            res = await db.execute(stmt)
            sim = res.scalar_one_or_none()
            if not sim:
                print(f"Simulation {sim_id} not found!")
                continue
            
            print(f"\n--- Results for Simulation {sim_id} ---")
            print(json.dumps(sim.results, indent=2))

if __name__ == "__main__":
    asyncio.run(main())
