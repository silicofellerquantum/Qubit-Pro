import asyncio
from sqlalchemy import select
from app.database import get_db
from app.models import Simulation

async def main():
    async for db in get_db():
        stmt = select(Simulation).order_by(Simulation.created_at.desc())
        res = await db.execute(stmt)
        sims = res.scalars().all()
        print(f"Total simulations in DB: {len(sims)}")
        for s in sims:
            print(f"ID: {s.id} | Status: {s.status} | Created: {s.created_at}")

if __name__ == "__main__":
    asyncio.run(main())
