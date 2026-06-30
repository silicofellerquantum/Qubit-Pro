"""Simulation Workspace Management package for Quantum Studio.

This package provides isolated directory sandboxes, metadata tracking, 
atomic operations, path-traversal security, and automatic cleanup policies 
for EM simulations.
"""

from __future__ import annotations

from app.simulation.workspace.cleanup import cleanup_expired_workspaces
from app.simulation.workspace.exceptions import (
    WorkspaceAlreadyExistsError,
    WorkspaceCleanupError,
    WorkspaceError,
    WorkspaceMetadataError,
    WorkspaceNotFoundError,
    WorkspacePermissionError,
    WorkspaceValidationError,
)
from app.simulation.workspace.types import WorkspaceState
from app.simulation.workspace.workspace_manager import WorkspaceManager
from app.simulation.workspace.workspace_models import WorkspaceMetadata
from app.simulation.workspace.workspace_utils import (
    generate_workspace_id,
    is_safe_path,
    normalize_path,
)

__all__ = [
    "WorkspaceManager",
    "WorkspaceMetadata",
    "WorkspaceState",
    "cleanup_expired_workspaces",
    "generate_workspace_id",
    "is_safe_path",
    "normalize_path",
    "WorkspaceError",
    "WorkspaceAlreadyExistsError",
    "WorkspaceNotFoundError",
    "WorkspaceValidationError",
    "WorkspacePermissionError",
    "WorkspaceCleanupError",
    "WorkspaceMetadataError",
]
