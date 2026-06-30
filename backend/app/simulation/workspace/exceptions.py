"""Custom exceptions for the simulation workspace manager."""

from __future__ import annotations

class WorkspaceError(Exception):
    """Base exception for all workspace-related errors."""
    pass


class WorkspaceAlreadyExistsError(WorkspaceError):
    """Raised when trying to create a workspace that already exists."""
    pass


class WorkspaceNotFoundError(WorkspaceError):
    """Raised when a requested workspace cannot be found on disk."""
    pass


class WorkspaceValidationError(WorkspaceError):
    """Raised when a workspace fails structure or schema validation."""
    pass


class WorkspacePermissionError(WorkspaceError):
    """Raised when there are insufficient filesystem permissions to operate on a workspace."""
    pass


class WorkspaceCleanupError(WorkspaceError):
    """Raised when an error occurs during workspace deletion or file cleanup."""
    pass


class WorkspaceMetadataError(WorkspaceError):
    """Raised when workspace metadata cannot be read, written, or validated."""
    pass
