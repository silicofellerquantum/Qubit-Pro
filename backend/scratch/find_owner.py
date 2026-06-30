import asyncio
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.database import get_db
from app.models import Simulation, Project, User

async def main():
    sim_id = "2ec36422-6cee-4f58-9d10-aafd48c36fa4"
    
    async for db in get_db():
        stmt = (
            select(Simulation)
            .options(selectinload(Simulation.project))
            .where(Simulation.id == sim_id)
        )
        res = await db.execute(stmt)
        sim = res.scalar_one_or_none()
        if not sim:
            print("Simulation not found!")
            return
            
        if sim.project:
            print(f"Project ID: {sim.project.id}")
            print(f"Project Owner ID: {sim.project.owner_id}")
            
            # Fetch the user details
            stmt_user = select(User).where(User.id == sim.project.owner_id)
            res_user = await db.execute(stmt_user)
            user = res_user.scalar_one_or_none()
            if user:
                print(f"Owner Name: {user.name}")
                print(f"Owner Email: {user.email}")
            else:
                print("Owner user not found!")
        else:
            print("Simulation has no associated project!")

if __name__ == "__main__":
    asyncio.run(main())
