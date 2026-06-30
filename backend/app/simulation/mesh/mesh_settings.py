"""Configuration settings for the GMSH mesh generation process."""

from __future__ import annotations

from pydantic import BaseModel, Field


class MeshSettings(BaseModel):
    """Configuration settings for controlling GMSH 3D tetrahedral meshing parameters."""

    mesh_size: float = Field(
        default=0.15,
        description="Default characteristic mesh size (in millimeters) for bulk elements.",
        gt=0.0,
    )

    min_element_size: float = Field(
        default=0.005,
        description="Minimum permitted mesh element size (in millimeters) near junctions/curves.",
        gt=0.0,
    )

    max_element_size: float = Field(
        default=0.60,
        description="Maximum permitted mesh element size (in millimeters) in vacuum/substrate bulk.",
        gt=0.0,
    )

    growth_rate: float = Field(
        default=1.20,
        description="Mesh growth rate from fine boundary elements to coarser bulk elements.",
        ge=1.0,
        le=2.0,
    )

    curvature_refinement: int = Field(
        default=16,
        description="Number of mesh elements per 2*pi radian along curved geometries.",
        gt=0,
    )

    boundary_refinement_factor: float = Field(
        default=0.25,
        description="Local scaling factor applied to elements near active microstrip components.",
        gt=0.0,
        le=1.0,
    )

    adaptive_refinement: bool = Field(
        default=False,
        description="Flag to enable future-ready adaptive refinement sizing fields.",
    )
