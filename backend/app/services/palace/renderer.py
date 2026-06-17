"""Headless 3D rendering service for Palace simulation artifacts."""

import os
from pathlib import Path
import pyvista as pv
import numpy as np
import logging

logger = logging.getLogger(__name__)

# Configure PyVista for headless/off-screen rendering
pv.OFF_SCREEN = True

# Start virtual framebuffer if running headlessly on Linux
if os.name == "posix" and not os.environ.get("DISPLAY"):
    try:
        pv.start_xvfb()
        logger.info("Started virtual framebuffer (Xvfb) for off-screen rendering in PyVistaRenderer.")
    except Exception as e:
        logger.warning(f"Could not start Xvfb in renderer.py: {e}. Rendering may fail in headless mode.")

class PyVistaRenderer:
    """Uses PyVista to render a static snapshot of Palace EM fields or mesh."""
    
    @staticmethod
    def render_simulation(artifact_path: str, output_image_path: str) -> bool:
        """Finds the best renderable data inside the artifact directory and renders it to PNG.
        
        Priority: VTU field data > mesh.msh geometry.
        """
        artifact_dir = Path(artifact_path)
        if not artifact_dir.exists():
            logger.error(f"Artifact dir not found: {artifact_dir}")
            return False
            
        # Try to find a VTU file containing field data
        vtu_file = None
        search_dirs = [
            artifact_dir / "eigenmode" / "out" / "paraview",
            artifact_dir / "electrostatic" / "out" / "paraview"
        ]
        
        for search_dir in search_dirs:
            if not search_dir.exists():
                continue
            for root, _, files in os.walk(search_dir):
                if "boundary" in root.lower():
                    continue
                for f in files:
                    if f.endswith((".vtu", ".pvtu")):
                        vtu_file = Path(root) / f
                        break
                if vtu_file:
                    break
            if vtu_file:
                break
        
        # If VTU found, render field data
        if vtu_file:
            return PyVistaRenderer._render_vtu(vtu_file, output_image_path)
        
        # Fallback: render mesh.msh
        for solver in ["eigenmode", "electrostatic"]:
            mesh_path = artifact_dir / solver / "mesh.msh"
            if mesh_path.exists():
                return PyVistaRenderer._render_mesh(mesh_path, output_image_path, solver)
                
        # Also check directly in artifact_dir
        mesh_path = artifact_dir / "mesh.msh"
        if mesh_path.exists():
            return PyVistaRenderer._render_mesh(mesh_path, output_image_path, "base")
        
        logger.error("No renderable files (.vtu or mesh.msh) found in artifact directory.")
        return False

    @staticmethod
    def _render_vtu(vtu_file: Path, output_image_path: str) -> bool:
        """Render VTU field data."""
        try:
            logger.info(f"Rendering 3D field from: {vtu_file}")
            mesh = pv.read(str(vtu_file))
            
            plotter = pv.Plotter(off_screen=True, window_size=[1200, 900])
            plotter.set_background("white", top="aliceblue")
            
            scalar_name = None
            if "E" in mesh.point_data:
                scalar_name = "E"
            elif "B" in mesh.point_data:
                scalar_name = "B"
            else:
                available = list(mesh.point_data.keys())
                if available:
                    scalar_name = available[0]
                    
            if scalar_name:
                if mesh.point_data[scalar_name].ndim > 1:
                    mesh.point_data["Magnitude"] = np.linalg.norm(mesh.point_data[scalar_name], axis=1)
                    scalar_name = "Magnitude"
                    
                plotter.add_mesh(mesh, scalars=scalar_name, cmap="viridis", show_scalar_bar=True,
                                 scalar_bar_args={"title": "Field Magnitude", "color": "black"})
            else:
                plotter.add_mesh(mesh, color="#4a90d9", show_edges=True, opacity=0.85)
                
            plotter.view_isometric()
            plotter.reset_camera()
            plotter.screenshot(output_image_path)
            plotter.close()
            return True
        except Exception as e:
            logger.exception(f"Failed to render VTU: {e}")
            return False

    @staticmethod
    def _render_mesh(mesh_path: Path, output_image_path: str, solver: str = "eigenmode") -> bool:
        """Render a GMSH mesh.msh file — always available as fallback."""
        try:
            logger.info(f"Rendering mesh from: {mesh_path}")
            mesh = pv.read(str(mesh_path))
            
            plotter = pv.Plotter(off_screen=True, window_size=[1200, 900])
            plotter.set_background("white", top="aliceblue")
            
            plotter.add_mesh(
                mesh,
                color="#4a90d9",
                opacity=0.85,
                show_edges=True,
                edge_color="#1a1a2e",
                line_width=0.3,
                lighting=True,
            )
            
            plotter.add_text(
                f"{solver.title()} — 3D Tetrahedral Mesh",
                position="upper_left",
                font_size=14,
                color="black",
                shadow=True,
            )
            
            stats = f"Nodes: {mesh.n_points:,}  |  Elements: {mesh.n_cells:,}"
            plotter.add_text(stats, position="lower_left", font_size=10, color="#555555")
            
            plotter.view_isometric()
            plotter.reset_camera()
            plotter.screenshot(output_image_path)
            plotter.close()
            
            logger.info(f"Rendered mesh to: {output_image_path}")
            return True
        except Exception as e:
            logger.exception(f"Failed to render mesh: {e}")
            return False
