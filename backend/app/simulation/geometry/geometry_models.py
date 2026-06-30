"""Pydantic models for the simulation geometry builder."""

from __future__ import annotations

from enum import Enum
from typing import Any, Dict, List, Optional, Tuple
from pydantic import BaseModel, Field

from app.simulation.geometry.constants import (
    GEOMETRY_VERSION,
    LAYER_METAL,
    MATERIAL_ALUMINUM,
)


class GeometryComponentKind(str, Enum):
    """Supported physical component types in a quantum design."""
    QUBIT = "qubit"
    RESONATOR = "resonator"
    COUPLER = "coupler"
    FEEDLINE = "feedline"
    LAUNCHPAD = "launchpad"
    GROUND_PLANE = "ground_plane"
    PORT = "port"


class LogicalPort(BaseModel):
    """Represents a logical excitation or boundary port in the geometry."""
    
    id: str = Field(..., description="Unique identifier of the port, e.g., 'port_q0'.")
    x_mm: float = Field(..., description="X coordinate of the port in millimeters.")
    y_mm: float = Field(..., description="Y coordinate of the port in millimeters.")
    orientation_deg: float = Field(
        default=0.0, 
        description="Orientation angle of the port in degrees."
    )
    reference_layer: str = Field(
        ..., 
        description="Fabrication layer this port lies on (e.g., 'junction')."
    )
    associated_component_id: str = Field(
        ..., 
        description="The ID of the physical component containing this port."
    )


class GeometryComponent(BaseModel):
    """Represents an individual physical component on the chip layout."""
    
    id: str = Field(..., description="Unique identifier of the component instance.")
    kind: GeometryComponentKind = Field(..., description="The classification of this component.")
    x_mm: float = Field(..., description="Center X coordinate in millimeters.")
    y_mm: float = Field(..., description="Center Y coordinate in millimeters.")
    orientation_deg: float = Field(
        default=0.0, 
        description="Orientation rotation angle in degrees."
    )
    layer: str = Field(
        default=LAYER_METAL, 
        description="Fabrication layer (e.g. 'metal', 'dielectric')."
    )
    material: str = Field(
        default=MATERIAL_ALUMINUM, 
        description="Material metadata tag (e.g. 'aluminum', 'niobium')."
    )
    params: Dict[str, Any] = Field(
        default_factory=dict, 
        description="Physical dimensions and design parameters."
    )
    bounding_box: Optional[Tuple[float, float, float, float]] = Field(
        default=None,
        description="Calculated bounding box: (xmin, ymin, xmax, ymax) in mm."
    )


class GeometryMetadata(BaseModel):
    """Schema-validated geometry metadata written to the workspace."""
    
    design_id: str = Field(..., description="The unique identifier of the quantum chip design.")
    component_count: int = Field(..., description="Total count of components placed.")
    bounding_box: Tuple[float, float, float, float] = Field(
        ..., 
        description="Chip-wide bounding box: (xmin, ymin, xmax, ymax) in mm."
    )
    layers: List[str] = Field(
        default_factory=list, 
        description="List of active fabrication layers."
    )
    ports: List[LogicalPort] = Field(
        default_factory=list, 
        description="List of logical port definitions generated."
    )
    materials: List[str] = Field(
        default_factory=list, 
        description="List of material metadata tags mapped."
    )
    coordinate_system: str = Field(
        default="cartesian_mm", 
        description="The coordinate system and unit convention."
    )
    generated_files: List[str] = Field(
        default_factory=list, 
        description="Files generated inside the workspace geometry/ folder."
    )
    geometry_version: str = Field(
        default=GEOMETRY_VERSION, 
        description="Geometry builder package version."
    )
    created_at: str = Field(..., description="ISO 8601 creation timestamp.")
