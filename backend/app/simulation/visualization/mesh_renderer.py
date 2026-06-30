"""Mesh renderer — renders GMSH .msh and VTU topology to styled PNG."""

from __future__ import annotations

import logging
import os
import time
from pathlib import Path

from app.simulation.visualization.camera_manager import apply_preset, get_preset
from app.simulation.visualization.exceptions import RenderError
from app.simulation.visualization.image_exporter import save_screenshot
from app.simulation.visualization.visualization_models import (
    CameraPresetName,
    MeshDisplayMode,
    RenderRequest,
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


def render_mesh_to_png(
    dataset,
    output_path: Path,
    request: RenderRequest,
    title: str = "FEM Mesh",
    display_mode: MeshDisplayMode = MeshDisplayMode.SURFACE_EDGES,
    material_ids: bool = False,
    boundary_path: Optional[Path] = None,
) -> float:
    """Render a mesh (from VTU or MSH) to a styled PNG.

    Args:
        dataset:      PyVista DataSet.
        output_path:  Where to write the PNG.
        request:      Common render parameters (camera, size).
        title:        Annotation title.
        display_mode: wireframe / surface / surface_edges / points.
        material_ids: If True, colour by material_id cell array if available.
        boundary_path: Optional path to boundary dataset for overlay.

    Returns:
        Render time in milliseconds.

    Raises:
        RenderError: On PyVista failure.
    """
    if pv is None:
        raise RenderError("PyVista is not installed")

    t0 = time.perf_counter()

    plotter = pv.Plotter(off_screen=True, window_size=[request.width, request.height])
    plotter.set_background("white", top="aliceblue")

    # Display mode mapping
    style_map = {
        MeshDisplayMode.WIREFRAME:     "wireframe",
        MeshDisplayMode.SURFACE:       "surface",
        MeshDisplayMode.SURFACE_EDGES: "surface",
        MeshDisplayMode.POINTS:        "points",
    }
    style = style_map.get(display_mode, "surface")
    show_edges = display_mode == MeshDisplayMode.SURFACE_EDGES

    # ── Clip to substrate (Z ≤ 0) to remove air box and expose chip surface ──
    try:
        render_mesh = dataset.clip(normal="z", origin=(0, 0, 0), invert=True)
        if render_mesh.n_points < 10:
            render_mesh = dataset
    except Exception:
        render_mesh = dataset

    if material_ids and "material_id" in render_mesh.cell_data:
        plotter.add_mesh(
            render_mesh,
            scalars="material_id",
            cmap="tab20",
            style=style,
            show_edges=show_edges,
            show_scalar_bar=True,
            opacity=request.opacity,
            scalar_bar_args={"title": "Material ID", "color": "black"},
        )
    else:
        plotter.add_mesh(
            render_mesh,
            color="#4a90d9",
            style=style,
            show_edges=show_edges,
            edge_color="#1a1a2e",
            line_width=0.4,
            opacity=request.opacity,
            lighting=True,
        )

    # ── Overlay boundary metallic layer ────────────────────────────────────
    focus_bounds = None
    if boundary_path and boundary_path.exists():
        try:
            boundary_ds = pv.read(str(boundary_path))
            if boundary_ds.n_points > 0:
                # Filter to only include metallic chip features (attribute >= 10)
                if "attribute" in boundary_ds.cell_data:
                    boundary_ds = boundary_ds.threshold(9.5, scalars="attribute")
                
                if boundary_ds.n_points > 0:
                    # Translate boundary slightly upwards in Z to avoid Z-clipping and Z-fighting
                    boundary_ds.translate((0, 0, 0.001), inplace=True)
                    plotter.add_mesh(
                        boundary_ds,
                        color="#d4af37",  # Gold metallic color
                        style="surface",
                        show_edges=True,
                        edge_color="#1a1a2e",
                        line_width=0.5,
                        opacity=1.0,
                        lighting=True,
                    )
                    logger.info("Successfully overlaid boundary mesh from %s", boundary_path)
                    
                    b = boundary_ds.bounds
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
            logger.warning("Failed to overlay boundary mesh: %s", e)

    # Stats annotation
    n_pts = render_mesh.n_points
    n_cells = render_mesh.n_cells
    plotter.add_text(
        title,
        position="upper_left",
        font_size=12,
        color="black",
        shadow=True,
    )
    plotter.add_text(
        f"Nodes: {n_pts:,}  |  Elements: {n_cells:,}",
        position="lower_left",
        font_size=9,
        color="#555555",
    )

    preset = get_preset(request.camera_preset or CameraPresetName.ISOMETRIC)
    apply_preset(plotter, preset, focus_bounds=focus_bounds)

    save_screenshot(plotter, output_path, transparent_background=request.transparent_background)
    plotter.close()

    elapsed_ms = (time.perf_counter() - t0) * 1000.0
    logger.info("Rendered mesh to %s in %.1f ms", output_path, elapsed_ms)
    return elapsed_ms
