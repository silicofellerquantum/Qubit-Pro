"""Custom exceptions for the visualization subsystem."""

from __future__ import annotations


class VisualizationError(Exception):
    """Base class for all visualization errors."""


class VTUNotFoundError(VisualizationError):
    """Raised when no VTU/PVTU/PVD/VTM file is found in the artifact directory."""

    def __init__(self, artifact_path: str) -> None:
        super().__init__(f"No VTU output found in artifact directory: {artifact_path}")
        self.artifact_path = artifact_path


class FieldNotFoundError(VisualizationError):
    """Raised when the requested field array is not present in the dataset."""

    def __init__(self, field: str, available: list[str]) -> None:
        super().__init__(
            f"Field '{field}' not found. Available arrays: {available}"
        )
        self.field = field
        self.available = available


class RenderError(VisualizationError):
    """Raised when PyVista rendering fails."""

    def __init__(self, message: str, cause: Exception | None = None) -> None:
        super().__init__(f"Render failed: {message}")
        self.cause = cause


class UnsupportedFormatError(VisualizationError):
    """Raised when an unsupported file format is encountered."""

    def __init__(self, path: str) -> None:
        super().__init__(f"Unsupported file format: {path}")
        self.path = path
