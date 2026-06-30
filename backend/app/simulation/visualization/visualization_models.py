"""Pydantic models for the visualization subsystem."""

from __future__ import annotations

from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


# ── Enumerations ──────────────────────────────────────────────────────────────

class ColormapName(str, Enum):
    VIRIDIS  = "viridis"
    COOLWARM = "coolwarm"
    JET      = "jet"
    PLASMA   = "plasma"
    TURBO    = "turbo"
    RAINBOW  = "rainbow"
    GREY     = "grey"
    HOT      = "hot"


class SliceAxis(str, Enum):
    X = "x"
    Y = "y"
    Z = "z"


class MeshDisplayMode(str, Enum):
    SURFACE       = "surface"
    WIREFRAME     = "wireframe"
    SURFACE_EDGES = "surface_edges"
    POINTS        = "points"


class FieldType(str, Enum):
    SCALAR = "scalar"
    VECTOR = "vector"


class CameraPresetName(str, Enum):
    ISOMETRIC   = "isometric"
    TOP         = "top"
    FRONT       = "front"
    SIDE        = "side"
    BOTTOM      = "bottom"
    PERSPECTIVE = "perspective"


# ── Field / Array Models ──────────────────────────────────────────────────────

class FieldInfo(BaseModel):
    """Describes a single data array available in a VTU dataset."""
    name: str
    field_type: FieldType
    n_components: int
    value_min: Optional[float] = None
    value_max: Optional[float] = None
    units: str = ""
    description: str = ""


class ArrayListResponse(BaseModel):
    """Response containing all arrays available in a VTU file."""
    simulation_id: str
    vtu_path: str
    point_arrays: List[FieldInfo] = Field(default_factory=list)
    cell_arrays: List[FieldInfo] = Field(default_factory=list)
    n_points: int = 0
    n_cells: int = 0
    bounds: Optional[List[float]] = None  # [xmin, xmax, ymin, ymax, zmin, zmax]


# ── Render Request / Response ─────────────────────────────────────────────────

class RenderRequest(BaseModel):
    """Parameters controlling a field render operation."""
    field: Optional[str] = None           # None = auto-detect primary field
    colormap: ColormapName = ColormapName.COOLWARM
    log_scale: bool = False
    opacity: float = Field(default=1.0, ge=0.0, le=1.0)
    show_edges: bool = False
    show_scalar_bar: bool = True
    camera_preset: CameraPresetName = CameraPresetName.ISOMETRIC
    width: int = Field(default=1200, ge=256, le=4096)
    height: int = Field(default=900, ge=256, le=4096)
    transparent_background: bool = False
    mode_index: Optional[int] = None     # For eigenmode multi-mode datasets
    show_boundaries: bool = True          # Overlay physical chip boundaries (qubits, resonators, couplers)
    high_fidelity: bool = True            # High-fidelity surface rendering on boundaries with percentile scaling


class RenderResponse(BaseModel):
    """Result of a render operation."""
    image_url: str
    width: int
    height: int
    field_name: Optional[str] = None
    field_min: Optional[float] = None
    field_max: Optional[float] = None
    render_time_ms: float = 0.0
    cached: bool = False


class SliceRequest(BaseModel):
    """Parameters for slice/isosurface generation."""
    axis: SliceAxis = SliceAxis.Z
    position: float = 0.0              # Normalized [0, 1] along the axis
    field: Optional[str] = None
    colormap: ColormapName = ColormapName.COOLWARM
    log_scale: bool = False
    width: int = Field(default=1200, ge=256, le=4096)
    height: int = Field(default=900, ge=256, le=4096)


# ── Camera ────────────────────────────────────────────────────────────────────

class CameraPreset(BaseModel):
    """Named camera position for the 3D viewer."""
    name: CameraPresetName
    label: str
    position: List[float]    # [x, y, z]
    focal_point: List[float] # [x, y, z]
    up_vector: List[float]   # [x, y, z]
    description: str = ""


# ── Manifest ──────────────────────────────────────────────────────────────────

class PreRenderedImage(BaseModel):
    """A pre-rendered image available for serving."""
    filename: str
    url: str
    label: str
    solver: str = ""
    variant: str = ""
    mode_index: Optional[int] = None


class VisualizationManifest(BaseModel):
    """Complete manifest of all visualization data available for a simulation."""
    simulation_id: str
    has_vtu: bool = False
    has_mesh: bool = False
    vtu_files: List[str] = Field(default_factory=list)
    mesh_files: List[str] = Field(default_factory=list)
    pre_rendered_images: List[PreRenderedImage] = Field(default_factory=list)
    available_fields: List[FieldInfo] = Field(default_factory=list)
    solvers: List[str] = Field(default_factory=list)
    n_modes: int = 0
    bounds: Optional[List[float]] = None
