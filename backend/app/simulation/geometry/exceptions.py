"""Custom exceptions for the simulation geometry builder."""

from __future__ import annotations

class GeometryError(Exception):
    """Base exception for all geometry-related errors."""
    pass


class GeometryValidationError(GeometryError):
    """Raised when the design payload fails structural or physical validation."""
    pass


class DuplicateComponentError(GeometryValidationError):
    """Raised when two components share the same identifier."""
    pass


class OverlapError(GeometryValidationError):
    """Raised when two physical components overlap on the chip layout."""
    pass


class UnsupportedComponentError(GeometryValidationError):
    """Raised when an unrecognized component type is encountered."""
    pass


class InvalidLayerError(GeometryValidationError):
    """Raised when a component is assigned to an invalid fabrication layer."""
    pass


class InvalidPortError(GeometryValidationError):
    """Raised when a port definition is malformed or disconnected."""
    pass


class InvalidMaterialError(GeometryValidationError):
    """Raised when a component is mapped to an unrecognized material."""
    pass


class GeometryExportError(GeometryError):
    """Raised when geometry output serialization or CAD writing fails."""
    pass
