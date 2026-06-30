"""Slice and isosurface generator for Palace simulation outputs."""

from __future__ import annotations

import logging
import os
import time
from pathlib import Path
from typing import Optional

import numpy as np

from app.simulation.visualization.camera_manager import apply_preset, get_preset
from app.simulation.visualization.exceptions import FieldNotFoundError, RenderError
from app.simulation.visualization.image_exporter import save_screenshot
from app.simulation.visualization.visualization_models import (
    CameraPresetName,
    SliceAxis,
    SliceRequest,
)

logger = logging.getLogger(__name__)

try:
    import pyvista as pv
    pv.OFF_SCREEN = True
    if os.name == "posix" and not os.environ.get("DISPLAY"):
        try:
            pv.start_xvfb()
        except Exception:
            pass
except ImportError:
    pv = None  # type: ignore


_AXIS_NORMALS = {
    SliceAxis.X: (1, 0, 0),
    SliceAxis.Y: (0, 1, 0),
    SliceAxis.Z: (0, 0, 1),
}
_AXIS_IDX = {SliceAxis.X: 0, SliceAxis.Y: 2, SliceAxis.Z: 4}  # index into bounds


def _pick_field(dataset, requested: Optional[str]) -> Optional[str]:
    available = list(dataset.point_data.keys())
    if requested and requested in available:
        return requested
    priority = [
        "E_real", "E_Real", "E", "E_imag", "E_Imag",
        "B_real", "B_Real", "B", "B_imag", "B_Imag",
        "U_e", "V"
    ]
    for name in priority:
        if name in available:
            return name
    return available[0] if available else None


def generate_orthogonal_slice(
    dataset,
    output_path: Path,
    request: SliceRequest,
) -> float:
    """Generate an orthogonal slice (X/Y/Z plane) and render to PNG.

    Args:
        dataset:     PyVista DataSet.
        output_path: Destination PNG path.
        request:     Slice parameters.

    Returns:
        Render time in milliseconds.
    """
    if pv is None:
        raise RenderError("PyVista is not installed")

    t0 = time.perf_counter()

    field_name = _pick_field(dataset, request.field)
    if not field_name:
        raise RenderError("No renderable arrays in dataset for slicing")

    # Determine physical origin along the axis
    bounds = dataset.bounds
    axis_idx = _AXIS_IDX[request.axis]
    axis_min = bounds[axis_idx]
    axis_max = bounds[axis_idx + 1]
    # position is normalised [0, 1]
    origin_val = axis_min + request.position * (axis_max - axis_min)
    normal = _AXIS_NORMALS[request.axis]

    # Build origin point (zero on other axes, origin_val on slice axis)
    cx = (bounds[0] + bounds[1]) / 2.0
    cy = (bounds[2] + bounds[3]) / 2.0
    cz = (bounds[4] + bounds[5]) / 2.0
    if request.axis == SliceAxis.X:
        origin = (origin_val, cy, cz)
    elif request.axis == SliceAxis.Y:
        origin = (cx, origin_val, cz)
    else:
        origin = (cx, cy, origin_val)

    # Compute magnitude if vector
    arr = np.asarray(dataset.point_data[field_name])
    if arr.ndim > 1:
        dataset.point_data["_slice_mag"] = np.linalg.norm(arr, axis=1)
        scalar = "_slice_mag"
    else:
        scalar = field_name

    try:
        sliced = dataset.slice(normal=normal, origin=origin)
    except Exception as exc:
        raise RenderError(f"Slice generation failed: {exc}", cause=exc)

    if sliced.n_points < 3:
        raise RenderError(f"Slice along {request.axis.value}={origin_val:.4f} produced no geometry")

    vals = np.asarray(sliced.point_data.get(scalar, []))
    finite = vals[np.isfinite(vals)] if len(vals) else np.array([0.0, 1.0])
    vmin = float(np.nanmin(finite)) if len(finite) else 0.0
    vmax = float(np.nanmax(finite)) if len(finite) else 1.0

    if request.log_scale:
        vmin = max(vmin, vmax * 1e-8) if vmax > 0 else 1e-8
    clim = [vmin, vmax if vmax > 0 else 1.0]

    plotter = pv.Plotter(off_screen=True, window_size=[request.width, request.height])
    plotter.set_background("white", top="aliceblue")
    plotter.add_mesh(
        sliced,
        scalars=scalar,
        cmap=request.colormap.value,
        log_scale=request.log_scale,
        clim=clim,
        show_scalar_bar=True,
        show_edges=False,
        scalar_bar_args={
            "title": field_name,
            "color": "black",
            "width": 0.18,
            "height": 0.55,
            "fmt": "%.2e",
        },
    )
    plotter.add_text(
        f"Slice {request.axis.value.upper()} = {origin_val:.4f}",
        position="upper_left",
        font_size=11,
        color="black",
    )

    # Use top-down camera for Z slices, side camera otherwise
    if request.axis == SliceAxis.Z:
        preset_name = CameraPresetName.TOP
    elif request.axis == SliceAxis.Y:
        preset_name = CameraPresetName.FRONT
    else:
        preset_name = CameraPresetName.SIDE

    preset = get_preset(preset_name)
    apply_preset(plotter, preset)

    save_screenshot(plotter, output_path)
    plotter.close()

    elapsed_ms = (time.perf_counter() - t0) * 1000.0
    logger.info("Slice %s=%.4f rendered to %s in %.1f ms", request.axis.value, origin_val, output_path, elapsed_ms)
    return elapsed_ms


def generate_isosurface(
    dataset,
    output_path: Path,
    field_name: str,
    isovalues: list[float],
    colormap: str = "coolwarm",
    width: int = 1200,
    height: int = 900,
) -> float:
    """Generate isosurfaces at specified field values.

    Returns:
        Render time in milliseconds.
    """
    if pv is None:
        raise RenderError("PyVista is not installed")

    t0 = time.perf_counter()

    available = list(dataset.point_data.keys())
    if field_name not in available:
        raise FieldNotFoundError(field_name, available)

    arr = np.asarray(dataset.point_data[field_name])
    if arr.ndim > 1:
        dataset.point_data["_iso_mag"] = np.linalg.norm(arr, axis=1)
        scalar = "_iso_mag"
    else:
        scalar = field_name

    try:
        iso = dataset.contour(isovalues, scalars=scalar)
    except Exception as exc:
        raise RenderError(f"Isosurface generation failed: {exc}", cause=exc)

    plotter = pv.Plotter(off_screen=True, window_size=[width, height])
    plotter.set_background("white", top="aliceblue")
    plotter.add_mesh(iso, scalars=scalar, cmap=colormap, opacity=0.75, show_scalar_bar=True)

    preset = get_preset(CameraPresetName.ISOMETRIC)
    apply_preset(plotter, preset)

    from app.simulation.visualization.image_exporter import save_screenshot as _ss
    _ss(plotter, output_path)
    plotter.close()

    elapsed_ms = (time.perf_counter() - t0) * 1000.0
    logger.info("Isosurface rendered to %s in %.1f ms", output_path, elapsed_ms)
    return elapsed_ms
