"""Comprehensive unit and integration tests for the Palace simulation runner."""

from __future__ import annotations

import asyncio
import json
import os
import shutil
import stat
import sys
import tempfile
import uuid
from pathlib import Path
from typing import Generator, Tuple

import pytest

from app.simulation.workspace import WorkspaceManager
from app.simulation.workspace.types import WorkspaceState
from app.simulation.runner import (
    PalaceRunner,
    ProgressState,
    RunnerMetadata,
    SimulationStage,
)
from app.simulation.runner.exceptions import (
    MPIUnavailableError,
    PalaceExecutableNotFoundError,
    RunnerCancelledError,
    RunnerConfigurationError,
    RunnerExecutionError,
    RunnerTimeoutError,
)
from app.simulation.runner.constants import METADATA_FILENAME


@pytest.fixture
def temp_dirs() -> Generator[Tuple[Path, Path], None, None]:
    """Provide temporary directories for workspace root and archives."""
    with tempfile.TemporaryDirectory() as ws_root, tempfile.TemporaryDirectory() as arc_dir:
        yield Path(ws_root), Path(arc_dir)


@pytest.fixture
def workspace_manager(temp_dirs: Tuple[Path, Path]) -> WorkspaceManager:
    """Provide a WorkspaceManager configured with temporary directories."""
    ws_root, arc_dir = temp_dirs
    return WorkspaceManager(
        workspace_root=ws_root,
        archive_dir=arc_dir,
        max_workspace_count=10,
    )


@pytest.fixture
def dummy_solver_script() -> Generator[Path, None, None]:
    """Create an executable dummy Python script that mimics Palace's logging behavior."""
    with tempfile.NamedTemporaryFile(suffix=".py", mode="w", delete=False) as f:
        f.write(f"""#!/usr/bin/env {sys.executable}
import sys
import time

print("Reading mesh file...")
sys.stdout.flush()
time.sleep(0.1)

print("Grid size: 1500 tets, 400 triangles.")
sys.stdout.flush()
time.sleep(0.1)

print("Initializing solver operators...")
sys.stdout.flush()
time.sleep(0.1)

print("Starting solver GMRES iterations...")
sys.stdout.flush()
time.sleep(0.1)

print("Iteration 1: residual = 1.2e-5")
sys.stdout.flush()
time.sleep(0.1)

print("Eigenmode 1: f = 5.120000000000e+09 Hz")
sys.stdout.flush()
time.sleep(0.1)

print("Writing simulation outputs...")
sys.stdout.flush()
time.sleep(0.1)

print("Saving field visualization VTU files...")
sys.stdout.flush()
time.sleep(0.1)

print("Simulation completed successfully.")
sys.stdout.flush()
""")
        script_path = Path(f.name)

    # Make the script executable (chmod +x)
    st = os.stat(script_path)
    os.chmod(script_path, st.st_mode | stat.S_IEXEC)

    yield script_path

    # Clean up
    if script_path.exists():
        script_path.unlink()


@pytest.fixture
def dummy_hanging_script() -> Generator[Path, None, None]:
    """Create an executable dummy Python script that sleeps indefinitely to test timeouts."""
    with tempfile.NamedTemporaryFile(suffix=".py", mode="w", delete=False) as f:
        f.write(f"""#!/usr/bin/env {sys.executable}
import sys
import time

print("Reading mesh file...")
sys.stdout.flush()

try:
    while True:
        time.sleep(0.5)
except KeyboardInterrupt:
    print("Caught SIGINT")
    sys.stdout.flush()
""")
        script_path = Path(f.name)

    # Make the script executable
    st = os.stat(script_path)
    os.chmod(script_path, st.st_mode | stat.S_IEXEC)

    yield script_path

    if script_path.exists():
        script_path.unlink()


# --- Unit Tests ---

def test_palace_runner_initialization(workspace_manager: WorkspaceManager):
    """Verify that PalaceRunner initializes with default settings."""
    runner = PalaceRunner(workspace_manager=workspace_manager)
    assert runner.workspace_manager == workspace_manager
    assert runner.palace_path is None
    assert runner.timeout_seconds is None
    assert len(runner.active_runs) == 0


@pytest.mark.asyncio
async def test_run_simulation_missing_files(workspace_manager: WorkspaceManager):
    """Verify that launching a simulation on a workspace without config/mesh raises RunnerConfigurationError."""
    runner = PalaceRunner(workspace_manager=workspace_manager)
    sim_id = str(uuid.uuid4())
    workspace_manager.create_workspace(sim_id)

    # No files written yet
    with pytest.raises(RunnerConfigurationError) as exc:
        await runner.run_simulation(sim_id)
    assert "Required configuration file missing" in str(exc.value)


@pytest.mark.asyncio
async def test_run_simulation_executable_not_found(workspace_manager: WorkspaceManager):
    """Verify that an invalid explicit executable path raises PalaceExecutableNotFoundError."""
    runner = PalaceRunner(
        workspace_manager=workspace_manager,
        palace_path="/invalid/path/to/palace_non_existent"
    )
    sim_id = str(uuid.uuid4())
    ws = workspace_manager.create_workspace(sim_id)

    # Pre-populate dummy config and mesh files
    config_file = Path(ws.config_path) / "config.json"
    config_file.parent.mkdir(parents=True, exist_ok=True)
    config_file.touch()
    
    mesh_file = Path(ws.mesh_path) / "mesh.msh"
    mesh_file.parent.mkdir(parents=True, exist_ok=True)
    mesh_file.touch()

    with pytest.raises(PalaceExecutableNotFoundError) as exc:
        await runner.run_simulation(sim_id)
    assert "lacks execute permissions" in str(exc.value) or "does not exist" in str(exc.value)


@pytest.mark.asyncio
async def test_successful_mock_execution(
    workspace_manager: WorkspaceManager,
    dummy_solver_script: Path
):
    """Verify stream capturing, progress tracking, logging, and metadata in a successful run."""
    runner = PalaceRunner(
        workspace_manager=workspace_manager,
        palace_path=str(dummy_solver_script)
    )
    sim_id = str(uuid.uuid4())
    ws = workspace_manager.create_workspace(sim_id)

    # Setup required files
    config_file = Path(ws.config_path) / "config.json"
    config_file.touch()
    mesh_file = Path(ws.mesh_path) / "mesh.msh"
    mesh_file.touch()

    # Track progress updates
    progress_states = []
    def progress_callback(state: ProgressState):
        progress_states.append(state)

    metadata = await runner.run_simulation(
        simulation_id=sim_id,
        np=1,
        on_progress=progress_callback
    )

    # 1. Verify Metadata
    assert isinstance(metadata, RunnerMetadata)
    assert metadata.workspace_id == sim_id
    assert metadata.exit_code == 0
    assert metadata.termination_reason == "completed"
    assert metadata.processor_count == 1
    assert metadata.duration_seconds is not None
    assert metadata.duration_seconds > 0.0

    # 2. Verify Logs
    logs_dir = Path(ws.log_path)
    assert (logs_dir / "runner.log").exists()
    assert (logs_dir / "palace_stdout.log").exists()
    assert (logs_dir / "palace_stderr.log").exists()

    with open(logs_dir / "palace_stdout.log", "r") as f:
        stdout_content = f.read()
    assert "Reading mesh file..." in stdout_content
    assert "Simulation completed successfully." in stdout_content

    # 3. Verify Progress tracking sequence
    stages = [state.stage for state in progress_states]
    assert SimulationStage.LAUNCHING_PALACE in stages
    assert SimulationStage.LOADING_MESH in stages
    assert SimulationStage.INITIALIZING_SOLVER in stages
    assert SimulationStage.SOLVING in stages
    assert SimulationStage.POSTPROCESSING in stages
    assert SimulationStage.COMPLETED in stages

    # Check final percentage is 100%
    assert progress_states[-1].percentage == 100.0

    # 4. Verify workspace state updated to COMPLETED
    ws_meta = workspace_manager.get_workspace(sim_id)
    assert ws_meta.status == WorkspaceState.COMPLETED

    # 5. Verify metadata file written to logs
    assert (logs_dir / METADATA_FILENAME).exists()


@pytest.mark.asyncio
async def test_timeout_execution(
    workspace_manager: WorkspaceManager,
    dummy_hanging_script: Path
):
    """Verify that a simulation exceeding timeout limits is killed and raises RunnerTimeoutError."""
    runner = PalaceRunner(
        workspace_manager=workspace_manager,
        palace_path=str(dummy_hanging_script)
    )
    sim_id = str(uuid.uuid4())
    ws = workspace_manager.create_workspace(sim_id)

    config_file = Path(ws.config_path) / "config.json"
    config_file.touch()
    mesh_file = Path(ws.mesh_path) / "mesh.msh"
    mesh_file.touch()

    # Run with a short timeout of 1 second
    user_settings = {"timeout_seconds": 1.0}

    with pytest.raises(RunnerTimeoutError) as exc:
        await runner.run_simulation(sim_id, np=1, user_settings=user_settings)
    assert "timed out after" in str(exc.value)

    # Verify workspace state is updated to FAILED
    ws_meta = workspace_manager.get_workspace(sim_id)
    assert ws_meta.status == WorkspaceState.FAILED
    assert "Simulation timed out" in ws_meta.error_message

    # Verify metadata record shows timeout
    logs_dir = Path(ws.log_path)
    with open(logs_dir / METADATA_FILENAME, "r") as f:
        meta_data = json.load(f)
    assert meta_data["termination_reason"] == "timeout"


@pytest.mark.asyncio
async def test_cancellation_execution(
    workspace_manager: WorkspaceManager,
    dummy_hanging_script: Path
):
    """Verify that calling cancel_simulation terminates the subprocess and raises RunnerCancelledError."""
    runner = PalaceRunner(
        workspace_manager=workspace_manager,
        palace_path=str(dummy_hanging_script)
    )
    sim_id = str(uuid.uuid4())
    ws = workspace_manager.create_workspace(sim_id)

    config_file = Path(ws.config_path) / "config.json"
    config_file.touch()
    mesh_file = Path(ws.mesh_path) / "mesh.msh"
    mesh_file.touch()

    # Define a task to run the simulation
    run_task = asyncio.create_task(runner.run_simulation(sim_id))

    # Wait briefly for process to start
    await asyncio.sleep(0.3)

    # Cancel the running simulation
    await runner.cancel_simulation(sim_id)

    # Wait for task to finish (should raise RunnerCancelledError)
    with pytest.raises(RunnerCancelledError):
        await run_task

    # Verify workspace state updated to FAILED with cancel message
    ws_meta = workspace_manager.get_workspace(sim_id)
    assert ws_meta.status == WorkspaceState.FAILED
    assert "cancelled by user" in ws_meta.error_message

    # Verify metadata shows cancelled
    logs_dir = Path(ws.log_path)
    with open(logs_dir / METADATA_FILENAME, "r") as f:
        meta_data = json.load(f)
    assert meta_data["termination_reason"] == "cancelled"


# --- Integration Tests ---

@pytest.mark.asyncio
async def test_real_palace_detection_and_validation(workspace_manager: WorkspaceManager):
    """Verify that the real Palace Spack/PATH installation is successfully located and validated."""
    runner = PalaceRunner(workspace_manager=workspace_manager)
    
    try:
        path = runner._detect_palace_executable({})
        assert Path(path).exists()
        assert os.access(path, os.X_OK)
        
        # Verify version query works
        ver = runner._get_palace_version(path)
        assert ver != "unknown"
        print(f"\n[INTEGRATION] Detected Real Palace Executable: {path} (Version: {ver})")
    except PalaceExecutableNotFoundError:
        pytest.skip("Palace executable not found in PATH or Spack. Skipping integration detection test.")
