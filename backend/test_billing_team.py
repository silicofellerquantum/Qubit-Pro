import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.models import Base
from app.database import engine

def test_endpoints_mounted():
    # Attempting to fetch billing without auth should return 401
    with TestClient(app) as client:
        response = client.get("/api/billing/me")
        assert response.status_code == 401, f"Expected 401 for /api/billing/me, got {response.status_code}"
        
        # Attempting to fetch team without auth should return 401
        response = client.get("/api/team/members")
        assert response.status_code == 401, f"Expected 401 for /api/team/members, got {response.status_code}"
        
        print("Billing and Team endpoints successfully mounted and returning 401 (Auth required)!")

if __name__ == "__main__":
    test_endpoints_mounted()
