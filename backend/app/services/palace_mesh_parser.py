"""Palace mesh parser for volume tetrahedral mesh visualization."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict, List, Optional
import numpy as np
import pyvista as pv

logger = logging.getLogger(__name__)

class PalaceMeshParser:
    """Parses a Gmsh/MFEM .msh file to extract vertices and tetrahedral elements for wireframe rendering."""

    def __init__(self):
        self.vertices: List[List[float]] = []      # Nx3 list of float coordinates [x, y, z]
        self.elements: List[List[int]] = []        # Mx4 list of 0-indexed vertex indices
        self.edges: List[List[int]] = []           # Kx2 list of deduplicated 0-indexed edges
        self.bounds: Dict[str, List[float]] = {
            "x": [0.0, 0.0],
            "y": [0.0, 0.0],
            "z": [0.0, 0.0]
        }
        self.physical_names: Dict[int, str] = {}    # physical tag -> name
        self.surface_triangles: Dict[int, List[List[int]]] = {} # physical tag -> list of [v0, v1, v2]

    def read_mfem_mesh(self, filepath: str | Path) -> None:
        """Parses a Gmsh .msh file (version 2.2) and extracts vertices and tetrahedra.

        Args:
            filepath: Path to the .msh file.
        """
        filepath = Path(filepath)
        if not filepath.exists():
            raise FileNotFoundError(f"Mesh file not found: {filepath}")

        # Map from Gmsh 1-based node ID to 0-based index in self.vertices
        node_id_map: Dict[int, int] = {}
        vertices: List[List[float]] = []
        elements: List[List[int]] = []
        self.physical_names = {}
        self.surface_triangles = {}

        with open(filepath, "r") as f:
            line = f.readline()
            while line:
                stripped = line.strip()
                if stripped == "$PhysicalNames":
                    # First line after $PhysicalNames is the number of physical names
                    num_names_str = f.readline().strip()
                    if not num_names_str:
                        break
                    num_names = int(num_names_str)
                    for _ in range(num_names):
                        name_line = f.readline().strip().split(' ', 2)
                        if not name_line or len(name_line) < 3:
                            break
                        # format: dimension tag "name"
                        tag = int(name_line[1])
                        name = name_line[2].strip('"')
                        self.physical_names[tag] = name

                elif stripped == "$Nodes":
                    # First line after $Nodes is the total number of nodes
                    num_nodes_str = f.readline().strip()
                    if not num_nodes_str:
                        break
                    num_nodes = int(num_nodes_str)
                    
                    for idx in range(num_nodes):
                        node_line = f.readline().strip().split()
                        if not node_line:
                            break
                        node_id = int(node_line[0])
                        x, y, z = float(node_line[1]), float(node_line[2]), float(node_line[3])
                        vertices.append([x, y, z])
                        node_id_map[node_id] = idx

                elif stripped == "$Elements":
                    # First line after $Elements is the total number of elements
                    num_elements_str = f.readline().strip()
                    if not num_elements_str:
                        break
                    num_elements = int(num_elements_str)
                    
                    for _ in range(num_elements):
                        elem_line = f.readline().strip().split()
                        if not elem_line:
                            break
                        
                        # Format: elm-number elm-type number-of-tags <tag> ... node-number-list
                        elm_type = int(elem_line[1])
                        num_tags = int(elem_line[2])
                        
                        # Gmsh element type 4 represents a 4-node tetrahedron
                        if elm_type == 4:
                            # Skip if physical group tag is 1 (air volume)
                            if num_tags >= 1:
                                try:
                                    physical_tag = int(elem_line[3])
                                    if physical_tag == 1:
                                        continue
                                except (ValueError, IndexError):
                                    pass

                            # Node IDs start after the tag list
                            node_ids_str = elem_line[3 + num_tags:]
                            elem_nodes = []
                            for nid_str in node_ids_str:
                                nid = int(nid_str)
                                if nid in node_id_map:
                                    elem_nodes.append(node_id_map[nid])
                                else:
                                    # Fallback in case of mapping issues
                                    elem_nodes.append(nid - 1)
                            elements.append(elem_nodes)

                        # Gmsh element type 2 (triangle) or 3 (quad) representing boundary surfaces
                        elif elm_type in (2, 3):
                            if num_tags >= 1:
                                try:
                                    physical_tag = int(elem_line[3])
                                except (ValueError, IndexError):
                                    physical_tag = 0
                            else:
                                physical_tag = 0

                            # We only care about boundary surfaces for components, ground, etc. (physical_tag >= 3)
                            if physical_tag >= 3:
                                node_ids_str = elem_line[3 + num_tags:]
                                elem_nodes = []
                                for nid_str in node_ids_str:
                                    nid = int(nid_str)
                                    if nid in node_id_map:
                                        elem_nodes.append(node_id_map[nid])
                                    else:
                                        elem_nodes.append(nid - 1)

                                if len(elem_nodes) == 3:
                                    self.surface_triangles.setdefault(physical_tag, []).append(elem_nodes)
                                elif len(elem_nodes) == 4:
                                    # Split quad ABCD into two triangles ABC and ACD
                                    self.surface_triangles.setdefault(physical_tag, []).append([elem_nodes[0], elem_nodes[1], elem_nodes[2]])
                                    self.surface_triangles.setdefault(physical_tag, []).append([elem_nodes[0], elem_nodes[2], elem_nodes[3]])
                
                line = f.readline()

        self.vertices = vertices
        self.elements = elements

        # Calculate bounding box
        if vertices:
            pts = np.array(vertices)
            min_bounds = pts.min(axis=0)
            max_bounds = pts.max(axis=0)
            self.bounds = {
                "x": [float(min_bounds[0]), float(max_bounds[0])],
                "y": [float(min_bounds[1]), float(max_bounds[1])],
                "z": [float(min_bounds[2]), float(max_bounds[2])],
            }
        else:
            self.bounds = {"x": [0.0, 0.0], "y": [0.0, 0.0], "z": [0.0, 0.0]}

        logger.info(
            "Successfully parsed Gmsh mesh: %d vertices, %d tetrahedra, %d boundary surface groups", 
            len(self.vertices), len(self.elements), len(self.surface_triangles)
        )

    def get_wireframe_edges(self) -> List[List[int]]:
        """Extracts all 6 edges per tetrahedron, deduplicates them, and returns the list.

        Returns:
            List of [v0, v1] where v0 < v1 are 0-indexed vertex indices.
        """
        if not self.elements:
            self.edges = []
            return []

        edge_set = set()
        for elem in self.elements:
            if len(elem) < 4:
                continue
            v0, v1, v2, v3 = elem[0], elem[1], elem[2], elem[3]
            # A tetrahedron has 6 edges:
            pairs = [
                (v0, v1), (v0, v2), (v0, v3),
                (v1, v2), (v1, v3), (v2, v3)
            ]
            for u, v in pairs:
                edge = (u, v) if u < v else (v, u)
                edge_set.add(edge)

        self.edges = [list(edge) for edge in sorted(edge_set)]
        return self.edges

    def to_json(self) -> Dict[str, Any]:
        """Formats the mesh data into a dictionary suitable for JSON serialization.

        Returns:
            Dictionary containing vertices, deduplicated edges, domain bounds, and boundary surfaces.
        """
        if not self.edges:
            self.get_wireframe_edges()

        surfaces_serialized = {}
        for tag, triangles in self.surface_triangles.items():
            name = self.physical_names.get(tag, f"attribute_{tag}")
            surfaces_serialized[name] = {
                "tag": tag,
                "triangles": triangles
            }

        return {
            "vertices": self.vertices,
            "edges": self.edges,
            "bounds": self.bounds,
            "surfaces": surfaces_serialized
        }


def parse_palace_mesh(
    artifact_dir: Path,
    sim_solver: str,
    sim_results: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    """Parses Palace simulation mesh file (.msh, .pvtu, .vtu, .e) and extracts volume elements.

    Args:
        artifact_dir: Path to the simulation artifact directory.
        sim_solver: Solver name (e.g., 'eigenmode').
        sim_results: Results dict from DB.

    Returns:
        Structured JSON dictionary matching the required volume mesh schema.
    """
    # 1. Locate the mesh file (mesh.msh or volumetric .pvtu/.vtu)
    mesh_path: Optional[Path] = None

    # Priority 1: Check for mesh.msh in the solver subdirectory or root artifact directory
    for folder in [artifact_dir / sim_solver, artifact_dir]:
        msh_file = folder / "mesh.msh"
        if msh_file.exists():
            mesh_path = msh_file
            break

    # Priority 2: Fallback to volumetric .pvtu or .vtu files in paraview directory
    if not mesh_path:
        vtu_files: List[Path] = []
        paraview_dir = artifact_dir / "postpro" / "paraview"
        if paraview_dir.exists():
            vtu_files.extend(list(paraview_dir.rglob("*.pvtu")))
            vtu_files.extend(list(paraview_dir.rglob("*.vtu")))
        if not vtu_files:
            vtu_files.extend(list(artifact_dir.rglob("*.pvtu")))
            vtu_files.extend(list(artifact_dir.rglob("*.vtu")))

        # Filter out boundary files
        non_boundary = [p for p in vtu_files if not any("boundary" in part.lower() for part in p.parts)]
        search_files = non_boundary if non_boundary else vtu_files
        if search_files:
            mesh_path = search_files[0]

    if not mesh_path:
        raise FileNotFoundError(
            f"No mesh (.msh) or volumetric VTU files found in artifact directory: {artifact_dir}"
        )

    logger.info("Parsing volume mesh from: %s", mesh_path)

    # 2. Read the mesh using PyVista
    dataset = pv.read(str(mesh_path))

    # If it is a MultiBlock dataset, combine it into an UnstructuredGrid
    if type(dataset).__name__ == "MultiBlock":
        dataset = dataset.combine()

    # Filter out air box (usually tag 1) using thresholding
    for possible_key in ["attribute", "gmsh:physical", "material_id"]:
        if possible_key in dataset.cell_data:
            try:
                filtered = dataset.threshold(1.5, scalars=possible_key)
                if filtered is not None and filtered.n_cells > 0:
                    dataset = filtered
            except Exception as e:
                logger.warning("Failed to threshold dataset in parse_palace_mesh: %s", e)
            break

    # 3. Extract vertices
    vertices = dataset.points.tolist()

    # 4. Extract elements (tetrahedral cells)
    cells = np.asarray(dataset.cells)
    cell_types = np.asarray(dataset.cell_types)

    elements: List[List[int]] = []

    # Fast path: all cells are tetrahedra
    if np.all(cell_types == 10) and len(cells) == dataset.n_cells * 5:
        elements = cells.reshape(-1, 5)[:, 1:].astype(int).tolist()
    else:
        # Slow/mixed path: parse cells array filtering for type 10 (VTK_TETRA)
        cells_len = len(cells)
        offset = 0
        cell_idx = 0
        while offset < cells_len:
            n_pts = cells[offset]
            if n_pts == 4 and cell_types[cell_idx] == 10:
                elements.append([
                    int(cells[offset + 1]),
                    int(cells[offset + 2]),
                    int(cells[offset + 3]),
                    int(cells[offset + 4])
                ])
            offset += 1 + n_pts
            cell_idx += 1

    # 5. Compute bounds
    bounds_arr = dataset.bounds  # [xmin, xmax, ymin, ymax, zmin, zmax]
    bounds = {
        "x": [float(bounds_arr[0]), float(bounds_arr[1])],
        "y": [float(bounds_arr[2]), float(bounds_arr[3])],
        "z": [float(bounds_arr[4]), float(bounds_arr[5])],
    }

    # 6. Extract Metadata
    frequency_ghz = 4.5
    if sim_results:
        eigenmode_data = sim_results.get("eigenmode", {})
        modes_list = eigenmode_data.get("modes", [])
        if modes_list:
            freq_hz = modes_list[0].get("frequency_ghz", 4.5e9)
            # Handle if stored in Hz or GHz
            if freq_hz > 1e6:
                frequency_ghz = freq_hz / 1e9
            else:
                frequency_ghz = freq_hz

    metadata = {
        "solver": sim_solver,
        "total_elements": len(elements),
        "total_vertices": len(vertices),
        "frequency_ghz": round(float(frequency_ghz), 4),
        "runtime_seconds": 58,  # Overwritten in the router endpoint
    }

    return {
        "mesh": {
            "vertices": vertices,
            "elements": elements,
            "bounds": bounds,
        },
        "metadata": metadata,
    }
