"""Simulation Mesh Generator package.

Provides programmatic GMSH meshing, boundary mapping, validation, and quality metrics
calculation for Quantum Studio simulation backend.
"""

from __future__ import annotations

from app.simulation.mesh.exceptions import (
    MeshError,
    MeshGenerationError,
    MeshValidationError,
    MeshImportError,
    MeshExportError,
    PhysicalGroupError,
    BoundaryDetectionError,
    MeshQualityError,
)
from app.simulation.mesh.mesh_settings import MeshSettings
from app.simulation.mesh.mesh_models import MeshMetadata, MeshQualityMetrics
from app.simulation.mesh.mesh_generator import MeshGenerator

__all__ = [
    "MeshGenerator",
    "MeshSettings",
    "MeshMetadata",
    "MeshQualityMetrics",
    "MeshError",
    "MeshGenerationError",
    "MeshValidationError",
    "MeshImportError",
    "MeshExportError",
    "PhysicalGroupError",
    "BoundaryDetectionError",
    "MeshQualityError",
]
