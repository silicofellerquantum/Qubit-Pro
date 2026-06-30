"""Pydantic models for the simulation workspace metadata."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional
from pydantic import BaseModel, Field

from app.simulation.workspace.types import WorkspaceState
from app.simulation.workspace.constants import WORKSPACE_VERSION


class WorkspaceMetadata(BaseModel):
    """Data model representing the metadata schema stored in workspace.json."""
    
    workspace_id: str = Field(
        ..., 
        description="The unique workspace directory name, e.g. simulation_f81d4fae..."
    )
    simulation_id: str = Field(
        ..., 
        description="The UUIDv4 of the associated simulation job."
    )
    status: WorkspaceState = Field(
        default=WorkspaceState.CREATED,
        description="The current lifecycle state of the workspace."
    )
    workspace_version: str = Field(
        default=WORKSPACE_VERSION,
        description="The version of the workspace directory layout schema."
    )
    created_at: str = Field(
        ..., 
        description="ISO 8601 formatted timestamp of workspace creation."
    )
    updated_at: str = Field(
        ..., 
        description="ISO 8601 formatted timestamp of the last metadata update."
    )
    owner_id: Optional[str] = Field(
        default=None, 
        description="The ID of the user who owns the simulation."
    )
    
    # Absolute paths to all workspace subdirectories
    root_path: str = Field(..., description="Absolute path to the workspace root.")
    config_path: str = Field(..., description="Absolute path to the config subdirectory.")
    geometry_path: str = Field(..., description="Absolute path to the geometry subdirectory.")
    mesh_path: str = Field(..., description="Absolute path to the mesh subdirectory.")
    output_path: str = Field(..., description="Absolute path to the output subdirectory.")
    log_path: str = Field(..., description="Absolute path to the logs subdirectory.")
    visualization_path: str = Field(..., description="Absolute path to the visualization subdirectory.")
    temp_path: str = Field(..., description="Absolute path to the temp subdirectory.")
    
    # Expiration and lifecycle management
    cleanup_after: Optional[str] = Field(
        default=None,
        description="ISO 8601 formatted timestamp after which the workspace is eligible for cleanup."
    )
    error_message: Optional[str] = Field(
        default=None,
        description="Error message if the workspace or simulation failed."
    )
    extra_metadata: Dict[str, Any] = Field(
        default_factory=dict,
        description="Placeholder for extra extensible properties (e.g., CPU hours, grid size)."
    )
