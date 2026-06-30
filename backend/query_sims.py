import asyncio
from app.database import AsyncSessionLocal
from app.models import Simulation
from sqlalchemy import select

async def main():
    async with AsyncSessionLocal() as db:
        stmt = select(Simulation).order_by(Simulation.created_at.desc()).limit(10)
        res = await db.execute(stmt)
        sims = res.scalars().all()
        for s in sims:
            print(f"ID: {s.id} | Status: {s.status} | Created: {s.created_at}")

if __name__ == "__main__":
    asyncio.run(main())
