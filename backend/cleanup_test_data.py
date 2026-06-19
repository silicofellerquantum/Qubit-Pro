import asyncio, sys
sys.path.insert(0, '.')
from dotenv import load_dotenv
load_dotenv()

from app.database import AsyncSessionLocal
from app.models import Project
from sqlalchemy import select

async def cleanup():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Project))
        projects = result.scalars().all()
        print('Current projects in Supabase:')
        for p in projects:
            print(f'  - [{p.id[:8]}] "{p.name}" (owner={p.owner_id[:8]})')
        
        # Delete only test projects
        test_projects = [p for p in projects if p.name.startswith('TEST-')]
        for p in test_projects:
            await db.delete(p)
            print(f'Deleted test project: {p.name}')
        
        await db.commit()
        
        result2 = await db.execute(select(Project))
        remaining = result2.scalars().all()
        print(f'Remaining real projects: {len(remaining)}')
        for p in remaining:
            print(f'  - "{p.name}"')

asyncio.run(cleanup())
