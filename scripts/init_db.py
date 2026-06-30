import asyncio
import sys
import os

# Add backend directory to sys.path
root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
backend_dir = os.path.join(root_dir, "backend")
if os.path.exists(backend_dir):
    sys.path.append(backend_dir)
else:
    sys.path.append(root_dir)

from app.database import engine, Base, AsyncSessionLocal
from app.database.seed import seed_admin_user
from sqlalchemy.schema import DropTable
from sqlalchemy.ext.compiler import compiles

@compiles(DropTable, "postgresql")
def _compile_drop_table(element, compiler, **kwargs):
    return compiler.visit_drop_table(element) + " CASCADE"

async def init_db_script():
    print("Dropping all tables...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        print("Creating all tables...")
        await conn.run_sync(Base.metadata.create_all)
    
    print("Seeding admin user...")
    async with AsyncSessionLocal() as session:
        await seed_admin_user(session)
    print("Database initialized successfully!")

if __name__ == "__main__":
    asyncio.run(init_db_script())
