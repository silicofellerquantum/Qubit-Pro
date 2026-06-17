"""Off-screen rendering service for Palace simulation mesh and field files.

Renders the actual GMSH mesh.msh files generated during simulation into
high-quality PNG visualizations using PyVista headless rendering.
"""

from __future__ import annotations

import os
import logging
from pathlib import Path
from typing import List, Tuple

import pyvista as pv
import numpy as np

logger = logging.getLogger(__name__)

# Configure PyVista for headless/off-screen rendering
pv.OFF_SCREEN = True

# Start virtual framebuffer if running headlessly on Linux
if os.name == "posix" and not os.environ.get("DISPLAY"):
    try:
        pv.start_xvfb()
        logger.info("Started virtual framebuffer (Xvfb) for off-screen rendering.")
    except Exception as e:
        logger.warning(f"Could not start Xvfb: {e}. Rendering may fail in headless mode.")


def render_mesh_file(mesh_path: Path, output_png_path: Path, title: str = "Mesh") -> bool:
    """Render a GMSH .msh file to a PNG image using PyVista.

    Args:
        mesh_path: Path to the .msh file.
        output_png_path: Where to save the rendered PNG.
        title: Label for the render (e.g. 'Eigenmode Mesh').

    Returns:
        True if rendering succeeded, False otherwise.
    """
    if not mesh_path.exists():
        logger.warning(f"Mesh file not found: {mesh_path}")
        return False

    try:
        logger.info(f"Rendering mesh from: {mesh_path}")
        mesh = pv.read(str(mesh_path))

        plotter = pv.Plotter(off_screen=True, window_size=[1200, 900])
        plotter.set_background("white", top="aliceblue")

        # Add the mesh with a clean scientific style
        plotter.add_mesh(
            mesh,
            color="#4a90d9",
            opacity=0.85,
            show_edges=True,
            edge_color="#1a1a2e",
            line_width=0.3,
            lighting=True,
        )

        # Add title text
        plotter.add_text(
            title,
            position="upper_left",
            font_size=14,
            color="black",
            shadow=True,
        )

        # Add mesh stats
        n_cells = mesh.n_cells
        n_points = mesh.n_points
        stats_text = f"Nodes: {n_points:,}  |  Elements: {n_cells:,}"
        plotter.add_text(
            stats_text,
            position="lower_left",
            font_size=10,
            color="#555555",
        )

        plotter.view_isometric()
        plotter.reset_camera()
        plotter.screenshot(str(output_png_path))
        plotter.close()

        logger.info(f"Rendered mesh to: {output_png_path} ({output_png_path.stat().st_size} bytes)")
        return True
    except Exception as e:
        logger.warning(f"Failed to render mesh {mesh_path.name}: {e}", exc_info=True)
        return False


def render_vtu_file(vtu_path: Path, output_png_path: Path) -> bool:
    """Render a VTU/PVTU field file to a PNG image.

    Falls back gracefully if the file has no scalar data.
    """
    if not vtu_path.exists():
        logger.warning(f"VTU file not found: {vtu_path}")
        return False

    try:
        logger.info(f"Rendering field from: {vtu_path}")
        mesh = pv.read(str(vtu_path))

        plotter = pv.Plotter(off_screen=True, window_size=[1200, 900])
        plotter.set_background("white", top="aliceblue")

        # Determine scalar field
        scalar_name = None
        bar_title = "Field Value"

        if "E" in mesh.point_data:
            scalar_name = "E"
            bar_title = "Electric Field Magnitude"
        elif "B" in mesh.point_data:
            scalar_name = "B"
            bar_title = "Magnetic Field Magnitude"
        elif "V" in mesh.point_data:
            scalar_name = "V"
            bar_title = "Electrostatic Potential (V)"
        else:
            available = list(mesh.point_data.keys())
            if available:
                scalar_name = available[0]
                bar_title = f"{scalar_name} Field"

        if scalar_name:
            if mesh.point_data[scalar_name].ndim > 1:
                mesh.point_data["Magnitude"] = np.linalg.norm(mesh.point_data[scalar_name], axis=1)
                scalar_name = "Magnitude"

            plotter.add_mesh(
                mesh,
                scalars=scalar_name,
                cmap="viridis",
                show_scalar_bar=True,
                scalar_bar_args={
                    "title": bar_title,
                    "color": "black",
                    "position_x": 0.05,
                    "position_y": 0.05,
                    "width": 0.15,
                    "height": 0.5,
                },
            )
        else:
            plotter.add_mesh(mesh, color="#4a90d9", show_edges=True, opacity=0.85)

        plotter.view_isometric()
        plotter.reset_camera()
        plotter.screenshot(str(output_png_path))
        plotter.close()
        logger.info(f"Rendered field to: {output_png_path}")
        return True
    except Exception as e:
        logger.warning(f"Failed to render field {vtu_path.name}: {e}", exc_info=True)
        return False


def generate_field_visualizations(simulation_id: str, artifact_path: str) -> List[str]:
    """Scan simulation output artifacts and render visualizations.

    Priority order:
      1. VTU/PVTU field files (from Palace paraview output) — if they exist
      2. mesh.msh files (always exist from GMSH) — guaranteed fallback

    Returns:
        List of served image URLs (e.g. ['/simulation-files/<id>/images/eigenmode_mesh.png'])
    """
    artifact_dir = Path(artifact_path)
    if not artifact_dir.exists():
        logger.warning(f"Artifact directory missing: {artifact_dir}")
        return []

    images_dir = artifact_dir / "images"
    images_dir.mkdir(parents=True, exist_ok=True)

    image_urls: List[str] = []

    for solver in ["eigenmode", "electrostatic"]:
        solver_dir = artifact_dir / solver
        if not solver_dir.exists():
            continue

        # --- Try VTU field files first ---
        paraview_dir = solver_dir / "out" / "paraview"
        vtu_rendered = False
        if paraview_dir.exists():
            # Look for .pvtu first (merged partitions), then .vtu
            vtu_files = sorted(paraview_dir.rglob("*.pvtu"))
            if not vtu_files:
                vtu_files = sorted([
                    p for p in paraview_dir.rglob("*.vtu")
                    if "boundary" not in str(p).lower()
                ])

            for idx, vtu_path in enumerate(vtu_files[:3]):  # Cap at 3 per solver
                png_name = f"{solver}_field_{idx}.png"
                png_path = images_dir / png_name
                if render_vtu_file(vtu_path, png_path):
                    image_urls.append(f"/simulation-files/{simulation_id}/images/{png_name}")
                    vtu_rendered = True

        # --- Fallback: render mesh.msh (always exists) ---
        mesh_path = solver_dir / "mesh.msh"
        if mesh_path.exists():
            png_name = f"{solver}_mesh.png"
            png_path = images_dir / png_name
            title = f"{solver.title()} — 3D Tetrahedral Mesh"
            if render_mesh_file(mesh_path, png_path, title=title):
                image_urls.append(f"/simulation-files/{simulation_id}/images/{png_name}")

    logger.info(f"Generated {len(image_urls)} visualization(s) for simulation {simulation_id}.")
    return image_urls
