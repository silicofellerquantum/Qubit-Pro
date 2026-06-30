"""Custom exceptions for the simulation mesh generator package."""

from __future__ import annotations


class MeshError(Exception):
    """Base exception for all mesh-related errors in Quantum Studio."""
    pass


class MeshGenerationError(MeshError):
    """Raised when GMSH fails to load, mesh, or optimize the geometry."""
    pass


class MeshValidationError(MeshError):
    """Raised when the generated mesh violates physical or topological integrity constraints."""
    pass


class MeshImportError(MeshError):
    """Raised when loading or parsing input geometry files fails."""
    pass


class MeshExportError(MeshError):
    """Raised when writing the mesh or its metadata files to the workspace fails."""
    pass


class PhysicalGroupError(MeshError):
    """Raised when defining or assigning physical groups to GMSH entities fails."""
    pass


class BoundaryDetectionError(MeshError):
    """Raised when extracting or mapping boundary faces on the mesh fails."""
    pass


class MeshQualityError(MeshError):
    """Raised when the element quality of the generated mesh falls below acceptable thresholds."""
    pass
