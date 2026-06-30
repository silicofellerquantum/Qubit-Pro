"""Pydantic schemas for simulation mesh metadata and quality metrics."""

from __future__ import annotations

from typing import Dict, List, Tuple
from pydantic import BaseModel, Field

from app.simulation.mesh.mesh_settings import MeshSettings


class MeshQualityMetrics(BaseModel):
    """Calculated mesh quality statistics for 3D tetrahedral elements."""

    element_count: int = Field(..., description="Total number of 3D tetrahedral elements analyzed.")
    
    # Volume statistics (in cubic mm)
    min_volume: float = Field(..., description="Minimum tetrahedral element volume.")
    max_volume: float = Field(..., description="Maximum tetrahedral element volume.")
    mean_volume: float = Field(..., description="Average tetrahedral element volume.")
    
    # Aspect ratio statistics (max_edge / min_edge)
    min_aspect_ratio: float = Field(..., description="Minimum element aspect ratio.")
    max_aspect_ratio: float = Field(..., description="Maximum element aspect ratio.")
    mean_aspect_ratio: float = Field(..., description="Average element aspect ratio.")
    
    # Normalized volume-to-edge ratio quality (0.0 to 1.0)
    min_quality: float = Field(..., description="Minimum normalized volume-to-edge quality.")
    max_quality: float = Field(..., description="Maximum normalized volume-to-edge quality.")
    mean_quality: float = Field(..., description="Average normalized volume-to-edge quality.")
    
    # Histogram of normalized qualities (10 bins from 0.0 to 1.0)
    quality_histogram: List[int] = Field(
        ..., description="Frequency count of element qualities in 10 uniform bins from 0.0 to 1.0."
    )


class MeshMetadata(BaseModel):
    """Metadata schema summarizing the generated mesh and its configuration."""

    mesh_version: str = Field(default="1.0.0", description="Version of the mesh metadata schema.")
    generator_version: str = Field(default="GMSH 4.x", description="Version of the GMSH mesh engine.")
    
    workspace_id: str = Field(..., description="UUID of the associated simulation workspace.")
    geometry_version: str = Field(default="1.0.0", description="Version of the source geometry metadata.")
    
    # Size details
    node_count: int = Field(..., description="Total number of mesh nodes.")
    element_count: int = Field(..., description="Total number of mesh elements (all dimensions).")
    tet_count: int = Field(..., description="Number of 3D tetrahedral elements.")
    triangle_count: int = Field(..., description="Number of 2D boundary triangle elements.")
    line_count: int = Field(..., description="Number of 1D boundary line elements.")
    
    mesh_dimension: int = Field(default=3, description="Spatial dimension of the mesh (always 3).")
    bounding_box: Tuple[float, float, float, float, float, float] = Field(
        ..., description="3D Bounding box of the mesh: (xmin, ymin, zmin, xmax, ymax, zmax) in mm."
    )
    
    # Physical groups mapping for solver assignment
    physical_groups: Dict[str, Dict[str, int]] = Field(
        ...,
        description="Map of physical group names to their properties (e.g., {'air': {'dim': 3, 'tag': 1}})."
    )
    
    mesh_settings: MeshSettings = Field(..., description="The mesh sizing settings used to generate the mesh.")
    generation_time_seconds: float = Field(..., description="Compute duration of the mesh generation process in seconds.")
    created_at: str = Field(..., description="ISO 8601 timestamp of mesh generation.")
