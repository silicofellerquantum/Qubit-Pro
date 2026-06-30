"""Utility functions for the simulation workspace manager."""

from __future__ import annotations

import json
import os
import shutil
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any, Dict

from app.simulation.workspace.exceptions import (
    WorkspacePermissionError,
    WorkspaceValidationError,
)

def generate_workspace_id(simulation_id: str) -> str:
    """Generate a standardized workspace ID from a simulation UUID.
    
    Args:
        simulation_id: The UUID of the simulation.
        
    Returns:
        A string key like 'simulation_f81d4fae7dec11d0a76500a0c91e6bf6'.
    """
    clean_id = simulation_id.replace("-", "").lower()
    return f"simulation_{clean_id}"


def normalize_path(path: str | Path) -> Path:
    """Resolve a path to its absolute, real path.
    
    Args:
        path: The path to normalize.
        
    Returns:
        A normalized Path object.
    """
    return Path(path).resolve()


def is_safe_path(target_path: Path, root_limit: Path) -> bool:
    """Verify that a target path lies strictly within a root directory.
    
    This protects against path traversal and symbolic link attacks by fully
    resolving symlinks before performing the check.
    
    Args:
        target_path: The path to validate.
        root_limit: The maximum allowed parent directory.
        
    Returns:
        True if the path is safe, False otherwise.
    """
    try:
        resolved_target = normalize_path(target_path)
        resolved_root = normalize_path(root_limit)
        
        # Check if the target is equal to or a child of the root limit
        return resolved_target == resolved_root or resolved_target.is_relative_to(resolved_root)
    except Exception:
        return False


def safe_delete(target_path: Path, root_limit: Path) -> None:
    """Securely delete a file or directory on disk with path traversal protection.
    
    Args:
        target_path: The file or folder to delete.
        root_limit: The folder inside which deletion is allowed.
        
    Raises:
        WorkspaceValidationError: If a path traversal or directory escape is detected.
        WorkspacePermissionError: If the delete operation fails due to permissions.
    """
    if not target_path.exists():
        return

    # Fully resolve paths to block symlink attacks
    resolved_target = normalize_path(target_path)
    resolved_root = normalize_path(root_limit)

    if not is_safe_path(resolved_target, resolved_root):
        raise WorkspaceValidationError(
            f"Security violation: Attempted deletion of path '{target_path}' "
            f"outside of allowed root limit '{root_limit}'."
        )

    # Protect against accidental deletion of the root limit itself
    if resolved_target == resolved_root:
        raise WorkspaceValidationError(
            f"Security violation: Attempted deletion of the workspace root limit itself: '{resolved_root}'"
        )

    try:
        if resolved_target.is_dir():
            shutil.rmtree(resolved_target)
        else:
            resolved_target.unlink()
    except PermissionError as e:
        raise WorkspacePermissionError(f"Permission denied while deleting '{resolved_target}': {e}")
    except Exception as e:
        raise WorkspacePermissionError(f"Failed to delete '{resolved_target}': {e}")


def safe_mkdir(target_path: Path, mode: int = 0o700) -> None:
    """Create a directory with strict UNIX permissions.
    
    Args:
        target_path: The path to create.
        mode: The UNIX permissions (default 0700: owner read/write/execute).
        
    Raises:
        WorkspacePermissionError: If creation fails due to permissions.
    """
    try:
        target_path.mkdir(parents=True, exist_ok=True)
        # Apply strict permissions
        os.chmod(target_path, mode)
    except PermissionError as e:
        raise WorkspacePermissionError(f"Permission denied creating directory '{target_path}': {e}")
    except Exception as e:
        raise WorkspacePermissionError(f"Failed to create directory '{target_path}': {e}")


def read_json(file_path: Path) -> Dict[str, Any]:
    """Read and parse a JSON file securely.
    
    Args:
        file_path: The path to the JSON file.
        
    Returns:
        A dictionary containing the parsed JSON data.
        
    Raises:
        WorkspaceValidationError: If the file does not exist or is corrupted.
    """
    if not file_path.exists():
        raise WorkspaceValidationError(f"JSON file does not exist: {file_path}")
        
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except json.JSONDecodeError as e:
        raise WorkspaceValidationError(f"Corrupted or invalid JSON format in '{file_path}': {e}")
    except Exception as e:
        raise WorkspaceValidationError(f"Failed to read JSON file '{file_path}': {e}")


def write_json_atomic(file_path: Path, data: Dict[str, Any]) -> None:
    """Write data to a JSON file atomically using a temporary file rename.
    
    This guarantees that the target file is never left in a partially written
    or corrupted state in the event of a system crash.
    
    Args:
        file_path: The target destination path.
        data: The dictionary data to serialize.
        
    Raises:
        WorkspacePermissionError: If writing to disk fails.
    """
    target_dir = file_path.parent
    safe_mkdir(target_dir)
    
    # Create temp file in the same directory to ensure it is on the same filesystem/mount
    # (enabling an atomic os.replace rename)
    try:
        with tempfile.NamedTemporaryFile(
            "w", 
            dir=target_dir, 
            delete=False, 
            suffix=".tmp", 
            encoding="utf-8"
        ) as tf:
            json.dump(data, tf, indent=2)
            temp_name = tf.name
            
        # Rename is atomic on POSIX systems
        os.replace(temp_name, file_path)
        # Restrict permissions
        os.chmod(file_path, 0o600)
    except Exception as e:
        # Cleanup temp file if rename failed
        if 'temp_name' in locals() and os.path.exists(temp_name):
            try:
                os.unlink(temp_name)
            except Exception:
                pass
        raise WorkspacePermissionError(f"Atomic JSON write failed for '{file_path}': {e}")


def timestamp_now() -> str:
    """Return the current time formatted as an ISO 8601 UTC string.
    
    Returns:
        A string like '2026-06-25T11:09:34.123456Z'.
    """
    return datetime.utcnow().isoformat() + "Z"
