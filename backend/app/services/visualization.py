"""3D Mesh and E-field visualization service for Palace simulation results."""

from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Any, Dict, List, Optional
import numpy as np
import pyvista as pv

logger = logging.getLogger(__name__)

# Locate project root dynamically
def get_project_root() -> Path:
    current_dir = Path(__file__).resolve().parent
    for parent in [current_dir] + list(current_dir.parents):
        if (parent / "backend").exists() and (parent / "frontend").exists():
            return parent
    return Path("/home/drdo/Desktop/sim-spack")

def _mode_index(path: Path) -> Optional[int]:
    """Extract Cycle/mode index from a VTU/PVTU path."""
    for part in path.parts:
        m = re.search(r"[Cc]ycle(\d+)", part)
        if m:
            return int(m.group(1))
    return None

def extract_3d_visualization(
    artifact_dir: Path,
    sim_solver: str,
    sim_results: Optional[Dict[str, Any]],
    mode: int = 1,
    field_name: Optional[str] = None,
) -> Dict[str, Any]:
    """Reads .pvtu/.vtu files, extracts surface mesh, specified field magnitude, and maps vertex colors.

    Args:
        artifact_dir: Path to the simulation artifact directory.
        sim_solver: The solver type string (e.g., 'eigenmode').
        sim_results: Parsed simulation results dictionary from the DB.
        mode: The 1-based eigenmode index to visualize.
        field_name: Optional name of the field array to extract (e.g., 'U_m', 'B').

    Returns:
        Dict matching the required frontend 3D visualization JSON schema.
    """
    # 1. Find VTU/PVTU files in the artifact directory
    vtu_files: List[Path] = []
    
    # Palace outputs paraview files under postpro/paraview/
    paraview_dir = artifact_dir / "postpro" / "paraview"
    if paraview_dir.exists():
        vtu_files.extend(list(paraview_dir.rglob("*.pvtu")))
        vtu_files.extend(list(paraview_dir.rglob("*.vtu")))
        
    # Fallback to searching the entire artifact directory recursively
    if not vtu_files:
        vtu_files.extend(list(artifact_dir.rglob("*.pvtu")))
        vtu_files.extend(list(artifact_dir.rglob("*.vtu")))

    if not vtu_files:
        raise FileNotFoundError(
            f"No VTU or PVTU files found in artifact directory: {artifact_dir}"
        )

    # Filter out boundary datasets for the main volumetric/surface visualization
    non_boundary_files = [
        p for p in vtu_files if not any("boundary" in part.lower() for part in p.parts)
    ]
    search_files = non_boundary_files if non_boundary_files else vtu_files

    surf = None

    # 1. Primary path: Try extracting from boundary file with attribute threshold (previously PATH B)
    boundary_files = [
        p for p in vtu_files if any("boundary" in part.lower() for part in p.parts) or "boundary" in p.name.lower()
    ]
    boundary_file: Optional[Path] = None
    if boundary_files:
        for p in boundary_files:
            m_idx = _mode_index(p)
            if m_idx == mode:
                boundary_file = p
                break
        if not boundary_file:
            boundary_file = boundary_files[0]

    if boundary_file:
        try:
            logger.info("Loading boundary dataset for 3D visualization: %s (mode %d)", boundary_file, mode)
            boundary_ds = pv.read(str(boundary_file))
            if boundary_ds.n_points > 0:
                if "attribute" in boundary_ds.cell_data:
                    # Keep ground plane (3) and active components (>=10, >=100), excluding the outer air box (4)
                    g_plane = None
                    active_parts = None
                    try:
                        g_plane = boundary_ds.threshold((2.9, 3.1), scalars="attribute")
                    except Exception as e:
                        logger.debug("No ground plane (attribute 3) found: %s", e)
                        
                    try:
                        active_parts = boundary_ds.threshold(9.5, scalars="attribute")
                    except Exception as e:
                        logger.debug("No active parts (attribute >= 9.5) found: %s", e)
                        
                    chip_surfaces = None
                    if g_plane and g_plane.n_cells > 0 and active_parts and active_parts.n_cells > 0:
                        try:
                            chip_surfaces = g_plane.merge(active_parts).clean()
                        except Exception as e:
                            logger.warning("Failed to merge ground plane and active parts: %s", e)
                    
                    if not chip_surfaces:
                        if active_parts and active_parts.n_cells > 0:
                            chip_surfaces = active_parts.clean()
                        elif g_plane and g_plane.n_cells > 0:
                            chip_surfaces = g_plane.clean()

                    attrs = boundary_ds.cell_data["attribute"]
                    unique, counts = np.unique(attrs, return_counts=True)
                    logger.info("Boundary attribute distribution: %s", dict(zip(unique.tolist(), counts.tolist())))
                    if chip_surfaces and hasattr(chip_surfaces, "n_points") and chip_surfaces.n_points >= 10:
                        surf = chip_surfaces.extract_surface().triangulate()
                        logger.info("Successfully extracted boundary surfaces from boundary dataset (ground + active threshold).")
                
                
                if surf is None:
                    candidate_surf = boundary_ds.extract_surface().triangulate()
                    if hasattr(candidate_surf, "n_points") and candidate_surf.n_points >= 10:
                        surf = candidate_surf
                        logger.info("Successfully extracted boundary surface (no threshold fallback).")
        except Exception as e:
            logger.warning("Failed to extract from boundary file: %s", e)

    # 2. Secondary path: Fall back to volume dataset and clip to substrate (Z <= 0) (previously PATH A)
    if surf is None:
        # Find the volume file matching the requested mode/Cycle index
        vtu_file: Optional[Path] = None
        for p in search_files:
            m_idx = _mode_index(p)
            if m_idx == mode:
                vtu_file = p
                break

        # Fallback if no exact mode match
        if not vtu_file:
            pvtu_files = [p for p in search_files if p.suffix.lower() == ".pvtu"]
            vtu_file = pvtu_files[0] if pvtu_files else search_files[0]

        try:
            logger.info("Loading volume dataset for 3D visualization: %s (mode %d)", vtu_file, mode)
            dataset = pv.read(str(vtu_file))
            
            # Clip to substrate (Z <= 0) to remove the outer air box and reveal the chip plane
            render_mesh = dataset.clip(normal="z", origin=(0, 0, 0), invert=True)
            if hasattr(render_mesh, "n_points") and isinstance(render_mesh.points, np.ndarray) and render_mesh.n_points > 10:
                surf = render_mesh.extract_surface().triangulate()
                logger.info("Successfully extracted 3D substrate slab surface (Z <= 0) from volume dataset.")
        except Exception as e:
            logger.debug("Volume substrate clipping not used or failed: %s", e)

    # 3. Final Fallback: Use unclipped volume external surface
    if surf is None:
        # Ensure dataset is loaded
        if 'dataset' not in locals() or dataset is None:
            try:
                # Find the volume file matching the requested mode/Cycle index
                vtu_file = None
                for p in search_files:
                    m_idx = _mode_index(p)
                    if m_idx == mode:
                        vtu_file = p
                        break
                if not vtu_file:
                    pvtu_files = [p for p in search_files if p.suffix.lower() == ".pvtu"]
                    vtu_file = pvtu_files[0] if pvtu_files else search_files[0]
                dataset = pv.read(str(vtu_file))
            except Exception:
                dataset = None

        if dataset is not None:
            try:
                surf = dataset.extract_surface().triangulate()
                logger.info("Falling back to volume external surface for 3D visualization.")
            except Exception as e:
                logger.error("Failed to extract external surface: %s", e)

    # If all else fails and we have no mesh, raise an error
    if surf is None:
        raise ValueError("Could not extract any 3D surface mesh from the simulation files.")

    # Compute smooth vertex normals
    surf.compute_normals(cell_normals=False, point_normals=True, inplace=True)

    # Convert cell data attributes to point data if needed
    try:
        if "attribute" in surf.cell_data and "attribute" not in surf.point_data:
            surf = surf.cell_data_to_point_data()
    except Exception as e:
        logger.warning("Failed to convert cell data to point data: %s", e)

    # Extract geometry attributes
    vertices = surf.points.tolist()
    faces = surf.faces.reshape(-1, 4)[:, 1:].tolist()
    normals = surf.point_normals.tolist()

    attributes = [0] * len(vertices)
    if "attribute" in surf.point_data:
        try:
            attributes = [int(x) for x in surf.point_data["attribute"]]
        except Exception as e:
            logger.warning("Failed to parse attribute array: %s", e)

    # 4. Locate and extract specified field or default to Electric Field (E-field)
    available_keys = list(surf.point_data.keys())
    target_key = None

    # Check for requested field name first
    if field_name:
        for key in available_keys:
            if key.lower() == field_name.lower() or field_name.lower() in key.lower():
                target_key = key
                break

    if not target_key:
        field_keys_lower = ["e", "e_real", "e_imag", "e_mag", "e_field"]
        # First, search for exact case-insensitive matches for electric field keys
        for key in available_keys:
            if key.lower() in field_keys_lower:
                target_key = key
                break

    # Second, fallback to keys starting with 'e' (excluding eps/eta) to handle custom names
    if not target_key:
        for key in available_keys:
            kl = key.lower()
            if kl.startswith("e") and not kl.startswith("eps") and not kl.startswith("eta"):
                target_key = key
                break

    if not target_key and available_keys:
        target_key = available_keys[0]

    if target_key:
        arr = np.asarray(surf.point_data[target_key])
        if arr.ndim > 1:
            values_arr = np.linalg.norm(arr, axis=1)
        else:
            values_arr = arr
    else:
        values_arr = np.zeros(len(vertices))

    values_arr = np.nan_to_num(values_arr, nan=0.0, posinf=0.0, neginf=0.0)
    values = values_arr.tolist()

    # 5. Color Mapping using a true Logarithmic Scale (4 Decades, matching Figure 2)
    # E-field values vary exponentially near conductor edges. A linear scale washes
    # out the entire chip field. A 4-decade logarithmic scale perfectly resolves
    # the field decay from peak value down to 1e-4 of the peak.
    v_min = float(values_arr.min())
    v_max = float(values_arr.max())

    colors: List[List[int]] = []
    if v_max > 0:
        log_max = np.log10(v_max)
        log_min = np.log10(max(v_min, v_max * 1e-8))  # floor at 8 decades below peak, matching AWS Palace reference scale
        
        # Compute logarithmic scale values, clamping lower bounds to log_min
        log_values = np.log10(np.maximum(values_arr, 1e-20))
        norm_vals = (log_values - log_min) / (log_max - log_min)
        norm_vals = np.clip(norm_vals, 0.0, 1.0)
    else:
        norm_vals = np.zeros_like(values_arr)

    for t in norm_vals:
        t_val = max(0.0, min(1.0, float(t)))
        # Jet Colormap: Blue -> Cyan -> Green -> Yellow -> Red
        if t_val < 0.25:
            u = t_val / 0.25
            r = 0
            g = int(255 * u)
            b = 255
        elif t_val < 0.5:
            u = (t_val - 0.25) / 0.25
            r = 0
            g = 255
            b = int(255 * (1.0 - u))
        elif t_val < 0.75:
            u = (t_val - 0.5) / 0.25
            r = int(255 * u)
            g = 255
            b = 0
        else:
            u = (t_val - 0.75) / 0.25
            r = 255
            g = int(255 * (1.0 - u))
            b = 0
        colors.append([r, g, b])

    # 6. Extract Metadata
    frequency_ghz = 0.0
    modes_count = len(vtu_files)

    if sim_results:
        solver = sim_results.get("solver_type", sim_solver)
        eigenmode_data = sim_results.get("eigenmode", {})
        modes_list = eigenmode_data.get("modes", [])
        if modes_list:
            modes_count = len(modes_list)
            for m_data in modes_list:
                if m_data.get("mode_index") == mode:
                    frequency_ghz = m_data.get("frequency_ghz", 0.0)
                    if frequency_ghz > 1e6:
                        frequency_ghz = frequency_ghz / 1e9
                    break
            else:
                frequency_ghz = modes_list[0].get("frequency_ghz", 0.0)
                if frequency_ghz > 1e6:
                    frequency_ghz = frequency_ghz / 1e9
    else:
        solver = sim_solver

    if frequency_ghz == 0.0:
        frequency_ghz = 4.5

    # Get volumetric nodes count safely
    mesh_nodes = surf.n_points
    try:
        if 'dataset' in locals() and dataset is not None and hasattr(dataset, 'n_points'):
            mesh_nodes = dataset.n_points
    except Exception:
        pass

    metadata = {
        "solver": solver,
        "frequency_ghz": round(frequency_ghz, 4),
        "modes": modes_count,
        "mesh_nodes": mesh_nodes,
        "runtime_seconds": 58,  # Overwritten in the endpoint router
    }

    return {
        "mesh": {
            "vertices": vertices,
            "faces": faces,
            "normals": normals,
            "attributes": attributes,
        },
        "field": {
            "name": target_key if target_key else "E_magnitude",
            "unit": "J/m³" if target_key and "u" in target_key.lower() else ("T" if target_key and "b" in target_key.lower() else "V/m"),
            "values": values,
            "colors": colors,
            "min": v_min,
            "max": v_max,
            "colorMap": "rainbow",
        },
        "metadata": metadata,
    }

