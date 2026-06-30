"""Type definitions and Enums for the simulation workspace manager."""

from __future__ import annotations

from enum import Enum


class WorkspaceState(str, Enum):
    """Represents the operational lifecycle state of a simulation workspace."""
    CREATED = "CREATED"               # Directory created, metadata initialized
    READY = "READY"                   # Subdirectories created, ready for input
    IN_USE = "IN_USE"                 # Palace solver is actively running in it
    COMPLETED = "COMPLETED"           # Simulation finished, results collected
    FAILED = "FAILED"                 # Simulation failed, error logs captured
    CLEANED = "CLEANED"               # Ephemeral files deleted, assets zipped/moved
    ARCHIVED = "ARCHIVED"             # Compressed archive uploaded or moved to cold storage
