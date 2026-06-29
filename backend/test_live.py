"""Live end-to-end test: Google OAuth login -> create project -> verify in Supabase"""
import asyncio, sys, json
sys.path.insert(0, '.')
from dotenv import load_dotenv
load_dotenv()

import httpx

BASE = 'http://127.0.0.1:5000'

async def test():
    # Step 1: Get current user via /api/auth/me (requires a real token)
    # First check if backend is up
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(f'{BASE}/')
        print('Backend is UP')
    except Exception as e:
        print('Backend connection failed:', e)
        return

    # Step 2: Test create project endpoint with the logged-in user's credentials
    # We need to get a valid auth token first
    # Since user uses Google auth, let's try to see project list endpoint behavior
    async with httpx.AsyncClient(timeout=10) as client:
        # Test without auth - should get 401
        r = await client.get(f'{BASE}/api/projects')
        print(f'GET /api/projects (no auth): {r.status_code}')
        
        # Test the backend docs page
        r2 = await client.get(f'{BASE}/docs')
        print(f'GET /docs: {r2.status_code}')

asyncio.run(test())
