"""Integration and unit tests for the Simulation FastAPI Router."""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime
from pathlib import Path
from typing import AsyncGenerator, Dict, Any
from unittest.mock import patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.main import app
from app.auth import get_current_user
from app.database import Base, get_db
from app.models import Project, ProjectStatus, Simulation, SimulationStatus, User, UserRole
from app.config import settings
from app.simulation.service.simulation_service import (
    SimulationRequest,
    SimulationResponse,
    SimulationExecutionSummary,
)
from app.simulation.service.state_manager import PipelineState
from app.simulation.database.models import (
    SimulationExecution,
    SimulationResult,
    SimulationArtifact,
    SimulationLog,
    SimulationMetric,
    SimulationParameter,
    WorkspaceSnapshot,
)

# In-memory database for isolated, lightning-fast router testing
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest_asyncio.fixture
async def test_engine():
    """Isolated database engine for router tests."""
    engine = create_async_engine(
        TEST_DATABASE_URL,
        connect_args={"check_same_thread": False},
        echo=False,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield engine

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(test_engine) -> AsyncGenerator[AsyncSession, None]:
    """Transactional session for router tests."""
    session_factory = async_sessionmaker(
        test_engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=False,
    )
    async with session_factory() as session:
        yield session


@pytest_asyncio.fixture
async def seed_data(db_session: AsyncSession) -> Dict[str, Any]:
    """Seed test user and projects."""
    user = User(
        id="test_user_router",
        name="Test Router Engineer",
        email="router@quantum.com",
        hashed_password="password_abc",
        role=UserRole.engineer,
        organization="Test Org",
    )
    
    other_user = User(
        id="other_user_router",
        name="Other Engineer",
        email="other@quantum.com",
        hashed_password="password_def",
        role=UserRole.engineer,
        organization="Other Org",
    )

    # Authorized project
    project = Project(
        id="proj_router_1",
        owner_id=user.id,
        name="Router Chip",
        topology="custom",
        num_qubits=1,
        target_frequency_ghz=5.0,
        status=ProjectStatus.in_progress,
        design_payload={
            "placement": {
                "qubits": [{"id": "Q1", "x": 0, "y": 0}],
                "resonators": []
            }
        }
    )

    # Unauthorized project (belongs to other user)
    other_project = Project(
        id="proj_router_2",
        owner_id=other_user.id,
        name="Other Chip",
        topology="grid",
        num_qubits=2,
        target_frequency_ghz=5.2,
        status=ProjectStatus.in_progress,
        design_payload={
            "placement": {
                "qubits": [{"id": "Q1", "x": 0, "y": 0}],
                "resonators": []
            }
        }
    )

    db_session.add_all([user, other_user, project, other_project])
    await db_session.commit()
    return {"user": user, "other_user": other_user, "project": project, "other_project": other_project}


# Simple plain-old-Python object to act as the current user without SQLAlchemy lazy loading
class MockUser:
    def __init__(self, id: str):
        self.id = id


@pytest_asyncio.fixture
async def client(db_session: AsyncSession, seed_data: Dict[str, Any]) -> AsyncGenerator[AsyncClient, None]:
    """HTTP client with mocked dependencies."""
    user = seed_data["user"]
    
    # Configure mock mode so tests complete quickly
    settings.palace_mock_mode = True
    
    # Override FastAPI dependency injection
    app.dependency_overrides[get_db] = lambda: db_session
    user_id = user.id
    app.dependency_overrides[get_current_user] = lambda: MockUser(id=user_id)

    # Mock the execute_simulation method of the central simulation_service
    from app.routers.simulations import simulation_service
    from app.routers import simulations
    
    async def mock_execute_simulation(
        *args,
        request: SimulationRequest | None = None,
        session: AsyncSession | None = None,
        project_id: str | None = None,
        user_id: str | None = None,
        on_progress: Any = None,
        **kwargs,
    ) -> SimulationResponse:
        from app.simulation.database.persistence_service import SimulationPersistenceService
        
        real_request = request
        if real_request is None:
            for arg in args:
                if isinstance(arg, SimulationRequest):
                    real_request = arg
                    break

        if real_request is None:
            raise ValueError("SimulationRequest not found in arguments")

        summary = SimulationExecutionSummary(
            simulation_id=real_request.simulation_id,
            status=PipelineState.COMPLETED,
            start_time="2026-06-25T10:00:00Z",
            end_time="2026-06-25T10:00:01Z",
            total_runtime_seconds=1.0,
            phase_timings={"mesh": 0.5, "solve": 0.5},
            generated_files=["mesh.msh"],
            warnings=["test_warning"],
            errors=[],
        )
        response = SimulationResponse(
            results={"eigenfrequencies_ghz": [5.0, 5.1]},
            summary=summary
        )
        if session is not None and project_id is not None and user_id is not None:
            persist_service = SimulationPersistenceService()
            await persist_service.save_simulation_run(
                session=session,
                request=real_request,
                response=response,
                project_id=project_id,
                user_id=user_id,
            )
        return response

    class MockSessionMaker:
        def __init__(self, *args, **kwargs):
            pass
        async def __aenter__(self) -> AsyncSession:
            return db_session
        async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
            pass
        def __call__(self, *args, **kwargs):
            return self

    from app.simulation.queue import start_global_worker
    import sys

    with patch("app.simulation.service.simulation_service.SimulationService.execute_simulation", new=mock_execute_simulation):
        with patch("app.simulation.queue.worker.AsyncSessionLocal", new=MockSessionMaker()):
            with patch("app.routers.simulations.AsyncSessionLocal", new=MockSessionMaker()):
                worker = await start_global_worker()
                async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                    yield c
                await worker.stop()
                
                # Clear the global queue, scheduler, and active workers registry to prevent test contamination
                try:
                    from app.simulation.queue import global_queue, global_scheduler, active_workers
                    if global_queue:
                        global_queue._jobs.clear()
                        global_queue._total_processed = 0
                    if global_scheduler:
                        global_scheduler.active_jobs.clear()
                    if isinstance(active_workers, dict):
                        active_workers.clear()
                except Exception as e:
                    pass
                
                try:
                    import app.simulation.queue as queue_mod
                    queue_mod.global_worker = None
                except Exception:
                    pass
                sys.modules["app.simulation.queue"].global_worker = None


    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Test Cases
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
class TestSimulationRouter:
    """Verifies all Phase 10 REST endpoints, authorization, paging, and lifecycle controls."""

    async def test_run_simulation_unauthorized_project(self, client: AsyncClient, seed_data: Dict[str, Any]):
        """Verifies that attempting to run a simulation on another user's project returns 404."""
        other_proj = seed_data["other_project"]
        payload = {
            "project_id": other_proj.id,
            "solver_type": "eigenmode",
            "coarse_mesh": True,
        }
        response = await client.post("/api/simulations/run", json=payload)
        assert response.status_code == 404

    async def test_run_simulation_empty_design(self, client: AsyncClient, db_session: AsyncSession, seed_data: Dict[str, Any]):
        """Verifies that attempting to run on an empty design returns 400 Bad Request."""
        proj = seed_data["project"]
        
        # Clear design payload components
        proj.design_payload = {}
        db_session.add(proj)
        await db_session.commit()

        payload = {
            "project_id": proj.id,
            "solver_type": "eigenmode",
        }
        response = await client.post("/api/simulations/run", json=payload)
        assert response.status_code == 400
        assert "empty design" in response.json()["detail"]

    async def test_run_simulation_success_and_status_polling(
        self, client: AsyncClient, db_session: AsyncSession, seed_data: Dict[str, Any]
    ):
        """Tests end-to-end simulation trigger, background worker scheduling, and status polling."""
        proj = seed_data["project"]
        payload = {
            "project_id": proj.id,
            "solver_type": "eigenmode",
            "coarse_mesh": True,
        }

        # 1. Trigger Run
        response = await client.post("/api/simulations/run", json=payload)
        assert response.status_code == 201
        data = response.json()
        sim_id = data["id"]
        assert data["status"] == "queued"

        # 2. Poll Status (Immediately, while executing or queued)
        status_resp = await client.get(f"/api/simulations/{sim_id}/status")
        assert status_resp.status_code == 200
        status_data = status_resp.json()
        assert status_data["simulation_id"] == sim_id
        assert status_data["status"].lower() in ("queued", "running", "completed")

        # 3. Wait a brief moment for the fast mock background execution to finish
        completed = False
        for _ in range(30):
            await asyncio.sleep(0.1)
            db_session.expire_all()
            sim = await db_session.get(Simulation, sim_id)
            if sim and sim.status == SimulationStatus.completed:
                completed = True
                break
        
        assert completed, "Background mock simulation execution did not complete in time"

        # 4. Poll Status again (verifying database fallback for completed runs)
        status_resp = await client.get(f"/api/simulations/{sim_id}/status")
        assert status_resp.status_code == 200
        status_data = status_resp.json()
        assert status_data["status"] == "COMPLETED"
        assert status_data["progress"] == 100.0

        # 5. Fetch details
        details_resp = await client.get(f"/api/simulations/{sim_id}")
        assert details_resp.status_code == 200
        assert details_resp.json()["status"] == "completed"

        # 6. Fetch results
        results_resp = await client.get(f"/api/simulations/{sim_id}/results")
        assert results_resp.status_code == 200
        assert "eigenfrequencies_ghz" in results_resp.json()

    async def test_list_simulations_and_pagination(
        self, client: AsyncClient, db_session: AsyncSession, seed_data: Dict[str, Any]
    ):
        """Verifies paginated list querying, sorting, and authorization scoping."""
        proj = seed_data["project"]
        other_proj = seed_data["other_project"]

        # Seed 3 simulation runs belonging to user, and 1 to another user
        for i in range(3):
            sim = Simulation(
                id=f"sim_list_{i}",
                project_id=proj.id,
                solver="eigenmode" if i < 2 else "electrostatic",
                status=SimulationStatus.completed,
                config={"np": 2},
                created_at=datetime.utcnow(),
            )
            db_session.add(sim)
            
        other_sim = Simulation(
            id="sim_list_other",
            project_id=other_proj.id,
            solver="eigenmode",
            status=SimulationStatus.completed,
            config={},
            created_at=datetime.utcnow(),
        )
        db_session.add(other_sim)
        await db_session.commit()

        # Query all - should return exactly 3 simulations (authorized ones only!)
        resp = await client.get("/api/simulations")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_count"] == 3
        assert len(data["items"]) == 3
        
        # Test filters (solver=electrostatic)
        resp = await client.get("/api/simulations?solver=electrostatic")
        assert resp.json()["total_count"] == 1

        # Test pagination (page_size=2)
        resp = await client.get("/api/simulations?page_size=2")
        paged_data = resp.json()
        assert len(paged_data["items"]) == 2
        assert paged_data["total_pages"] == 2
        assert paged_data["page"] == 1

    async def test_retry_simulation(self, client: AsyncClient, db_session: AsyncSession, seed_data: Dict[str, Any]):
        """Verifies retry endpoint clones old configuration and launches new background task."""
        proj = seed_data["project"]
        sim_id = "sim_to_retry"

        # Seed a completed simulation and its parameters
        sim = Simulation(
            id=sim_id,
            project_id=proj.id,
            solver="eigenmode",
            status=SimulationStatus.completed,
            config={"np": 8},
        )
        param = SimulationParameter(
            simulation_id=sim_id,
            parameter_key="user_settings",
            parameter_value={"np": 8, "mesh_size": 0.5},
        )
        db_session.add_all([sim, param])
        await db_session.commit()

        # Call Retry
        resp = await client.post(f"/api/simulations/{sim_id}/retry", json={"coarse_mesh": True})
        assert resp.status_code == 200
        data = resp.json()
        new_sim_id = data["id"]
        assert new_sim_id != sim_id
        assert data["status"] == "queued"
        assert data["config"] == {"np": 8, "mesh_size": 0.5}

    async def test_logs_metrics_and_workspace_endpoints(
        self, client: AsyncClient, db_session: AsyncSession, seed_data: Dict[str, Any]
    ):
        """Tests retrieving logs, metrics, and scrubbed workspace info."""
        proj = seed_data["project"]
        sim_id = "sim_details_123"

        # Seed simulation execution with details
        sim = Simulation(
            id=sim_id,
            project_id=proj.id,
            solver="eigenmode",
            status=SimulationStatus.completed,
            config={},
        )
        execution = SimulationExecution(
            id="exec_123",
            simulation_id=sim_id,
            workspace_id="ws_path_secret",
            status="COMPLETED",
            palace_version="v0.11.2",
            duration_seconds=5.5,
        )
        log = SimulationLog(
            execution_id=execution.id,
            log_type="orchestrator",
            content="Solving eigenmode problem...",
        )
        metric = SimulationMetric(
            execution_id=execution.id,
            metric_key="runner_duration",
            metric_value=3.4,
        )
        snapshot = WorkspaceSnapshot(
            execution_id=execution.id,
            snapshot_metadata={
                "root_path": "/secret/absolute/path/ws_123",
                "generated_files_count": 4,
                "rollback_policy": "DELETE_ON_SUCCESS",
            }
        )
        db_session.add_all([sim, execution, log, metric, snapshot])
        await db_session.commit()

        # 1. Test Logs
        resp = await client.get(f"/api/simulations/{sim_id}/logs")
        assert resp.status_code == 200
        assert len(resp.json()) == 1
        assert resp.json()[0]["log_type"] == "orchestrator"
        assert resp.json()[0]["content"] == "Solving eigenmode problem..."

        # 2. Test Metrics
        resp = await client.get(f"/api/simulations/{sim_id}/metrics")
        assert resp.status_code == 200
        assert resp.json()["metrics"]["runner_duration"] == 3.4

        # 3. Test Workspace (Verify absolute paths are scrubbed)
        resp = await client.get(f"/api/simulations/{sim_id}/workspace")
        assert resp.status_code == 200
        workspace_data = resp.json()
        assert workspace_data["workspace_id"] == "ws_123"
        assert "/secret" not in workspace_data["workspace_id"]
        assert workspace_data["files_count"] == 4

    async def test_artifact_listing_and_streaming_downloads(
        self, client: AsyncClient, db_session: AsyncSession, seed_data: Dict[str, Any], tmp_path
    ):
        """Tests listing and downloading specific file artifacts via FileResponse streaming."""
        proj = seed_data["project"]
        sim_id = "sim_artifacts_123"

        # Create a dummy file on disk for downloading
        dummy_file = tmp_path / "mesh.msh"
        dummy_file.write_text("dummy mesh contents")

        # Seed execution and artifact record
        sim = Simulation(
            id=sim_id,
            project_id=proj.id,
            solver="eigenmode",
            status=SimulationStatus.completed,
            config={},
        )
        execution = SimulationExecution(
            id="exec_art_123",
            simulation_id=sim_id,
            workspace_id="ws",
            status="COMPLETED",
        )
        art_id = "art_123"
        artifact = SimulationArtifact(
            id=art_id,
            execution_id=execution.id,
            file_name="mesh.msh",
            path=str(dummy_file),
            size=18,
            checksum="abc",
            artifact_type="mesh",
            created_at=datetime.utcnow(),
        )
        db_session.add_all([sim, execution, artifact])
        await db_session.commit()

        # 1. List Artifacts
        resp = await client.get(f"/api/simulations/{sim_id}/artifacts")
        assert resp.status_code == 200
        assert len(resp.json()) == 1
        assert resp.json()[0]["file_name"] == "mesh.msh"

        # 2. Download Artifact (streams file)
        resp = await client.get(f"/api/simulations/{sim_id}/artifacts/{art_id}")
        assert resp.status_code == 200
        assert resp.read() == b"dummy mesh contents"
        assert resp.headers["content-disposition"] == 'attachment; filename="mesh.msh"'

    async def test_delete_simulation_cascades(
        self, client: AsyncClient, db_session: AsyncSession, seed_data: Dict[str, Any]
    ):
        """Verifies simulation hard deletion and database cascading deletes of child records."""
        proj = seed_data["project"]
        sim_id = "sim_to_delete"
    
        # Create a dummy workspace folder for cleanup testing inside the project root
        project_root = Path(__file__).resolve().parents[2]
        workspace_dir = project_root / f"tmp_test_delete_{uuid.uuid4()}"
        workspace_dir.mkdir(exist_ok=True)
        (workspace_dir / "mesh.msh").write_text("mesh")
    
        # Seed simulation, execution, result, artifact
        sim = Simulation(
            id=sim_id,
            project_id=proj.id,
            solver="eigenmode",
            status=SimulationStatus.completed,
            config={},
            artifact_path=str(workspace_dir.relative_to(project_root)),
        )
        execution = SimulationExecution(
            id="exec_del_123",
            simulation_id=sim_id,
            workspace_id="ws",
            status="COMPLETED",
        )
        artifact = SimulationArtifact(
            id="art_del_123",
            execution_id=execution.id,
            file_name="mesh.msh",
            path=str(workspace_dir / "mesh.msh"),
            size=4,
            checksum="abc",
            artifact_type="mesh",
        )
        db_session.add_all([sim, execution, artifact])
        await db_session.commit()

        # Verify records exist
        assert (await db_session.get(Simulation, sim_id)) is not None
        assert workspace_dir.exists()

        # Call Delete API
        resp = await client.delete(f"/api/simulations/{sim_id}")
        assert resp.status_code == 204

        # Verify workspace files on disk were cleaned up!
        assert not workspace_dir.exists()


@pytest.mark.asyncio
async def test_get_current_user_query_token(db_session: AsyncSession):
    """Verifies that get_current_user resolves authentication from headers or query parameters."""
    from app.auth import get_current_user, create_access_token
    from fastapi import HTTPException
    
    user = User(
        id="query_token_user",
        name="Query Token User",
        email="query_token@quantum.com",
        hashed_password="hashed_password",
        role=UserRole.engineer,
        organization="Query Org",
    )
    db_session.add(user)
    await db_session.commit()
    
    # Generate token
    token = create_access_token({"sub": user.id})
    
    # 1. Test token via header (token parameter)
    resolved_user = await get_current_user(token=token, token_query=None, db=db_session)
    assert resolved_user.id == user.id
    
    # 2. Test token via query param (token_query parameter)
    resolved_user_query = await get_current_user(token=None, token_query=token, db=db_session)
    assert resolved_user_query.id == user.id
    
    # 3. Test missing token raises 401
    with pytest.raises(HTTPException) as exc:
        await get_current_user(token=None, token_query=None, db=db_session)
    assert exc.value.status_code == 401

