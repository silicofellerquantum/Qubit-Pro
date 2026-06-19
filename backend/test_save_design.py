"""Test save-design endpoint with the google-auth user (vichu)."""
import asyncio, sys
sys.path.insert(0, '.')
from dotenv import load_dotenv
load_dotenv()

from app.database import AsyncSessionLocal
from app.models import User, Project
from app.auth import create_access_token
from datetime import timedelta
from app.config import settings
from sqlalchemy import select
import httpx

BASE = 'http://127.0.0.1:5000'

async def test():
    async with AsyncSessionLocal() as db:
        # Get all users
        result = await db.execute(select(User))
        users = result.scalars().all()
        print(f'All users: {[u.email for u in users]}')
        
        # Get all projects
        result2 = await db.execute(select(Project))
        projects = result2.scalars().all()
        print(f'All projects: {[(p.name, p.owner_id[:8]) for p in projects]}')
        
        if not projects:
            print('No projects! Creating one...')
            return
            
        project = projects[0]
        # Get the owner
        owner = next((u for u in users if u.id == project.owner_id), None)
        if not owner:
            print('Owner not found!')
            return
            
        print(f'Testing with user: {owner.email}, project: {project.name}')
        
        # Create JWT token
        token = create_access_token({"sub": owner.id}, timedelta(minutes=settings.access_token_expire_minutes))
        
    # Test save-design endpoint
    async with httpx.AsyncClient(timeout=15) as client:
        payload = {
            "label": "TestDesign",
            "num_qubits": 5,
            "topology": "chain",
            "engine": "test",
            "interpretation": "Test canvas design from schematic editor",
            "design": {
                "placements": [
                    {"id": "q1", "componentId": "TransmonPocket", "name": "Q1", "x": 0.5, "y": 0.5, "rotation": 0, "params": {}, "layer": "metal"},
                    {"id": "q2", "componentId": "TransmonPocket", "name": "Q2", "x": 1.5, "y": 0.5, "rotation": 0, "params": {}, "layer": "metal"},
                ],
                "connections": [
                    {"id": "c1", "from": {"placementId": "q1", "pinName": "pin_cplr_NE"}, "to": {"placementId": "q2", "pinName": "pin_cplr_NW"}}
                ]
            }
        }
        
        r = await client.post(
            f'{BASE}/api/projects/{project.id}/save-design',
            json=payload,
            headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}
        )
        print(f'POST /save-design: HTTP {r.status_code}')
        print(f'Response: {r.text}')
        
        if r.status_code == 200:
            # Verify the project was updated in Supabase
            r2 = await client.get(
                f'{BASE}/api/projects',
                headers={'Authorization': f'Bearer {token}'}
            )
            projects_data = r2.json()
            for p in projects_data:
                print(f'  Project "{p["name"]}": has_design={p["has_design"]}, qubits={p["num_qubits"]}, topology={p["topology"]}')

asyncio.run(test())
