"""Core Workspace Manager service for Quantum Studio simulations."""

from __future__ import annotations

import logging
import os
import shutil
import uuid
import zipfile
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Optional

from app.config import settings
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
    REQUIRED_SUBDIRS,
)
from app.simulation.workspace.exceptions import (
    WorkspaceAlreadyExistsError,
    WorkspaceCleanupError,
    WorkspaceMetadataError,
    WorkspaceNotFoundError,
    WorkspacePermissionError,
    WorkspaceValidationError,
)
from app.simulation.workspace.types import WorkspaceState
from app.simulation.workspace.workspace_models import WorkspaceMetadata
from app.simulation.workspace.workspace_utils import (
    generate_workspace_id,
    is_safe_path,
    normalize_path,
    read_json,
    safe_delete,
    safe_mkdir,
    timestamp_now,
    write_json_atomic,
)

logger = logging.getLogger(__name__)


class WorkspaceManager:
    """Manages the lifecycle, sandboxing, metadata, and cleanup of simulation workspaces."""

    def __init__(
        self,
        workspace_root: Optional[str | Path] = None,
        archive_dir: Optional[str | Path] = None,
        max_workspace_count: Optional[int] = None,
        cleanup_timeout_seconds: Optional[float] = None,
    ) -> None:
        """Initialize the Workspace Manager.

        Args:
            workspace_root: Directory where workspaces are created. Defaults to settings.workspace_root.
            archive_dir: Directory where archives are saved. Defaults to settings.workspace_archive_dir.
            max_workspace_count: Maximum allowed active workspaces. Defaults to settings.workspace_max_count.
            cleanup_timeout_seconds: Default expiration duration. Defaults to settings.workspace_cleanup_timeout_seconds.
        """
        # Resolve paths relative to the backend project directory if they are relative paths
        backend_dir = Path(__file__).resolve().parents[3]
        
        # 1. Resolve workspace root
        root_path = workspace_root or settings.workspace_root
        self.workspace_root = normalize_path(
            root_path if Path(root_path).is_absolute() else backend_dir / root_path
        )
        
        # 2. Resolve archive directory
        arch_path = archive_dir or settings.workspace_archive_dir
        self.archive_dir = normalize_path(
            arch_path if Path(arch_path).is_absolute() else backend_dir / arch_path
        )
        
        self.max_workspace_count = max_workspace_count or settings.workspace_max_count
        self.cleanup_timeout_seconds = cleanup_timeout_seconds or settings.workspace_cleanup_timeout_seconds

        # Pre-flight creation of root and archive directories
        safe_mkdir(self.workspace_root)
        safe_mkdir(self.archive_dir)

        logger.info(
            "WorkspaceManager initialized. Root: %s, Archive: %s, Max Workspaces: %d",
            self.workspace_root,
            self.archive_dir,
            self.max_workspace_count,
        )

    def create_workspace(
        self,
        simulation_id: str,
        owner_id: Optional[str] = None,
        retention_days: Optional[int] = None,
    ) -> WorkspaceMetadata:
        """Create and initialize a new sandboxed workspace for a simulation.

        This method is thread-safe and process-safe, utilizing atomic directory creation
        (`exist_ok=False`) to prevent race conditions during concurrent runs.

        Args:
            simulation_id: The UUID of the simulation.
            owner_id: Optional ID of the user owning this simulation.
            retention_days: Number of days before the workspace expires. Defaults to settings.workspace_retention_days.

        Returns:
            The initialized WorkspaceMetadata model.

        Raises:
            WorkspaceAlreadyExistsError: If the workspace folder already exists.
            WorkspacePermissionError: If directories cannot be created due to permissions.
            WorkspaceValidationError: If the simulation ID is invalid.
        """
        # Validate simulation_id is a valid UUID
        try:
            uuid.UUID(simulation_id)
        except ValueError:
            raise WorkspaceValidationError(f"Invalid simulation_id UUID format: '{simulation_id}'")

        workspace_id = generate_workspace_id(simulation_id)
        workspace_path = self.workspace_root / workspace_id

        logger.info("Attempting to create workspace: %s", workspace_id)

        # 1. Atomic folder creation to prevent race conditions in concurrent environments
        try:
            workspace_path.mkdir(parents=False, exist_ok=False)
            os.chmod(workspace_path, 0o700)  # Restrict permissions immediately
        except FileExistsError:
            logger.warning("Workspace directory already exists. Purging and recreating: %s", workspace_path)
            try:
                shutil.rmtree(workspace_path, ignore_errors=True)
                workspace_path.mkdir(parents=False, exist_ok=False)
                os.chmod(workspace_path, 0o700)
            except Exception as e:
                raise WorkspaceAlreadyExistsError(
                    f"Workspace directory already exists: '{workspace_path}' and could not be purged: {e}"
                )
        except PermissionError as e:
            raise WorkspacePermissionError(
                f"Permission denied creating workspace directory '{workspace_path}': {e}"
            )
        except Exception as e:
            raise WorkspacePermissionError(
                f"Failed to create workspace directory '{workspace_path}': {e}"
            )

        # 2. Create subdirectories securely
        try:
            for subdir in REQUIRED_SUBDIRS:
                sub_path = workspace_path / subdir
                safe_mkdir(sub_path, mode=0o700)
        except Exception as e:
            # Clean up partial directory if creation fails
            shutil.rmtree(workspace_path, ignore_errors=True)
            raise e

        # 3. Compute expiration time
        ret_days = retention_days if retention_days is not None else settings.workspace_retention_days
        now_dt = datetime.utcnow()
        cleanup_dt = now_dt + timedelta(days=ret_days)
        
        # 4. Initialize metadata Pydantic model
        now_str = timestamp_now()
        metadata = WorkspaceMetadata(
            workspace_id=workspace_id,
            simulation_id=simulation_id,
            status=WorkspaceState.CREATED,
            created_at=now_str,
            updated_at=now_str,
            owner_id=owner_id,
            root_path=str(workspace_path),
            config_path=str(workspace_path / DIR_CONFIG),
            geometry_path=str(workspace_path / DIR_GEOMETRY),
            mesh_path=str(workspace_path / DIR_MESH),
            output_path=str(workspace_path / DIR_OUTPUT),
            log_path=str(workspace_path / DIR_LOGS),
            visualization_path=str(workspace_path / DIR_VISUALIZATION),
            temp_path=str(workspace_path / DIR_TEMP),
            cleanup_after=cleanup_dt.isoformat() + "Z",
        )

        # 5. Save metadata atomically to workspace.json
        metadata_file = workspace_path / METADATA_FILENAME
        self.save_workspace_metadata(metadata)

        logger.info("Workspace %s successfully created and initialized.", workspace_id)
        
        # Transition state to READY as folders and metadata are fully initialized
        return self.update_workspace_status(simulation_id, WorkspaceState.READY)

    def delete_workspace(self, simulation_id: str) -> None:
        """Securely delete a workspace and all its contents from disk.

        Args:
            simulation_id: The UUID of the simulation.

        Raises:
            WorkspaceNotFoundError: If the workspace does not exist on disk.
            WorkspaceValidationError: If path traversal or directory escape is detected.
        """
        workspace_id = generate_workspace_id(simulation_id)
        workspace_path = self.workspace_root / workspace_id

        if not workspace_path.exists():
            raise WorkspaceNotFoundError(f"Workspace '{workspace_id}' not found at: '{workspace_path}'")

        logger.warning("Deleting workspace: %s", workspace_id)
        
        # Enforce path traversal protection using safe_delete helper
        safe_delete(workspace_path, self.workspace_root)
        logger.info("Workspace %s successfully deleted.", workspace_id)

    def cleanup_workspace(self, simulation_id: str, partial: bool = False) -> None:
        """Clean up a workspace, either deleting large ephemeral files or purging the entire directory.

        Args:
            simulation_id: The UUID of the simulation.
            partial: If True, keep configuration, results, and logs, but purge geometry, mesh, and temp files
                     to save disk space. If False, delete the entire workspace folder.

        Raises:
            WorkspaceNotFoundError: If the workspace does not exist.
        """
        workspace_id = generate_workspace_id(simulation_id)
        workspace_path = self.workspace_root / workspace_id

        if not workspace_path.exists():
            raise WorkspaceNotFoundError(f"Workspace '{workspace_id}' not found.")

        if not partial:
            self.delete_workspace(simulation_id)
            return

        logger.info("Performing partial cleanup of workspace: %s", workspace_id)
        
        # Paths to purge under partial cleanup
        paths_to_purge = [
            workspace_path / DIR_GEOMETRY,
            workspace_path / DIR_MESH,
            workspace_path / DIR_TEMP,
        ]

        try:
            for path in paths_to_purge:
                if path.exists():
                    safe_delete(path, workspace_path)
                    # Recreate empty folder to maintain structure
                    safe_mkdir(path, mode=0o700)
            
            # Update state to CLEANED
            self.update_workspace_status(simulation_id, WorkspaceState.CLEANED)
            logger.info("Partial cleanup of workspace %s completed successfully.", workspace_id)
        except Exception as e:
            logger.error("Failed to perform partial cleanup of workspace %s: %s", workspace_id, e)
            raise WorkspaceCleanupError(f"Partial cleanup failed for workspace '{workspace_id}': {e}") from e

    def validate_workspace(self, simulation_id: str) -> bool:
        """Validate that a workspace exists, has the correct structure, and contains valid metadata.

        Args:
            simulation_id: The UUID of the simulation.

        Returns:
            True if the workspace is structurally and logically valid.

        Raises:
            WorkspaceValidationError: If any directories are missing, metadata is corrupted,
                                     or permissions are invalid.
            WorkspaceNotFoundError: If the workspace folder does not exist.
        """
        workspace_id = generate_workspace_id(simulation_id)
        workspace_path = self.workspace_root / workspace_id

        if not workspace_path.exists():
            raise WorkspaceNotFoundError(f"Workspace directory '{workspace_id}' does not exist.")

        # 1. Check required subdirectories exist
        for subdir in REQUIRED_SUBDIRS:
            subdir_path = workspace_path / subdir
            if not subdir_path.exists() or not subdir_path.is_dir():
                raise WorkspaceValidationError(
                    f"Workspace validation failed: Required subdirectory '{subdir}' is missing or is not a directory."
                )

        # 2. Check metadata file exists
        metadata_file = workspace_path / METADATA_FILENAME
        if not metadata_file.exists() or not metadata_file.is_file():
            raise WorkspaceValidationError(
                f"Workspace validation failed: Metadata file '{METADATA_FILENAME}' is missing."
            )

        # 3. Check read/write permissions
        if not os.access(workspace_path, os.R_OK | os.W_OK):
            raise WorkspacePermissionError(
                f"Workspace validation failed: Insufficient read/write permissions on '{workspace_path}'"
            )

        # 4. Load and validate metadata schema
        try:
            self.load_workspace_metadata(simulation_id)
        except Exception as e:
            raise WorkspaceValidationError(
                f"Workspace validation failed: Metadata file '{METADATA_FILENAME}' is corrupted: {e}"
            ) from e

        return True

    def workspace_exists(self, simulation_id: str) -> bool:
        """Check if a workspace exists on disk.

        Args:
            simulation_id: The UUID of the simulation.

        Returns:
            True if the workspace root folder exists, False otherwise.
        """
        workspace_id = generate_workspace_id(simulation_id)
        return (self.workspace_root / workspace_id).exists()

    def get_workspace(self, simulation_id: str) -> WorkspaceMetadata:
        """Retrieve the metadata for a workspace.

        Args:
            simulation_id: The UUID of the simulation.

        Returns:
            The loaded WorkspaceMetadata.

        Raises:
            WorkspaceNotFoundError: If the workspace does not exist.
        """
        if not self.workspace_exists(simulation_id):
            raise WorkspaceNotFoundError(f"No workspace found for simulation ID '{simulation_id}'")
        return self.load_workspace_metadata(simulation_id)

    def load_workspace_metadata(self, simulation_id: str) -> WorkspaceMetadata:
        """Load and parse the workspace.json metadata file.

        Args:
            simulation_id: The UUID of the simulation.

        Returns:
            The parsed WorkspaceMetadata model.

        Raises:
            WorkspaceMetadataError: If loading or parsing fails.
        """
        workspace_id = generate_workspace_id(simulation_id)
        metadata_file = self.workspace_root / workspace_id / METADATA_FILENAME
        
        try:
            data = read_json(metadata_file)
            return WorkspaceMetadata.model_validate(data)
        except Exception as e:
            raise WorkspaceMetadataError(
                f"Failed to load metadata for workspace '{workspace_id}': {e}"
            ) from e

    def save_workspace_metadata(self, metadata: WorkspaceMetadata) -> None:
        """Save a WorkspaceMetadata model atomically to workspace.json.

        Args:
            metadata: The metadata model to save.

        Raises:
            WorkspaceMetadataError: If writing to disk fails.
        """
        workspace_path = Path(metadata.root_path)
        metadata_file = workspace_path / METADATA_FILENAME
        
        try:
            # Enforce path traversal protection on save location
            if not is_safe_path(metadata_file, self.workspace_root):
                raise WorkspaceValidationError(
                    f"Security violation: Attempted to save metadata outside of workspace root limit."
                )
            
            write_json_atomic(metadata_file, metadata.model_dump())
        except Exception as e:
            raise WorkspaceMetadataError(
                f"Failed to save metadata for workspace '{metadata.workspace_id}': {e}"
            ) from e

    def update_workspace_status(
        self,
        simulation_id: str,
        status: WorkspaceState,
        error_message: Optional[str] = None,
    ) -> WorkspaceMetadata:
        """Update the operational status of a workspace.

        Args:
            simulation_id: The UUID of the simulation.
            status: The new WorkspaceState.
            error_message: Optional error description (for FAILED status).

        Returns:
            The updated WorkspaceMetadata.
        """
        metadata = self.load_workspace_metadata(simulation_id)
        metadata.status = status
        metadata.updated_at = timestamp_now()
        if error_message:
            metadata.error_message = error_message
            
        self.save_workspace_metadata(metadata)
        logger.info("Workspace %s status updated to %s", metadata.workspace_id, status.value)
        return metadata

    def touch_workspace(self, simulation_id: str) -> None:
        """Update the updated_at timestamp in metadata and touch the file system mtime of workspace.json.

        Args:
            simulation_id: The UUID of the simulation.
        """
        metadata = self.load_workspace_metadata(simulation_id)
        metadata.updated_at = timestamp_now()
        self.save_workspace_metadata(metadata)
        
        # Touch file system modified time
        workspace_id = generate_workspace_id(simulation_id)
        metadata_file = self.workspace_root / workspace_id / METADATA_FILENAME
        try:
            os.utime(metadata_file, None)
        except Exception as e:
            logger.warning("Failed to touch file mtime for %s: %s", metadata_file, e)

    def archive_workspace(self, simulation_id: str) -> Path:
        """Compress the workspace, save the archive to outputs/simulations/, and delete the workspace.

        Large mesh, geometry, and temp directories are skipped in the archive to minimize
        size, zipping only config, outputs, logs, and metadata.

        Args:
            simulation_id: The UUID of the simulation.

        Returns:
            The absolute path of the generated ZIP archive.

        Raises:
            WorkspaceNotFoundError: If the workspace is missing.
            WorkspaceCleanupError: If compression or cleanup fails.
        """
        workspace_id = generate_workspace_id(simulation_id)
        workspace_path = self.workspace_root / workspace_id
        
        if not workspace_path.exists():
            raise WorkspaceNotFoundError(f"Workspace '{workspace_id}' not found for archiving.")

        # Update status to ARCHIVED before starting compression
        self.update_workspace_status(simulation_id, WorkspaceState.ARCHIVED)
        metadata = self.load_workspace_metadata(simulation_id)

        archive_filename = f"{workspace_id}_archive.zip"
        archive_path = self.archive_dir / archive_filename

        logger.info("Archiving workspace %s to %s", workspace_id, archive_path)

        try:
            with zipfile.ZipFile(archive_path, "w", zipfile.ZIP_DEFLATED) as zipf:
                # Iterate through files, skipping large ephemeral folders (geometry, mesh, temp)
                skipped_folders = {DIR_GEOMETRY, DIR_MESH, DIR_TEMP}
                
                for root, dirs, files in os.walk(workspace_path):
                    # Modify dirs in-place to prevent os.walk from traversing into skipped folders
                    dirs[:] = [d for d in dirs if d not in skipped_folders]
                    
                    for file in files:
                        file_path = Path(root) / file
                        # Calculate path relative to workspace root for clean archive structure
                        archive_name = file_path.relative_to(workspace_path)
                        zipf.write(file_path, arcname=str(archive_name))
                        
            logger.info("Archive zip successfully created. Deleting original directory...")
            # Perform complete disk cleanup of the workspace directory
            self.delete_workspace(simulation_id)
            
            return archive_path
        except Exception as e:
            # Delete corrupted zip if archive failed
            if archive_path.exists():
                try:
                    archive_path.unlink()
                except Exception:
                    pass
            logger.error("Failed to archive workspace %s: %s", workspace_id, e)
            raise WorkspaceCleanupError(f"Archiving failed for workspace '{workspace_id}': {e}") from e

    def list_workspaces(self) -> List[WorkspaceMetadata]:
        """Scan the workspace root and return loaded metadata for all valid simulation workspaces.

        Returns:
            A list of WorkspaceMetadata objects.
        """
        workspaces = []
        if not self.workspace_root.exists():
            return workspaces

        for entry in self.workspace_root.iterdir():
            if entry.is_dir() and entry.name.startswith("simulation_"):
                # Extract simulation UUID from workspace ID
                clean_uuid = entry.name.replace("simulation_", "")
                # Reconstruct UUID format (8-4-4-4-12) if it matches UUID length (32 chars)
                if len(clean_uuid) == 32:
                    formatted_uuid = (
                        f"{clean_uuid[0:8]}-{clean_uuid[8:12]}-{clean_uuid[12:16]}-"
                        f"{clean_uuid[16:20]}-{clean_uuid[20:32]}"
                    )
                else:
                    formatted_uuid = clean_uuid

                try:
                    metadata = self.load_workspace_metadata(formatted_uuid)
                    workspaces.append(metadata)
                except Exception:
                    # Log warning but continue scanning; do not block list on a single corrupted run
                    logger.warning("Skipped loading metadata for corrupted workspace: %s", entry.name)

        return workspaces
