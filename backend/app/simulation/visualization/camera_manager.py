"""Camera preset manager for PyVista visualization."""

from __future__ import annotations

from typing import Dict, List

from app.simulation.visualization.visualization_models import CameraPreset, CameraPresetName

# Named presets with normalized positions (scaled to bounding box at render time)
_PRESETS: Dict[CameraPresetName, CameraPreset] = {
    CameraPresetName.ISOMETRIC: CameraPreset(
        name=CameraPresetName.ISOMETRIC,
        label="Isometric",
        position=[1.0, 1.0, 1.0],
        focal_point=[0.0, 0.0, 0.0],
        up_vector=[0.0, 0.0, 1.0],
        description="Classic isometric 3D view",
    ),
    CameraPresetName.TOP: CameraPreset(
        name=CameraPresetName.TOP,
        label="Top (Z)",
        position=[0.0, 0.0, 3.0],
        focal_point=[0.0, 0.0, 0.0],
        up_vector=[0.0, 1.0, 0.0],
        description="Top-down plan view",
    ),
    CameraPresetName.FRONT: CameraPreset(
        name=CameraPresetName.FRONT,
        label="Front (Y)",
        position=[0.0, -3.0, 0.0],
        focal_point=[0.0, 0.0, 0.0],
        up_vector=[0.0, 0.0, 1.0],
        description="Front elevation view",
    ),
    CameraPresetName.SIDE: CameraPreset(
        name=CameraPresetName.SIDE,
        label="Side (X)",
        position=[3.0, 0.0, 0.0],
        focal_point=[0.0, 0.0, 0.0],
        up_vector=[0.0, 0.0, 1.0],
        description="Side elevation view",
    ),
    CameraPresetName.BOTTOM: CameraPreset(
        name=CameraPresetName.BOTTOM,
        label="Bottom (-Z)",
        position=[0.0, 0.0, -3.0],
        focal_point=[0.0, 0.0, 0.0],
        up_vector=[0.0, -1.0, 0.0],
        description="Bottom-up view",
    ),
    CameraPresetName.PERSPECTIVE: CameraPreset(
        name=CameraPresetName.PERSPECTIVE,
        label="Perspective",
        position=[1.5, -1.5, 1.2],
        focal_point=[0.0, 0.0, 0.0],
        up_vector=[0.0, 0.0, 1.0],
        description="Perspective 3/4 view",
    ),
}


def get_all_presets() -> List[CameraPreset]:
    """Return all available camera presets."""
    return list(_PRESETS.values())


def get_preset(name: CameraPresetName) -> CameraPreset:
    """Return a specific camera preset by name."""
    return _PRESETS[name]


def apply_preset(plotter, preset: CameraPreset, focus_bounds: list[float] | None = None) -> None:
    """Apply a camera preset to an active PyVista Plotter.

    The plotter must have already added geometry so that the camera
    can be reset and scaled correctly.
    """
    bounds = focus_bounds if focus_bounds is not None else plotter.bounds  # [xmin, xmax, ymin, ymax, zmin, zmax]

    # Compute scene centre
    cx = (bounds[0] + bounds[1]) / 2.0
    cy = (bounds[2] + bounds[3]) / 2.0
    cz = (bounds[4] + bounds[5]) / 2.0

    px, py, pz = preset.position
    fx, fy, fz = preset.focal_point

    # Scale camera position/distance relative to the bounds size
    span_x = bounds[1] - bounds[0]
    span_y = bounds[3] - bounds[2]
    span_z = bounds[5] - bounds[4]
    max_span = max(span_x, span_y, span_z)
    if max_span <= 0:
        max_span = 1.0
    
    # Scale factor frames the components beautifully. Use a slightly larger factor
    # for full scene framing to avoid clipping.
    scale_factor = max_span * 1.2
    
    plotter.camera.position = (cx + px * scale_factor, cy + py * scale_factor, cz + pz * scale_factor)
    plotter.camera.focal_point = (cx + fx, cy + fy, cz + fz)

    plotter.camera.up = tuple(preset.up_vector)
    
    # Automatically zoom and position the camera to fit the focus or scene perfectly
    if focus_bounds is None:
        plotter.reset_camera()
    plotter.reset_camera_clipping_range()

