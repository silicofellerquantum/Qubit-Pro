"""Comprehensive unit tests for the Simulation Workspace Manager."""

from __future__ import annotations

import json
import os
import shutil
import tempfile
import threading
import time
import uuid
from datetime import datetime, timedelta
from pathlib import Path
import pytest

from app.simulation.workspace import (
    WorkspaceAlreadyExistsError,
    WorkspaceError,
    WorkspaceManager,
    WorkspaceMetadata,
    WorkspaceNotFoundError,
    WorkspaceState,
    WorkspaceValidationError,
    cleanup_expired_workspaces,
    generate_workspace_id,
    is_safe_path,
    normalize_path,
)
from app.simulation.workspace.constants import (
    DIR_CONFIG,
    DIR_GEOMETRY,
    DIR_LOGS,
    DIR_MESH,
    DIR_METADATA,
    DIR_OUTPUT,
    DIR_TEMP,
    DIR_VISUALIZATION,
    METADATA_FILENAME,
)


@pytest.fixture
def temp_workspace_root():
    """Create a temporary directory for workspace roots, cleaned up after tests."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        yield Path(tmp_dir)


@pytest.fixture
def temp_archive_dir():
    """Create a temporary directory for archives, cleaned up after tests."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        yield Path(tmp_dir)


@pytest.fixture
def workspace_manager(temp_workspace_root, temp_archive_dir):
    """Provide a WorkspaceManager configured with temporary directories."""
    return WorkspaceManager(
        workspace_root=temp_workspace_root,
        archive_dir=temp_archive_dir,
        max_workspace_count=50,
        cleanup_timeout_seconds=3600.0,
    )


def test_create_workspace_success(workspace_manager, temp_workspace_root):
    """Verify that a workspace is successfully created with correct directories and metadata."""
    simulation_id = str(uuid.uuid4())
    metadata = workspace_manager.create_workspace(
        simulation_id=simulation_id, owner_id="test_owner", retention_days=3
    )

    # 1. Verify returned metadata
    assert isinstance(metadata, WorkspaceMetadata)
    assert metadata.simulation_id == simulation_id
    assert metadata.status == WorkspaceState.READY
    assert metadata.owner_id == "test_owner"
    assert metadata.workspace_version == "1.0.0"

    # 2. Verify directories exist on disk
    workspace_path = temp_workspace_root / generate_workspace_id(simulation_id)
    assert workspace_path.exists()
    assert workspace_path.is_dir()

    # Check required subdirectories
    subdirs = [DIR_CONFIG, DIR_GEOMETRY, DIR_MESH, DIR_OUTPUT, DIR_VISUALIZATION, DIR_LOGS, DIR_METADATA, DIR_TEMP]
    for subdir in subdirs:
        assert (workspace_path / subdir).exists()
        assert (workspace_path / subdir).is_dir()

    # 3. Verify metadata file on disk
    metadata_file = workspace_path / METADATA_FILENAME
    assert metadata_file.exists()
    assert metadata_file.is_file()

    # Check that permissions are restricted (0700 for dirs, 0600 for file on POSIX)
    if os.name == "posix":
        assert (workspace_path.stat().st_mode & 0o777) == 0o700
        assert (metadata_file.stat().st_mode & 0o777) == 0o600

    # Read and parse file metadata
    with open(metadata_file, "r", encoding="utf-8") as f:
        disk_data = json.load(f)
    assert disk_data["simulation_id"] == simulation_id
    assert disk_data["status"] == "READY"


def test_create_workspace_invalid_uuid(workspace_manager):
    """Verify that creating a workspace with an invalid UUID raises a WorkspaceValidationError."""
    with pytest.raises(WorkspaceValidationError) as excinfo:
        workspace_manager.create_workspace(simulation_id="invalid-uuid-1234")
    assert "Invalid simulation_id UUID format" in str(excinfo.value)


def test_create_workspace_duplicate(workspace_manager):
    """Verify that trying to create a duplicate workspace raises a WorkspaceAlreadyExistsError when it cannot be purged."""
    simulation_id = str(uuid.uuid4())
    
    # First creation should succeed
    workspace_manager.create_workspace(simulation_id=simulation_id)
    
    # Second creation should fail if purging raises an exception
    from unittest.mock import patch
    with patch("shutil.rmtree", side_effect=PermissionError("Mocked permission error")):
        with pytest.raises(WorkspaceAlreadyExistsError) as excinfo:
            workspace_manager.create_workspace(simulation_id=simulation_id)
        assert "could not be purged" in str(excinfo.value)


def test_validate_workspace_success(workspace_manager):
    """Verify that a healthy workspace passes validation."""
    simulation_id = str(uuid.uuid4())
    workspace_manager.create_workspace(simulation_id=simulation_id)
    
    # Validation should return True
    assert workspace_manager.validate_workspace(simulation_id) is True


def test_validate_workspace_missing_dir(workspace_manager, temp_workspace_root):
    """Verify that a workspace with a missing required subdirectory fails validation."""
    simulation_id = str(uuid.uuid4())
    workspace_manager.create_workspace(simulation_id=simulation_id)
    
    # Intentionally delete one required directory
    workspace_id = generate_workspace_id(simulation_id)
    mesh_dir = temp_workspace_root / workspace_id / DIR_MESH
    shutil.rmtree(mesh_dir)

    with pytest.raises(WorkspaceValidationError) as excinfo:
        workspace_manager.validate_workspace(simulation_id)
    assert "Required subdirectory 'mesh' is missing" in str(excinfo.value)


def test_validate_workspace_missing_metadata(workspace_manager, temp_workspace_root):
    """Verify that a workspace with a missing metadata file fails validation."""
    simulation_id = str(uuid.uuid4())
    workspace_manager.create_workspace(simulation_id=simulation_id)
    
    # Delete metadata file
    workspace_id = generate_workspace_id(simulation_id)
    metadata_file = temp_workspace_root / workspace_id / METADATA_FILENAME
    metadata_file.unlink()

    with pytest.raises(WorkspaceValidationError) as excinfo:
        workspace_manager.validate_workspace(simulation_id)
    assert "Metadata file 'workspace.json' is missing" in str(excinfo.value)


def test_validate_workspace_corrupted_metadata(workspace_manager, temp_workspace_root):
    """Verify that a workspace with corrupted/invalid JSON in metadata fails validation."""
    simulation_id = str(uuid.uuid4())
    workspace_manager.create_workspace(simulation_id=simulation_id)
    
    # Corrupt the metadata file by writing invalid JSON
    workspace_id = generate_workspace_id(simulation_id)
    metadata_file = temp_workspace_root / workspace_id / METADATA_FILENAME
    with open(metadata_file, "w", encoding="utf-8") as f:
        f.write("{invalid-json-corrupted")

    with pytest.raises(WorkspaceValidationError) as excinfo:
        workspace_manager.validate_workspace(simulation_id)
    assert "Metadata file 'workspace.json' is corrupted" in str(excinfo.value)


def test_delete_workspace(workspace_manager, temp_workspace_root):
    """Verify that a workspace is completely deleted from disk."""
    simulation_id = str(uuid.uuid4())
    workspace_manager.create_workspace(simulation_id=simulation_id)
    
    workspace_id = generate_workspace_id(simulation_id)
    workspace_path = temp_workspace_root / workspace_id
    assert workspace_path.exists()

    # Delete workspace
    workspace_manager.delete_workspace(simulation_id)
    assert not workspace_path.exists()


def test_delete_non_existent_workspace_raises(workspace_manager):
    """Verify that deleting a non-existent workspace raises WorkspaceNotFoundError."""
    simulation_id = str(uuid.uuid4())
    with pytest.raises(WorkspaceNotFoundError):
        workspace_manager.delete_workspace(simulation_id)


def test_partial_cleanup(workspace_manager, temp_workspace_root):
    """Verify that partial cleanup purges mesh/geo/temp but retains output/logs/metadata."""
    simulation_id = str(uuid.uuid4())
    workspace_manager.create_workspace(simulation_id=simulation_id)
    
    workspace_id = generate_workspace_id(simulation_id)
    workspace_path = temp_workspace_root / workspace_id

    # Create dummy files in folders
    with open(workspace_path / DIR_GEOMETRY / "geometry.step", "w") as f:
        f.write("dummy step")
    with open(workspace_path / DIR_MESH / "mesh.msh", "w") as f:
        f.write("dummy mesh")
    with open(workspace_path / DIR_OUTPUT / "results.csv", "w") as f:
        f.write("dummy results")

    # Run partial cleanup
    workspace_manager.cleanup_workspace(simulation_id, partial=True)

    # Ephemeral files should be purged (but directories remain)
    assert (workspace_path / DIR_GEOMETRY).exists()
    assert not (workspace_path / DIR_GEOMETRY / "geometry.step").exists()
    assert (workspace_path / DIR_MESH).exists()
    assert not (workspace_path / DIR_MESH / "mesh.msh").exists()

    # Permanent files should remain
    assert (workspace_path / DIR_OUTPUT / "results.csv").exists()
    assert (workspace_path / METADATA_FILENAME).exists()

    # State should be updated to CLEANED
    metadata = workspace_manager.load_workspace_metadata(simulation_id)
    assert metadata.status == WorkspaceState.CLEANED


def test_archive_workspace(workspace_manager, temp_workspace_root, temp_archive_dir):
    """Verify that archiving zips results, cleans the workspace directory, and creates archive ZIP."""
    simulation_id = str(uuid.uuid4())
    workspace_manager.create_workspace(simulation_id=simulation_id)
    
    workspace_id = generate_workspace_id(simulation_id)
    workspace_path = temp_workspace_root / workspace_id

    # Create dummy files
    with open(workspace_path / DIR_OUTPUT / "results.csv", "w") as f:
        f.write("dummy matrix results")
    with open(workspace_path / DIR_LOGS / "palace.log", "w") as f:
        f.write("dummy log file")
    with open(workspace_path / DIR_GEOMETRY / "geometry.step", "w") as f:
        f.write("large step model to skip")

    # Archive workspace
    archive_zip = workspace_manager.archive_workspace(simulation_id)

    # 1. Verify zip file exists in archive directory
    assert archive_zip.exists()
    assert archive_zip == temp_archive_dir / f"{workspace_id}_archive.zip"

    # 2. Verify original workspace directory is deleted
    assert not workspace_path.exists()

    # 3. Verify archive contents (skipping geometry, mesh, temp)
    import zipfile
    with zipfile.ZipFile(archive_zip, "r") as zipf:
        namelist = zipf.namelist()
        
        # Output and logs should be present
        assert f"{DIR_OUTPUT}/results.csv" in namelist
        assert f"{DIR_LOGS}/palace.log" in namelist
        assert METADATA_FILENAME in namelist
        
        # Ephemeral folders like geometry should be skipped
        assert f"{DIR_GEOMETRY}/geometry.step" not in namelist


def test_cleanup_expired_workspaces(workspace_manager, temp_workspace_root):
    """Verify that automated sweeps clean up expired workspaces and protect active IN_USE ones."""
    # 1. Create an expired workspace (cleanup_after is in the past)
    sim_expired = str(uuid.uuid4())
    ws_expired = workspace_manager.create_workspace(sim_expired)
    # Set cleanup_after to yesterday
    ws_expired.cleanup_after = (datetime.utcnow() - timedelta(days=1)).isoformat() + "Z"
    workspace_manager.save_workspace_metadata(ws_expired)

    # 2. Create an expired workspace that is actively IN_USE (should NOT be cleaned up)
    sim_active = str(uuid.uuid4())
    ws_active = workspace_manager.create_workspace(sim_active)
    ws_active.cleanup_after = (datetime.utcnow() - timedelta(days=1)).isoformat() + "Z"
    workspace_manager.save_workspace_metadata(ws_active)
    workspace_manager.update_workspace_status(sim_active, WorkspaceState.IN_USE)

    # 3. Create a future workspace (not expired yet)
    sim_future = str(uuid.uuid4())
    ws_future = workspace_manager.create_workspace(sim_future)
    ws_future.cleanup_after = (datetime.utcnow() + timedelta(days=5)).isoformat() + "Z"
    workspace_manager.save_workspace_metadata(ws_future)

    # Run automated cleanup sweep (disable archive settings to delete them directly)
    import app.simulation.workspace.cleanup
    from unittest.mock import patch
    
    # We will patch settings.keep_simulation_artifacts to False to trigger delete
    with patch("app.simulation.workspace.cleanup.settings.keep_simulation_artifacts", False):
        cleaned_count = cleanup_expired_workspaces(workspace_manager)

    # Assertions
    assert cleaned_count == 1  # Only the expired, non-active workspace should be cleaned up
    
    # Expired should be deleted
    assert not workspace_manager.workspace_exists(sim_expired)
    
    # Active and Future should remain intact
    assert workspace_manager.workspace_exists(sim_active)
    assert workspace_manager.workspace_exists(sim_future)


def test_path_traversal_prevention(workspace_manager, temp_workspace_root):
    """Verify that the path traversal checks reject attempts to operate outside the workspace root."""
    simulation_id = str(uuid.uuid4())
    workspace_manager.create_workspace(simulation_id=simulation_id)
    workspace_id = generate_workspace_id(simulation_id)

    # Try to validate/delete paths that climb out of the workspace root directory using ".."
    unsafe_path = temp_workspace_root / workspace_id / "../../../etc/passwd"
    
    # The absolute normalized path is outside the workspace root
    assert not is_safe_path(unsafe_path, temp_workspace_root / workspace_id)

    # Attempting safe_delete on an unsafe path should raise a WorkspaceValidationError
    from app.simulation.workspace.workspace_utils import safe_delete
    with pytest.raises(WorkspaceValidationError) as excinfo:
        safe_delete(unsafe_path, temp_workspace_root / workspace_id)
    assert "Security violation" in str(excinfo.value)


def test_concurrent_workspace_creation(workspace_manager):
    """Verify that creating workspaces concurrently across threads is safe and causes no collisions."""
    num_threads = 10
    sim_ids = [str(uuid.uuid4()) for _ in range(num_threads)]
    errors = []

    def create_job(sim_id):
        try:
            metadata = workspace_manager.create_workspace(simulation_id=sim_id)
            # Verify structure is correct immediately
            workspace_manager.validate_workspace(sim_id)
            assert metadata.status == WorkspaceState.READY
        except Exception as e:
            errors.append(e)

    threads = []
    for s_id in sim_ids:
        t = threading.Thread(target=create_job, args=(s_id,))
        threads.append(t)
        t.start()

    for t in threads:
        t.join()

    # Check that absolutely no threads encountered race conditions or errors
    assert len(errors) == 0
    
    # Verify all workspaces exist
    for s_id in sim_ids:
        assert workspace_manager.workspace_exists(s_id) is True
