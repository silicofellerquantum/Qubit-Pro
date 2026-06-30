"""Geometry Builder package for Quantum Studio simulations.

This package parses, validates, and exports design layout geometry CAD and 
GMSH scripts into the simulation sandboxed workspaces.
"""

from __future__ import annotations

from app.simulation.geometry.exceptions import (
    DuplicateComponentError,
    GeometryError,
    GeometryExportError,
    GeometryValidationError,
    InvalidLayerError,
    InvalidMaterialError,
    InvalidPortError,
    OverlapError,
    UnsupportedComponentError,
)
from app.simulation.geometry.geometry_builder import GeometryBuilder
from app.simulation.geometry.geometry_models import (
    GeometryComponent,
    GeometryComponentKind,
    GeometryMetadata,
    LogicalPort,
)

__all__ = [
    "GeometryBuilder",
    "GeometryComponent",
    "GeometryComponentKind",
    "GeometryMetadata",
    "LogicalPort",
    "GeometryError",
    "GeometryValidationError",
    "DuplicateComponentError",
    "OverlapError",
    "UnsupportedComponentError",
    "InvalidLayerError",
    "InvalidPortError",
    "InvalidMaterialError",
    "GeometryExportError",
]
