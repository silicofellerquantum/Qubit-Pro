"""Field renderer — converts PyVista datasets to styled PNG images."""

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
    ColormapName,
    FieldInfo,
    FieldType,
    RenderRequest,
)
from app.simulation.visualization.vtu_loader import FIELD_METADATA, extract_field_info

logger = logging.getLogger(__name__)

# Configure PyVista for headless rendering on import
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


def _auto_select_field(dataset) -> Optional[str]:
    """Pick the most physically meaningful field from a dataset."""
    available = list(dataset.point_data.keys())
    priority = [
        "E_real", "E_Real", "E", "E_mag", "E_imag", "E_Imag",
        "B_real", "B_Real", "B", "B_mag", "B_imag", "B_Imag",
        "U_e", "U_m",
        "V", "Phi",
        "J_real", "J_Real", "J",
        "S", "EPR",
    ]
    for name in priority:
        if name in available:
            return name
    return available[0] if available else None


def _get_magnitude_array(dataset, field_name: str) -> np.ndarray:
    """Return scalar magnitude array for either scalar or vector fields."""
    arr = np.asarray(dataset.point_data[field_name])
    if arr.ndim > 1:
        return np.linalg.norm(arr, axis=1)
    return arr


def render_field_to_png(
    dataset,
    output_path: Path,
    request: RenderRequest,
    field_info: Optional[FieldInfo] = None,
    boundary_path: Optional[Path] = None,
) -> float:
    """Render a scalar or vector field from a dataset to PNG.

    Args:
        dataset:     PyVista DataSet (already loaded).
        output_path: Destination PNG path.
        request:     Render parameters.
        field_info:  Optional pre-computed FieldInfo for units/description.
        boundary_path: Optional path to boundary dataset for overlay.

    Returns:
        Render time in milliseconds.

    Raises:
        RenderError: If PyVista rendering fails.
        FieldNotFoundError: If requested field is not in the dataset.
    """
    if pv is None:
        raise RenderError("PyVista is not installed")

    t0 = time.perf_counter()

    # ── Field selection ────────────────────────────────────────────────────
    field_name = request.field or _auto_select_field(dataset)
    if not field_name:
        raise RenderError("No renderable field arrays found in dataset")

    available = list(dataset.point_data.keys())
    if field_name not in available:
        raise FieldNotFoundError(field_name, available)

    meta = FIELD_METADATA.get(field_name, {})
    bar_title = field_info.units if field_info else meta.get("units", "")
    label = meta.get("label", field_name)
    if bar_title:
        bar_title = f"{label} ({bar_title})"
    else:
        bar_title = label

    # Compute magnitude for vector fields
    mag_arr = _get_magnitude_array(dataset, field_name)
    dataset.point_data["_render_mag"] = mag_arr
    scalar_name = "_render_mag"

    # ── Clip to substrate (Z ≤ 0) to remove air box ───────────────────────
    try:
        render_mesh = dataset.clip(normal="z", origin=(0, 0, 0), invert=True)
        if render_mesh.n_points < 10:
            render_mesh = dataset
    except Exception:
        render_mesh = dataset

    # ── Load and prepare boundary data if available ───────────────────────
    boundary_ds = None
    chip_surfaces = None
    ground_plane = None
    active_components = None
    surf_mag = None

    if boundary_path and boundary_path.exists():
        try:
            boundary_ds = pv.read(str(boundary_path))
            if boundary_ds.n_points > 0 and "attribute" in boundary_ds.cell_data:
                # Explicitly filter out outer air box (attribute 4) and keep chip surfaces
                # Use attribute >=5 to exclude attribute 4 and ground plane (3)
                chip_surfaces = boundary_ds.threshold(5, scalars="attribute").clean()
                logger.debug("Boundary dataset loaded with %d points; after filtering attribute>=5, %d points remain.",
                             boundary_ds.n_points, chip_surfaces.n_points if chip_surfaces else 0)
                if chip_surfaces.n_points > 0:
                    # Compute magnitude for field on chip surface
                    e_arr = np.asarray(chip_surfaces.point_data[field_name])
                    if e_arr.ndim > 1:
                        surf_mag = np.linalg.norm(e_arr, axis=1)
                    else:
                        surf_mag = e_arr
                    chip_surfaces.point_data["_render_mag"] = surf_mag

                    # Separate ground plane (attribute 3) and active components (attribute >= 10)
                    ground_plane = boundary_ds.threshold((2.9, 3.1), scalars="attribute").clean()
                    active_components = boundary_ds.threshold(9.5, scalars="attribute").clean()
        except Exception as e:
            logger.warning("Failed to prepare boundary dataset: %s", e)

    # ── Clim computation ───────────────────────────────────────────────────
    if request.high_fidelity and surf_mag is not None:
        # Use robust percentile-based scaling on the chip surface to avoid singular hot-spots
        finite_vals = surf_mag[np.isfinite(surf_mag)]
        if len(finite_vals) == 0:
            finite_vals = np.array([0.0, 1.0])
        vmax = float(np.percentile(finite_vals, 98.5))
        vmin = float(np.nanmin(np.where(finite_vals > 0, finite_vals, np.inf)))

        if request.log_scale:
            vmin = max(vmin, vmax * 1e-4) if vmax > 0 else 1e-4
            clim = [vmin, vmax if vmax > 0 else 1.0]
        else:
            clim = [float(np.nanmin(finite_vals)), vmax if vmax > 0 else 1.0]
    else:
        # Legacy global volume-based scaling
        field_vals = render_mesh.point_data.get(scalar_name, mag_arr)
        finite_vals = field_vals[np.isfinite(field_vals)]
        if len(finite_vals) == 0:
            finite_vals = np.array([0.0, 1.0])
        vmax = float(np.nanmax(finite_vals))
        vmin = float(np.nanmin(np.where(finite_vals > 0, finite_vals, np.inf)))

        if request.log_scale:
            vmin = max(vmin, vmax * 1e-8) if vmax > 0 else 1e-8
            clim = [vmin, vmax if vmax > 0 else 1.0]
        else:
            clim = [float(np.nanmin(finite_vals)), vmax if vmax > 0 else 1.0]

    # ── Plotter setup ──────────────────────────────────────────────────────
    plotter = pv.Plotter(off_screen=True, window_size=[request.width, request.height])
    bg = "white" if not request.transparent_background else [255, 255, 255, 0]
    plotter.set_background("white", top="aliceblue")

    # ── Rendering Dispatch ─────────────────────────────────────────────────
    if request.high_fidelity and chip_surfaces is not None and chip_surfaces.n_points > 0:
        # ── HIGH-FIDELITY PIPELINE: Render fields directly on surface boundaries ──
        logger.info("Using high-fidelity boundary-field rendering pipeline.")

        # 1. Render volume dataset underneath (Z <= 0) to provide 3D field context
        plotter.add_mesh(
            render_mesh,
            scalars=scalar_name,
            cmap=request.colormap.value,
            log_scale=request.log_scale,
            clim=clim,
            opacity=request.opacity,
            show_edges=False,
            show_scalar_bar=False,
        )

        # 2. Render ground plane smoothly (no edges)
        if ground_plane and ground_plane.n_points > 0:
            # Translate slightly upward to prevent Z-fighting with volume mesh
            ground_plane.translate((0, 0, 0.001), inplace=True)
            show_gp_bar = request.show_scalar_bar and (active_components is None or active_components.n_points == 0)
            plotter.add_mesh(
                ground_plane,
                scalars="_render_mag",
                cmap=request.colormap.value,
                log_scale=request.log_scale,
                clim=clim,
                opacity=1.0,
                show_edges=False,
                show_scalar_bar=show_gp_bar,
                scalar_bar_args={
                    "title": bar_title,
                    "color": "black",
                    "position_x": 0.05,
                    "position_y": 0.05,
                    "width": 0.18,
                    "height": 0.55,
                    "fmt": "%.2e",
                    "title_font_size": 11,
                    "label_font_size": 9,
                } if show_gp_bar else None,
            )

        # 3. Render active components colored by field with high-contrast gold outlines
        if active_components and active_components.n_points > 0:
            # Translate slightly more in Z to layer perfectly on top
            active_components.translate((0, 0, 0.002), inplace=True)
            plotter.add_mesh(
                active_components,
                scalars="_render_mag",
                cmap=request.colormap.value,
                log_scale=request.log_scale,
                clim=clim,
                opacity=1.0,
                show_edges=True,
                edge_color="#d4af37",  # Premium Gold outline
                line_width=2.0,
                show_scalar_bar=request.show_scalar_bar,
                scalar_bar_args={
                    "title": bar_title,
                    "color": "black",
                    "position_x": 0.05,
                    "position_y": 0.05,
                    "width": 0.18,
                    "height": 0.55,
                    "fmt": "%.2e",
                    "title_font_size": 11,
                    "label_font_size": 9,
                } if request.show_scalar_bar else None,
            )
    else:
        # ── LEGACY PIPELINE: Render volume-clipped fields with solid gold overlays ──
        logger.info("Using legacy volume-clipped field rendering pipeline.")

        plotter.add_mesh(
            render_mesh,
            scalars=scalar_name,
            cmap=request.colormap.value,
            log_scale=request.log_scale,
            clim=clim,
            opacity=request.opacity,
            show_edges=request.show_edges,
            show_scalar_bar=request.show_scalar_bar,
            scalar_bar_args={
                "title": bar_title,
                "color": "black",
                "position_x": 0.05,
                "position_y": 0.05,
                "width": 0.18,
                "height": 0.55,
                "fmt": "%.2e",
                "title_font_size": 11,
                "label_font_size": 9,
            },
        )

        # Overlay solid gold boundary metallic layer
        if request.show_boundaries and boundary_ds is not None and boundary_ds.n_points > 0:
            try:
                active_legacy = boundary_ds.threshold(9.5, scalars="attribute").clean()
                if active_legacy.n_points > 0:
                    active_legacy.translate((0, 0, 0.001), inplace=True)
                    plotter.add_mesh(
                        active_legacy,
                        color="#d4af37",  # Solid gold metallic
                        style="surface",
                        show_edges=True,
                        edge_color="#1a1a2e",
                        line_width=0.5,
                        opacity=1.0,
                        lighting=True,
                    )
                    logger.info("Successfully overlaid legacy solid gold boundaries.")
            except Exception as e:
                logger.warning("Failed to overlay legacy boundary mesh: %s", e)

    # ── Camera preset ──────────────────────────────────────────────────────
    focus_bounds = None
    try:
        target_bounds_ds = None
        if request.high_fidelity and 'active_components' in locals() and active_components and active_components.n_points > 0:
            target_bounds_ds = active_components
        elif 'active_legacy' in locals() and active_legacy and active_legacy.n_points > 0:
            target_bounds_ds = active_legacy
        elif 'boundary_ds' in locals() and boundary_ds is not None and boundary_ds.n_points > 0:
            try:
                target_bounds_ds = boundary_ds.threshold(9.5, scalars="attribute").clean()
            except Exception:
                pass
                
        if target_bounds_ds and target_bounds_ds.n_points > 0:
            b = target_bounds_ds.bounds
            if b[1] > b[0] and b[3] > b[2]:
                padding_x = (b[1] - b[0]) * 0.15
                padding_y = (b[3] - b[2]) * 0.15
                focus_bounds = [
                    b[0] - padding_x,
                    b[1] + padding_x,
                    b[2] - padding_y,
                    b[3] + padding_y,
                    b[4] - 0.1,
                    b[5] + 0.1
                ]
    except Exception as e:
        logger.warning("Failed to calculate camera focus bounds: %s", e)

    preset = get_preset(request.camera_preset or CameraPresetName.ISOMETRIC)
    apply_preset(plotter, preset, focus_bounds=focus_bounds)

    # ── Annotation ────────────────────────────────────────────────────────
    n_pts = render_mesh.n_points
    n_cells = render_mesh.n_cells
    plotter.add_text(
        f"Field: {label}  |  Nodes: {n_pts:,}  |  Elements: {n_cells:,}",
        position="lower_right",
        font_size=8,
        color="#555555",
    )

    save_screenshot(plotter, output_path, transparent_background=request.transparent_background)
    plotter.close()

    elapsed_ms = (time.perf_counter() - t0) * 1000.0
    logger.info("Rendered field '%s' to %s in %.1f ms", field_name, output_path, elapsed_ms)
    return elapsed_ms
