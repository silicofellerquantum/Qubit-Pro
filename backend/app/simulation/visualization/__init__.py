"""Visualization subsystem for Quantum Studio Palace simulation outputs.

Public API:
    VisualizationService  — main orchestrator
    VisualizationRequest  — render parameters
    VisualizationManifest — manifest of all available data
"""

from app.simulation.visualization.visualizer import VisualizationService
from app.simulation.visualization.visualization_models import (
    VisualizationManifest,
    RenderRequest,
    RenderResponse,
    FieldInfo,
    CameraPreset,
    SliceRequest,
    ArrayListResponse,
)
from app.simulation.visualization.exceptions import (
    VTUNotFoundError,
    FieldNotFoundError,
    RenderError,
    UnsupportedFormatError,
    VisualizationError,
)

__all__ = [
    "VisualizationService",
    "VisualizationManifest",
    "RenderRequest",
    "RenderResponse",
    "FieldInfo",
    "CameraPreset",
    "SliceRequest",
    "ArrayListResponse",
    "VTUNotFoundError",
    "FieldNotFoundError",
    "RenderError",
    "UnsupportedFormatError",
    "VisualizationError",
]
