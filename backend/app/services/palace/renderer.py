"""Headless 3D rendering service for Palace simulation artifacts."""

import os
from pathlib import Path
import pyvista as pv
import logging

logger = logging.getLogger(__name__)

class PyVistaRenderer:
    """Uses PyVista to render a static snapshot of Palace EM fields."""
    
    @staticmethod
    def render_simulation(artifact_path: str, output_image_path: str) -> bool:
        """Finds a VTU mesh inside the artifact directory and renders it to a PNG."""
        artifact_dir = Path(artifact_path)
        if not artifact_dir.exists():
            logger.error(f"Artifact dir not found: {artifact_dir}")
            return False
            
        # Try to find a VTU file containing field data
        vtu_file = None
        # Prioritize eigenmode domain VTUs which have field data
        search_dirs = [
            artifact_dir / "eigenmode" / "out" / "paraview",
            artifact_dir / "electrostatic" / "out" / "paraview"
        ]
        
        for search_dir in search_dirs:
            if not search_dir.exists():
                continue
            for root, _, files in os.walk(search_dir):
                # Skip boundary folders to focus on volume mesh
                if "boundary" in root.lower():
                    continue
                for f in files:
                    if f.endswith(".vtu") and f.startswith("proc"):
                        vtu_file = Path(root) / f
                        break
                if vtu_file:
                    break
            if vtu_file:
                break
                
        if not vtu_file:
            logger.error("No suitable .vtu file found for rendering.")
            return False
            
        try:
            logger.info(f"Rendering 3D mesh from: {vtu_file}")
            # Load mesh
            mesh = pv.read(str(vtu_file))
            
            # Setup plotter
            plotter = pv.Plotter(off_screen=True)
            plotter.background_color = "white"
            
            # Determine active scalar
            scalar_name = None
            if "E" in mesh.point_data:
                scalar_name = "E"
            elif "B" in mesh.point_data:
                scalar_name = "B"
            else:
                # Just use whatever is available or just color it solid
                available = list(mesh.point_data.keys())
                if available:
                    scalar_name = available[0]
                    
            if scalar_name:
                # Compute magnitude if it's a vector
                if mesh.point_data[scalar_name].ndim > 1:
                    import numpy as np
                    mesh.point_data["Magnitude"] = np.linalg.norm(mesh.point_data[scalar_name], axis=1)
                    scalar_name = "Magnitude"
                    
                plotter.add_mesh(mesh, scalars=scalar_name, cmap="viridis", show_scalar_bar=True, scalar_bar_args={"title": "Field Magnitude", "color": "black"})
            else:
                # Fallback purely geometric render
                plotter.add_mesh(mesh, color="lightblue", show_edges=True)
                
            plotter.view_isometric()
            plotter.screenshot(output_image_path)
            plotter.close()
            
            return True
        except Exception as e:
            logger.exception(f"Failed to render 3D snapshot: {e}")
            return False
