"""Unit and integration tests for the Simulation Database Integration layer."""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.database import Base
from app.models import Project, ProjectStatus, Simulation, SimulationStatus, User, UserRole
from app.simulation.database import (
    ArtifactRepository,
    MetricRepository,
    ResultRepository,
    SimulationArtifact,
    SimulationExecution,
    SimulationExecutionRepository,
    SimulationLog,
    SimulationMetric,
    SimulationParameter,
    SimulationPersistenceService,
    SimulationRepository,
    SimulationResult,
    WorkspaceSnapshot,
)
from app.simulation.service.state_manager import PipelineState
from app.simulation.service.simulation_service import (
    SimulationExecutionSummary,
    SimulationRequest,
    SimulationResponse,
)

# Use in-memory SQLite for fast, isolated database testing
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest_asyncio.fixture
async def test_engine():
    """Create a clean, isolated in-memory database engine for each test run."""
    engine = create_async_engine(
        TEST_DATABASE_URL,
        connect_args={"check_same_thread": False},
        echo=False,
    )
    # Create all tables in the metadata
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield engine
    
    # Clean up tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(test_engine) -> AsyncGenerator[AsyncSession, None]:
    """Provide a transactional AsyncSession for each unit test."""
    session_factory = async_sessionmaker(
        test_engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=False,
    )
    async with session_factory() as session:
        yield session


@pytest_asyncio.fixture
async def seed_user_and_project(db_session: AsyncSession) -> tuple[User, Project]:
    """Seed a default user and project to satisfy foreign key constraints."""
    user = User(
        id="test_user_id",
        name="Test Engineer",
        email="test@quantum.com",
        hashed_password="hashed_password_123",
        role=UserRole.engineer,
        organization="Test Quantum Corp",
    )
    project = Project(
        id="test_project_id",
        owner_id=user.id,
        name="Test Transmon Chip",
        topology="grid",
        num_qubits=2,
        target_frequency_ghz=5.2,
        status=ProjectStatus.in_progress,
    )
    db_session.add(user)
    db_session.add(project)
    await db_session.commit()
    return user, project


# ---------------------------------------------------------------------------
# Test Cases
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
class TestSimulationDatabaseSchema:
    """Verifies the core database model schemas, relationships, and cascading deletes."""

    async def test_cascading_deletes(self, db_session: AsyncSession, seed_user_and_project: tuple[User, Project]):
        """Verifies that deleting a root Simulation deletes all child records on cascade."""
        _, project = seed_user_and_project
        sim_id = str(uuid.uuid4())

        # 1. Create root Simulation
        sim = Simulation(
            id=sim_id,
            project_id=project.id,
            solver="eigenmode",
            status=SimulationStatus.completed,
            config={"np": 4},
            results={"freqs": [5.1, 5.2]},
        )
        db_session.add(sim)
        await db_session.flush()

        # 2. Add an Execution
        exec_id = str(uuid.uuid4())
        execution = SimulationExecution(
            id=exec_id,
            simulation_id=sim.id,
            workspace_id="ws_123",
            status="completed",
            palace_version="v0.11.2",
            duration_seconds=12.5,
        )
        db_session.add(execution)
        await db_session.flush()

        # 3. Add Result, Artifact, Log, Metric, Parameter, Snapshot
        res = SimulationResult(
            execution_id=exec_id,
            simulation_id=sim.id,
            solver_type="eigenmode",
            parsed_results={"freqs": [5.1, 5.2]},
        )
        art = SimulationArtifact(
            execution_id=exec_id,
            file_name="mesh.msh",
            path="/tmp/mesh.msh",
            size=1024,
            checksum="abc123sha",
            artifact_type="mesh",
        )
        log = SimulationLog(
            execution_id=exec_id,
            log_type="runner",
            content="Solving eigenmode problem...",
        )
        metric = SimulationMetric(
            execution_id=exec_id,
            metric_key="mesh_duration",
            metric_value=2.45,
        )
        param = SimulationParameter(
            simulation_id=sim.id,
            parameter_key="q_freq",
            parameter_value={"freq": 5.0},
        )
        snap = WorkspaceSnapshot(
            execution_id=exec_id,
            snapshot_metadata={"files": ["mesh.msh"]},
        )
        db_session.add_all([res, art, log, metric, param, snap])
        await db_session.commit()

        # 4. Verify all records exist in DB
        assert (await db_session.get(Simulation, sim_id)) is not None
        assert (await db_session.get(SimulationExecution, exec_id)) is not None
        assert (await db_session.get(SimulationResult, res.id)) is not None
        assert (await db_session.get(SimulationArtifact, art.id)) is not None
        assert (await db_session.get(SimulationLog, log.id)) is not None
        assert (await db_session.get(SimulationMetric, metric.id)) is not None
        assert (await db_session.get(SimulationParameter, param.id)) is not None
        assert (await db_session.get(WorkspaceSnapshot, snap.id)) is not None

        # 5. Delete the root Simulation
        await db_session.delete(sim)
        await db_session.commit()

        # 6. Verify cascade delete cleared everything!
        # Reset session to clear cache
        db_session.expire_all()
        assert (await db_session.get(Simulation, sim_id)) is None
        assert (await db_session.get(SimulationExecution, exec_id)) is None
        assert (await db_session.get(SimulationResult, res.id)) is None
        assert (await db_session.get(SimulationArtifact, art.id)) is None
        assert (await db_session.get(SimulationLog, log.id)) is None
        assert (await db_session.get(SimulationMetric, metric.id)) is None
        assert (await db_session.get(SimulationParameter, param.id)) is None
        assert (await db_session.get(WorkspaceSnapshot, snap.id)) is None


@pytest.mark.asyncio
class TestRepositories:
    """Verifies repository query operations, paging, and filters."""

    async def test_simulation_query_pagination(
        self, db_session: AsyncSession, seed_user_and_project: tuple[User, Project]
    ):
        """Verifies querying and paginating simulations using SimulationRepository."""
        _, project = seed_user_and_project
        repo = SimulationRepository(db_session)

        # Seed 3 simulation records
        for i in range(3):
            sim = Simulation(
                id=f"sim_{i}",
                project_id=project.id,
                solver="eigenmode" if i < 2 else "electrostatic",
                status=SimulationStatus.completed if i % 2 == 0 else SimulationStatus.failed,
                config={"np": 4},
                results={},
            )
            db_session.add(sim)
        await db_session.commit()

        # Query all
        all_sims = await repo.list()
        assert len(all_sims) == 3

        # Query with filter
        eigenmode_sims = await repo.query_simulations(solver="eigenmode")
        assert len(eigenmode_sims) == 2

        # Query with pagination (limit=1, offset=1)
        paginated = await repo.query_simulations(limit=1, offset=1)
        assert len(paginated) == 1


@pytest.mark.asyncio
class TestSimulationPersistenceService:
    """Verifies transaction atomicity, mapping, and rollback-on-failure inside Persistence Service."""

    async def test_persistence_success(
        self, db_session: AsyncSession, seed_user_and_project: tuple[User, Project]
    ):
        """Verifies that save_simulation_run successfully persists all tables on a successful run."""
        _, project = seed_user_and_project
        service = SimulationPersistenceService()

        # Construct Pydantic Request
        request = SimulationRequest(
            simulation_id="sim_run_123",
            design_payload={"qubits": []},
            solver_type="eigenmode",
            user_settings={"np": 4},
        )

        # Construct Pydantic Response
        summary = SimulationExecutionSummary(
            simulation_id="sim_run_123",
            status=PipelineState.COMPLETED,
            start_time="2026-06-25T10:00:00Z",
            end_time="2026-06-25T10:00:15Z",
            total_runtime_seconds=15.0,
            phase_timings={
                "workspace": 0.5,
                "geometry": 2.0,
                "mesh": 3.5,
                "config": 1.0,
                "runner": 7.0,
                "parser": 1.0,
            },
            generated_files=["/tmp/mesh.msh", "/tmp/config.json"],
            warnings=["coarse mesh used"],
            errors=[],
            workspace_path="/tmp/quantum_workspace",
            palace_version="v0.11.2",
            geometry_metadata={"component_count": 2, "bounding_box": [0, 0, 0, 1, 1, 1], "created_at": "2026-06-25T10:00:02Z"},
            mesh_metadata={"workspace_id": "ws", "node_count": 100, "element_count": 200, "tet_count": 100, "triangle_count": 50, "line_count": 10, "bounding_box": [0,0,0,1,1,1], "mesh_settings": {}, "generation_time_seconds": 3.5, "created_at": "2026-06-25T10:00:05Z"},
            config_metadata={"checksum": "config_sha_256", "boundaries_count": 4},
            runner_metadata={"cpu_time_seconds": 28.0},
            artifacts_metadata={
                "mesh.msh": {
                    "file_name": "mesh.msh",
                    "path": "/tmp/quantum_workspace/mesh.msh",
                    "size": 524288,
                    "checksum": "checksum_mesh_123",
                    "artifact_type": "mesh",
                    "created_at": "2026-06-25T10:00:05.000000Z",
                },
                "config.json": {
                    "file_name": "config.json",
                    "path": "/tmp/quantum_workspace/config.json",
                    "size": 4096,
                    "checksum": "checksum_config_123",
                    "artifact_type": "config",
                    "created_at": "2026-06-25T10:00:06.000000Z",
                }
            }
        )
        response = SimulationResponse(
            results={"eigenfrequencies_ghz": [5.12, 5.34]},
            summary=summary,
        )

        # Call persistence service
        execution = await service.save_simulation_run(
            session=db_session,
            request=request,
            response=response,
            project_id=project.id,
            user_id=project.owner_id,
        )

        # Commit transaction
        await db_session.commit()

        # Eagerly load execution with details using repository
        exec_repo = SimulationExecutionRepository(db_session)
        db_exec = await exec_repo.get_execution_with_details(execution.id)

        # 1. Assert Execution fields
        assert db_exec is not None
        assert db_exec.status == "COMPLETED"
        assert db_exec.palace_version == "v0.11.2"
        assert db_exec.duration_seconds == 15.0
        assert db_exec.configuration_checksum == "config_sha_256"

        # 2. Assert Result fields
        assert db_exec.result is not None
        assert db_exec.result.solver_type == "eigenmode"
        assert db_exec.result.parsed_results["eigenfrequencies_ghz"] == [5.12, 5.34]

        # 3. Assert Artifacts fields
        assert len(db_exec.artifacts) == 2
        art_names = {a.file_name for a in db_exec.artifacts}
        assert "mesh.msh" in art_names
        assert "config.json" in art_names
        mesh_art = next(a for a in db_exec.artifacts if a.file_name == "mesh.msh")
        assert mesh_art.size == 524288
        assert mesh_art.checksum == "checksum_mesh_123"

        # 4. Assert Metrics fields
        assert len(db_exec.metrics) > 1
        metric_keys = {m.metric_key for m in db_exec.metrics}
        assert "total_runtime" in metric_keys
        assert "mesh_duration" in metric_keys
        assert "cpu_time" in metric_keys
        mesh_metric = next(m for m in db_exec.metrics if m.metric_key == "mesh_duration")
        assert mesh_metric.metric_value == 3.5

        # 5. Assert Logs fields
        assert len(db_exec.logs) == 1
        assert db_exec.logs[0].log_type == "orchestrator"
        assert "Palace Version: v0.11.2" in db_exec.logs[0].content

        # 6. Assert WorkspaceSnapshot fields
        assert db_exec.workspace_snapshot is not None
        assert db_exec.workspace_snapshot.snapshot_metadata["root_path"] == "/tmp/quantum_workspace"

        # 7. Assert Simulation root model was updated
        sim_repo = SimulationRepository(db_session)
        db_sim = await sim_repo.get_by_id("sim_run_123")
        assert db_sim is not None
        assert db_sim.status == SimulationStatus.completed
        assert db_sim.runtime_seconds == 15.0

    async def test_persistence_atomic_rollback(
        self, db_session: AsyncSession, seed_user_and_project: tuple[User, Project]
    ):
        """Verifies that if any database constraint fails, the entire transaction is rolled back cleanly."""
        _, project = seed_user_and_project
        service = SimulationPersistenceService()

        # Request
        request = SimulationRequest(
            simulation_id="sim_fail_123",
            design_payload={},
            solver_type="eigenmode",
            user_settings={},
        )

        # Create a response that will trigger a database integrity error
        # e.g., we set project_id to an invalid value or trigger a unique constraint violation.
        # Let's pass a project_id that does not exist in a parent table to cause a ForeignKey violation.
        # (SQLite enforces foreign keys if enabled, or we can trigger it by violating a unique constraint).
        # To trigger it reliably on SQLite, let's try to insert two results with the same unique execution_id!
        # Wait, the persistence service creates one result per execution. If we mock a duplicate insert, it will fail!
        # Alternatively, we can just trigger an exception manually inside our saving block by mocking one of the sub-calls,
        # or we can pass a value that violates a database nullability constraint (like workspace_id = None which is not nullable,
        # but wait, let's see if we can trigger a column type error or similar).
        # Actually, let's pass a project_id that violates foreign key, but wait: SQLite foreign keys are off by default unless enabled.
        # Let's pass a value that violates a unique constraint or we can just catch the exception.
        # Let's trigger a nullable constraint violation! The `id` column or `status` column is not nullable.
        # In SQLite, trying to insert an execution with status = None (if it is mapped as non-nullable Mapped[str]) will fail!
        # Yes, let's try to run `save_simulation_run` but with a mock response where `summary.status` is None.
        # Actually, the easiest way to test atomic rollback is:
        # We start a transaction, we successfully save something, then during the same transaction we trigger an error,
        # and we verify that the FIRST successful save is also rolled back!
        # Yes! Let's do this:
        # 1. We call `save_simulation_run` with a valid run.
        # 2. Immediately after, we try to insert a duplicate Simulation record with the same ID, causing a Primary Key violation!
        # 3. We verify that because of the primary key violation, the entire outer transaction is rolled back,
        #    and the SimulationExecution and other tables are completely empty!

        summary = SimulationExecutionSummary(
            simulation_id="sim_rollback_123",
            status=PipelineState.COMPLETED,
            start_time="2026-06-25T10:00:00Z",
            end_time="2026-06-25T10:00:15Z",
            total_runtime_seconds=15.0,
            phase_timings={},
            generated_files=[],
            warnings=[],
            errors=[],
        )
        response = SimulationResponse(results={}, summary=summary)

        # We execute in a try/except block where we force a failure
        try:
            async with db_session.begin():
                # 1. Save the simulation run (succeeds)
                await service.save_simulation_run(
                    session=db_session,
                    request=request,
                    response=response,
                    project_id=project.id,
                    user_id=project.owner_id,
                )
                # 2. Force a duplicate key insert on the database (fails)
                duplicate_sim = Simulation(
                    id=None,
                    project_id=None,
                )
                db_session.add(duplicate_sim)
                await db_session.flush()  # Triggers IntegrityError in SQLite!
        except Exception as e:
            # Expected database integrity error
            # Rollback is automatically triggered by the 'async with db_session.begin():' context manager
            pass

        # 3. Verify that nothing was persisted! The database remains completely clean.
        db_session.expire_all()
        sim_repo = SimulationRepository(db_session)
        db_sim = await sim_repo.get_by_id("sim_rollback_123")
        assert db_sim is None

        exec_repo = SimulationExecutionRepository(db_session)
        stmt = select(SimulationExecution).where(SimulationExecution.simulation_id == "sim_rollback_123")
        res = await db_session.execute(stmt)
        assert res.scalar_one_or_none() is None
