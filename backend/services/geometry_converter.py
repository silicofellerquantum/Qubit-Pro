"""Qiskit Metal to Palace 3D geometry converter service.

Extracts layout geometry, bounds, and component classifications from a
Qiskit Metal design (or raw DesignGraph JSON) and generates a complete,
physics-aligned Palace simulation configuration JSON with mesh refinement.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Tuple

logger = logging.getLogger(__name__)

class QiskitMetalToPalaceConverter:
    def __init__(self, qiskit_design: Any) -> None:
        """Initialize the converter with a Qiskit Metal design object or dictionary.

        Args:
            qiskit_design: A QDesign object or a dictionary representation of the design.
        """
        self.qiskit_design = qiskit_design
        self.components: List[Dict[str, Any]] = []
        self.geometry_entries: List[Dict[str, Any]] = []
        self.materials = self._default_materials()
        self.domains = self._default_domains()

        # Execute the extraction and conversion pipeline
        self.extract_components_from_design()
        self.build_geometry_list()

    def identify_special_components(self, name: str, comp_class: str) -> str:
        """Classify a component type as qubit, resonator, cpw, or coupler.

        Args:
            name: Component instance name.
            comp_class: Qiskit Metal class name.
        """
        name_lower = name.lower()
        class_lower = comp_class.lower()

        if "qubit" in class_lower or "pocket" in class_lower or "cross" in class_lower or name_lower.startswith("q"):
            return "qubit"
        elif "resonator" in class_lower or "coil" in class_lower or name_lower.startswith("r"):
            return "resonator"
        elif "route" in class_lower or "meander" in class_lower or "cpw" in name_lower or name_lower.startswith("route") or name_lower.startswith("conn"):
            return "cpw"
        elif "coupler" in class_lower or "launchpad" in class_lower or "port" in name_lower:
            return "coupler"
        else:
            return "coupler"  # Default fallback

    def _extract_from_real_design(self, design: Any) -> None:
        """Extract components and their overall bounding boxes from a real QDesign object."""
        comp_bounds: Dict[str, List[float]] = {}
        comp_classes: Dict[str, str] = {}
        comp_layers: Dict[str, int] = {}

        tables = getattr(design, "qgeometry", None)
        if not tables:
            logger.warning("Real design object has no qgeometry tables.")
            return

        # Iterate over all geometry tables (poly, path, junction)
        for tname, gdf in tables.tables.items():
            if gdf is None or len(gdf) == 0:
                continue
            for _, row in gdf.iterrows():
                comp_id = row.get("component")
                if comp_id is None:
                    continue
                # Map integer ID to QComponent
                comp_obj = design._components.get(comp_id)
                if not comp_obj:
                    continue
                comp_name = comp_obj.name
                comp_class = comp_obj.__class__.__name__
                layer = int(row.get("layer", 1))

                geom = row.get("geometry")
                if geom is None or geom.is_empty:
                    continue
                # Shapely bounds: (xmin, ymin, xmax, ymax)
                b = geom.bounds

                if comp_name not in comp_bounds:
                    comp_bounds[comp_name] = list(b)
                    comp_classes[comp_name] = comp_class
                    comp_layers[comp_name] = layer
                else:
                    comp_bounds[comp_name][0] = min(comp_bounds[comp_name][0], b[0])
                    comp_bounds[comp_name][1] = min(comp_bounds[comp_name][1], b[1])
                    comp_bounds[comp_name][2] = max(comp_bounds[comp_name][2], b[2])
                    comp_bounds[comp_name][3] = max(comp_bounds[comp_name][3], b[3])

        for name, bounds in comp_bounds.items():
            comp_class = comp_classes[name]
            comp_type = self.identify_special_components(name, comp_class)
            self.components.append({
                "name": name,
                "type": comp_type,
                "bounds": tuple(bounds),
                "layer": comp_layers.get(name, 1),
                "original_class": comp_class
            })

    def _extract_from_dict(self, design_dict: dict) -> None:
        """Extract components and estimated bounds from a dictionary/JSON payload."""
        v2_data = design_dict.get("v2", {})
        graph_dict = v2_data.get("graph")

        if graph_dict:
            # --- V2 Design Graph Flow ---
            logger.info("Extracting components from V2 design graph payload...")
            nodes = graph_dict.get("nodes", [])
            for n in nodes:
                name = n.get("id") or n.get("name") or "Unknown"
                comp_class = n.get("qubit_type") or n.get("resonator_type") or n.get("coupler_type") or n.get("kind") or "QComponent"
                x = float(n.get("x_mm", 0.0) if n.get("x_mm") is not None else 0.0)
                y = float(n.get("y_mm", 0.0) if n.get("y_mm") is not None else 0.0)
                params = n.get("design_options") or {}

                # Fallback to general params if empty
                if not params:
                    params = {k: v for k, v in n.items() if k not in ("id", "kind", "x_mm", "y_mm")}

                width_str = params.get("pocket_width_um") or params.get("pocket_width") or params.get("pad_width_um") or params.get("pad_width") or params.get("readout_radius") or "1.0mm"
                height_str = params.get("pocket_height_um") or params.get("pocket_height") or params.get("pad_height_um") or params.get("pad_height") or params.get("readout_radius") or "1.0mm"

                def parse_val(s: Any) -> float:
                    if isinstance(s, (int, float)):
                        return float(s)
                    s = str(s).strip().lower()
                    if s.endswith("um"):
                        return float(s[:-2]) / 1000.0
                    if s.endswith("mm"):
                        return float(s[:-2])
                    try:
                        return float(s)
                    except ValueError:
                        return 0.5

                w = parse_val(width_str)
                h = parse_val(height_str)

                xmin = x - w/2
                xmax = x + w/2
                ymin = y - h/2
                ymax = y + h/2

                comp_type = self.identify_special_components(name, comp_class)
                self.components.append({
                    "name": name,
                    "type": comp_type,
                    "bounds": (xmin, ymin, xmax, ymax),
                    "layer": int(params.get("layer", 1) if params.get("layer") is not None else 1),
                    "original_class": comp_class
                })

            # Parse edges / connections
            edges = graph_dict.get("edges", [])
            flat_connections = design_dict.get("design", {}).get("connections", [])
            flat_conn_map = {}
            for conn in flat_connections:
                cid = conn.get("id") or ""
                flat_conn_map[cid] = conn
                from_placement = conn.get("from", {}).get("placementId", "")
                to_placement = conn.get("to", {}).get("placementId", "")
                flat_conn_map[f"{from_placement}->{to_placement}"] = conn
                flat_conn_map[f"{to_placement}->{from_placement}"] = conn

            for edge in edges:
                name = edge.get("label") or f"conn_{edge.get('source_id')}_{edge.get('target_id')}"
                comp_class = "RouteMeander"
                
                # Try to find matching flat connection for cachedSvg
                matching_conn = flat_conn_map.get(name) or flat_conn_map.get(f"{edge.get('source_id')}->{edge.get('target_id')}")
                svg = matching_conn.get("cachedSvg", "") if matching_conn else ""
                xmin, ymin, xmax, ymax = 0.0, 0.0, 0.0, 0.0
                points_found = False

                if svg:
                    import re
                    pts_matches = re.findall(r'points="([^"]+)"', svg)
                    all_pts = []
                    for pm in pts_matches:
                        for pair in pm.strip().split():
                            parts = pair.split(",")
                            if len(parts) == 2:
                                try:
                                    all_pts.append((float(parts[0]) / 1000.0, float(parts[1]) / 1000.0))
                                except ValueError:
                                    pass
                    if all_pts:
                        xs = [pt[0] for pt in all_pts]
                        ys = [pt[1] for pt in all_pts]
                        xmin, xmax = min(xs), max(xs)
                        ymin, ymax = min(ys), max(ys)
                        points_found = True

                if not points_found:
                    src_id = edge.get("source_id")
                    tgt_id = edge.get("target_id")
                    src_node = next((n for n in nodes if n.get("id") == src_id), None)
                    tgt_node = next((n for n in nodes if n.get("id") == tgt_id), None)
                    if src_node and tgt_node:
                        fx = float(src_node.get("x_mm", 0.0) if src_node.get("x_mm") is not None else 0.0)
                        fy = float(src_node.get("y_mm", 0.0) if src_node.get("y_mm") is not None else 0.0)
                        tx = float(tgt_node.get("x_mm", 0.0) if tgt_node.get("x_mm") is not None else 0.0)
                        ty = float(tgt_node.get("y_mm", 0.0) if tgt_node.get("y_mm") is not None else 0.0)
                        xmin, xmax = min(fx, tx), max(fx, tx)
                        ymin, ymax = min(fy, ty), max(fy, ty)
                    else:
                        xmin, ymin, xmax, ymax = -1.0, -1.0, 1.0, 1.0

                comp_type = "cpw"
                self.components.append({
                    "name": name,
                    "type": comp_type,
                    "bounds": (xmin, ymin, xmax, ymax),
                    "layer": 1,
                    "original_class": comp_class
                })

        else:
            # --- Legacy Fallback Flow ---
            placements = design_dict.get("placements", [])
            if not placements and "design" in design_dict:
                placements = design_dict["design"].get("placements", [])

            for pl in placements:
                name = pl.get("name") or pl.get("instanceId") or pl.get("id") or "Unknown"
                comp_class = pl.get("componentId", "QComponent")
                x = float(pl.get("x", 0.0) if pl.get("x") is not None else 0.0)
                y = float(pl.get("y", 0.0) if pl.get("y") is not None else 0.0)
                params = pl.get("params", {})

                # Parse dimensions to estimate bounding box
                width_str = params.get("pocket_width") or params.get("pad_width") or params.get("readout_radius") or "1.0mm"
                height_str = params.get("pocket_height") or params.get("pad_height") or params.get("readout_radius") or "1.0mm"

                def parse_val(s: Any) -> float:
                    if isinstance(s, (int, float)):
                        return float(s)
                    s = str(s).strip().lower()
                    if s.endswith("um"):
                        return float(s[:-2]) / 1000.0
                    if s.endswith("mm"):
                        return float(s[:-2])
                    try:
                        return float(s)
                    except ValueError:
                        return 0.5

                w = parse_val(width_str)
                h = parse_val(height_str)

                # Center bounding box at placement coordinates
                xmin = x - w/2
                xmax = x + w/2
                ymin = y - h/2
                ymax = y + h/2

                comp_type = self.identify_special_components(name, comp_class)
                self.components.append({
                    "name": name,
                    "type": comp_type,
                    "bounds": (xmin, ymin, xmax, ymax),
                    "layer": int(params.get("layer", 1) if params.get("layer") is not None else 1),
                    "original_class": comp_class
                })

            # 2. Parse Connections (Routes)
            connections = design_dict.get("connections", [])
            if not connections and "design" in design_dict:
                connections = design_dict["design"].get("connections", [])

            for conn in connections:
                name = conn.get("id", "Route")
                comp_class = conn.get("routeComponentId", "RouteMeander")

                # Attempt to extract bounding box from cached SVG polyline coordinates
                svg = conn.get("cachedSvg", "")
                xmin, ymin, xmax, ymax = 0.0, 0.0, 0.0, 0.0
                points_found = False

                if svg:
                    import re
                    pts_matches = re.findall(r'points="([^"]+)"', svg)
                    all_pts = []
                    for pm in pts_matches:
                        for pair in pm.strip().split():
                            parts = pair.split(",")
                            if len(parts) == 2:
                                try:
                                    # SVG coords are scaled by 1000.0 (um), divide to get mm
                                    all_pts.append((float(parts[0]) / 1000.0, float(parts[1]) / 1000.0))
                                except ValueError:
                                    pass
                    if all_pts:
                        xs = [pt[0] for pt in all_pts]
                        ys = [pt[1] for pt in all_pts]
                        xmin, xmax = min(xs), max(xs)
                        ymin, ymax = min(ys), max(ys)
                        points_found = True

                if not points_found:
                    # Fallback: span bounds between the connected placements
                    from_pl_id = conn.get("from", {}).get("placementId")
                    to_pl_id = conn.get("to", {}).get("placementId")
                    from_pl = next((p for p in placements if p.get("id") == from_pl_id or p.get("instanceId") == from_pl_id or p.get("name") == from_pl_id), None)
                    to_pl = next((p for p in placements if p.get("id") == to_pl_id or p.get("instanceId") == to_pl_id or p.get("name") == to_pl_id), None)
                    if from_pl and to_pl:
                        fx = float(from_pl.get("x", 0.0) if from_pl.get("x") is not None else 0.0)
                        fy = float(from_pl.get("y", 0.0) if from_pl.get("y") is not None else 0.0)
                        tx = float(to_pl.get("x", 0.0) if to_pl.get("x") is not None else 0.0)
                        ty = float(to_pl.get("y", 0.0) if to_pl.get("y") is not None else 0.0)
                        xmin, xmax = min(fx, tx), max(fx, tx)
                        ymin, ymax = min(fy, ty), max(fy, ty)
                    else:
                        xmin, ymin, xmax, ymax = -1.0, -1.0, 1.0, 1.0

                comp_type = "cpw"
                self.components.append({
                    "name": name,
                    "type": comp_type,
                    "bounds": (xmin, ymin, xmax, ymax),
                    "layer": 1,
                    "original_class": comp_class
                })

    def extract_components_from_design(self) -> None:
        """Coordinate geometry extraction based on input type (QDesign vs Dict)."""
        if self.qiskit_design is None:
            return

        if hasattr(self.qiskit_design, "qgeometry"):
            try:
                self._extract_from_real_design(self.qiskit_design)
            except Exception as e:
                logger.warning("Failed to parse real QDesign object. Falling back to dict mode: %s", e)
                if isinstance(self.qiskit_design, dict):
                    self._extract_from_dict(self.qiskit_design)
        elif isinstance(self.qiskit_design, dict):
            self._extract_from_dict(self.qiskit_design)
        else:
            logger.warning("Unsupported design object type: %s", type(self.qiskit_design))

    def build_geometry_list(self) -> None:
        """Create Palace geometry entries for each component."""
        self.geometry_entries = []
        for comp in self.components:
            name = comp["name"]
            comp_type = comp["type"]
            xmin, ymin, xmax, ymax = comp["bounds"]

            # Map to copper trace element
            self.geometry_entries.append({
                "Name": f"{comp_type.upper()}_{name}",
                "Type": "Rectangle",
                "X": [float(xmin), float(xmax)],
                "Y": [float(ymin), float(ymax)],
                "Z": [0.0, 0.1],
                "Material": "Copper"
            })

    def _default_materials(self) -> Dict[str, Any]:
        """Return default material properties for Palace solvers."""
        return {
            "Silicon": {
                "Permittivity": 11.7,
                "Permeability": 1.0,
                "LossTangent": 1e-5
            },
            "Vacuum": {
                "Permittivity": 1.0,
                "Permeability": 1.0
            },
            "Copper": {
                "Permittivity": 1.0,
                "Permeability": 1.0,
                "Conductivity": 5.8e7  # S/m
            },
            "Aluminum": {
                "Permittivity": 1.0,
                "Permeability": 1.0,
                "Conductivity": 3.5e7  # S/m
            }
        }

    def _default_domains(self) -> Dict[str, Any]:
        """Return default physical domain sizes and layers."""
        return {
            "Substrate": {
                "Material": "Silicon",
                "Thickness_mm": 0.5,
                "Z_range": [-0.5, 0.0]
            },
            "Air": {
                "Material": "Vacuum",
                "Thickness_mm": 1.0,
                "Z_range": [0.0, 1.0]
            }
        }

    def generate_palace_config(self) -> Dict[str, Any]:
        """Generate the full Palace eigenmode simulation configuration."""
        return {
            "Problem": {
                "Type": "Electromagnetics",
                "Formulation": "VolumeCurrent"
            },
            "Solver": {
                "Type": "Eigenmode",
                "N_modes": 6
            },
            "Domains": self.domains,
            "Materials": self.materials,
            "Geometry": self.geometry_entries,
            "Mesh": {
                "Refinement": {
                    "Copper_traces": 5,
                    "Qubit_gap": 6,
                    "Air": 2
                }
            }
        }

    def save_config(self, path: str) -> None:
        """Serialize Palace configuration dict and save to the given path."""
        config_dict = self.generate_palace_config()
        p = Path(path)
        p.parent.mkdir(parents=True, exist_ok=True)
        with open(p, "w") as f:
            json.dump(config_dict, f, indent=2)
        logger.info("Saved Palace configuration JSON to %s", path)

    def get_geometry_summary(self) -> Dict[str, Any]:
        """Return component counts and overall bounds of the design."""
        if not self.components:
            return {
                "total_components": 0,
                "counts": {},
                "bounds": [0.0, 0.0, 0.0, 0.0]
            }

        counts: Dict[str, int] = {}
        xs: List[float] = []
        ys: List[float] = []
        for comp in self.components:
            comp_type = comp["type"]
            counts[comp_type] = counts.get(comp_type, 0) + 1
            xmin, ymin, xmax, ymax = comp["bounds"]
            xs.extend([xmin, xmax])
            ys.extend([ymin, ymax])

        overall_bounds = [min(xs), min(ys), max(xs), max(ys)]
        return {
            "total_components": len(self.components),
            "counts": counts,
            "bounds": overall_bounds
        }
