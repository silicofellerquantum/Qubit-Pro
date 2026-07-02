"""Geometry Builder service for parsing and constructing EM geometries."""

from __future__ import annotations

import logging
import math
import re
from typing import Any, Dict, List, Optional

from app.core.design_graph.serializer import dict_to_graph
from app.simulation.workspace import WorkspaceManager, WorkspaceState
from app.simulation.geometry.exceptions import GeometryError, GeometryValidationError
from app.simulation.geometry.geometry_exporter import GeometryExporter
from app.simulation.geometry.geometry_models import GeometryComponent, GeometryComponentKind, GeometryMetadata, LogicalPort
from app.simulation.geometry.geometry_validator import GeometryValidator
from app.simulation.geometry.layer_manager import LayerManager
from app.simulation.geometry.material_mapper import MaterialMapper
from app.simulation.geometry.coordinate_transform import simplify_path
from app.simulation.geometry.port_builder import PortBuilder

logger = logging.getLogger(__name__)


class GeometryBuilder:
    """Orchestrator class for parsing, validating, and exporting design geometries."""

    def __init__(self, workspace_manager: Optional[WorkspaceManager] = None) -> None:
        """Initialize the Geometry Builder.

        Args:
            workspace_manager: Optional WorkspaceManager instance. Defaults to a new one.
        """
        self.workspace_manager = workspace_manager or WorkspaceManager()
        self.layer_manager = LayerManager()
        self.material_mapper = MaterialMapper()
        self.validator = GeometryValidator(self.layer_manager, self.material_mapper)

        logger.info("GeometryBuilder service successfully initialized.")

    def build_geometry(
        self, 
        simulation_id: str, 
        design_payload: Dict[str, Any]
    ) -> GeometryMetadata:
        """Parse a design payload, validate its geometry, and export artifacts to the workspace.

        This method supports both V2 Design Graph structures and legacy flat payloads.

        Args:
            simulation_id: The UUID of the simulation workspace.
            design_payload: The layout design payload dictionary.

        Returns:
            The schema-validated GeometryMetadata written to the workspace.

        Raises:
            WorkspaceNotFoundError: If the workspace does not exist.
            GeometryValidationError: If layout validation fails.
            GeometryExportError: If exporting geometry files fails.
        """
        logger.info("GeometryBuilder starting layout build for simulation: %s", simulation_id)

        # 1. Retrieve the sandboxed workspace
        workspace = self.workspace_manager.get_workspace(simulation_id)

        if not design_payload:
            raise GeometryValidationError("Empty design payload provided to GeometryBuilder.")

        # Helper to parse meander points from cachedSvg
        def _parse_svg_path_points(svg_str: str | None) -> list[tuple[float, float]] | None:
            if not svg_str:
                return None
            match = re.search(r'points=["\']([^"\']+)["\']', svg_str)
            if not match:
                return None
            points_str = match.group(1)
            tokens = points_str.strip().split()
            points = []
            for token in tokens:
                parts = token.split(',')
                if len(parts) == 2:
                    try:
                        # Convert from micrometers (um) to millimeters (mm)
                        x = float(parts[0]) / 1000.0
                        y = float(parts[1]) / 1000.0
                        points.append((x, y))
                    except ValueError:
                        continue
            if len(points) >= 2:
                return simplify_path(points)
            return None

        components: List[GeometryComponent] = []
        ports: List[LogicalPort] = []

        # Extract values based on payload version (V2 Graph vs Legacy Fallback)
        v2_data = design_payload.get("v2", {})
        graph_dict = v2_data.get("graph")

        # 1. Parse design details and materials
        design_id = "v2_design"
        chip_width_mm = 10.0
        chip_height_mm = 10.0
        substrate_material = "silicon"
        metal_material = "aluminum"

        if graph_dict:
            try:
                graph = dict_to_graph(graph_dict)
                design_id = graph.chip_name or "v2_design"
                chip_width_mm = float(graph.chip_width_mm) if graph.chip_width_mm else 10.0
                chip_height_mm = float(graph.chip_height_mm) if graph.chip_height_mm else 10.0
                substrate_material = graph.substrate or "silicon"
                metal_material = graph.metal or "aluminum"
            except Exception as e:
                logger.warning("Error parsing V2 graph to obtain parameters: %s", e)
        else:
            design_id = str(design_payload.get("id") or "legacy_design")
            freq_plan = design_payload.get("frequency_plan", {})
            substrate_material = str(freq_plan.get("substrate") or "silicon")
            metal_material = str(freq_plan.get("metal") or "aluminum")

        # 2. Extract components using high-fidelity QiskitMetalToPalaceConverter
        from app.services.geometry_converter import QiskitMetalToPalaceConverter
        converter = QiskitMetalToPalaceConverter(design_payload)
        
        # Fallback: if converter has no components and we have frequency plan qubits, synthesize them
        if not converter.components and not graph_dict:
            freq_plan = design_payload.get("frequency_plan", {})
            qubit_freqs = freq_plan.get("qubit_frequencies_GHz", {})
            if qubit_freqs:
                placement_cfg = design_payload.get("placement", {})
                pitch = float(placement_cfg.get("pitch_mm", 1.5))
                cols = int(placement_cfg.get("cols", 3))
                ej_map = freq_plan.get("EJ_GHz", {})
                ec_map = freq_plan.get("EC_GHz", {})

                for idx, (qname, freq) in enumerate(qubit_freqs.items()):
                    col = idx % cols
                    row = idx // cols
                    x_mm = (col - (cols - 1) / 2.0) * pitch
                    y_mm = (row - (max(1, len(qubit_freqs) // cols) - 1) / 2.0) * (-pitch)

                    converter.components.append({
                        "name": qname,
                        "type": "qubit",
                        "bounds": (x_mm - 0.325, y_mm - 0.325, x_mm + 0.325, y_mm + 0.325),
                        "layer": 1,
                        "original_class": "TransmonPocket",
                    })

        for comp_dict in converter.components:
            comp_id = comp_dict["name"]
            comp_type = comp_dict["type"]
            bounds = comp_dict["bounds"]  # (xmin, ymin, xmax, ymax)
            layer = "metal" if comp_dict["layer"] == 1 else str(comp_dict["layer"])
            orig_class = comp_dict["original_class"]

            xmin, ymin, xmax, ymax = bounds
            x_mm = round((xmin + xmax) / 2.0, 4)
            y_mm = round((ymin + ymax) / 2.0, 4)

            # Map type to GeometryComponentKind
            if comp_type == "qubit":
                kind = GeometryComponentKind.QUBIT
            elif comp_type == "resonator":
                kind = GeometryComponentKind.RESONATOR
            elif comp_type == "feedline":
                kind = GeometryComponentKind.FEEDLINE
            elif comp_type == "launchpad":
                kind = GeometryComponentKind.LAUNCHPAD
            elif comp_type == "cpw":
                if "resonator" in comp_id.lower():
                    kind = GeometryComponentKind.RESONATOR
                elif "coupler" in comp_id.lower() or "cpw" in comp_id.lower():
                    kind = GeometryComponentKind.COUPLER
                else:
                    kind = GeometryComponentKind.RESONATOR
            else:
                if "qubit" in comp_id.lower():
                    kind = GeometryComponentKind.QUBIT
                elif "resonator" in comp_id.lower():
                    kind = GeometryComponentKind.RESONATOR
                elif "feedline" in comp_id.lower():
                    kind = GeometryComponentKind.FEEDLINE
                elif "launchpad" in comp_id.lower():
                    kind = GeometryComponentKind.LAUNCHPAD
                else:
                    kind = GeometryComponentKind.COUPLER

            # Get original params from payload
            orig_params = {}
            if graph_dict:
                try:
                    graph = dict_to_graph(graph_dict)
                    for n in graph.nodes:
                        if n.id == comp_id:
                            if getattr(n, "design_options", None):
                                orig_params.update(n.design_options)
                            for field in ["frequency_ghz", "anharmonicity_ghz", "ej_ghz", "ec_ghz", "strength_mhz", "qubit_a_id", "qubit_b_id", "target_qubit_id", "length_mm", "cpw_width_um", "cpw_gap_um", "pad_width_um", "pad_gap_um"]:
                                val = getattr(n, field, None)
                                if val is not None:
                                    orig_params[field] = val
                            break
                    # If not found in nodes, check edges
                    if not orig_params:
                        for edge in graph.edges:
                            name = edge.get("label") or f"conn_{edge.get('source_id')}_{edge.get('target_id')}"
                            if name == comp_id:
                                orig_params.update({
                                    "source_id": edge.get("source_id"),
                                    "target_id": edge.get("target_id"),
                                })
                                break
                except Exception:
                    pass
            else:
                placements = design_payload.get("placements", [])
                if not placements and "design" in design_payload:
                    placements = design_payload["design"].get("placements", [])
                for pl in placements:
                    if pl.get("name") == comp_id or pl.get("id") == comp_id or pl.get("instanceId") == comp_id:
                        orig_params.update(pl.get("params", {}))
                        break
                if not orig_params:
                    connections = design_payload.get("connections", [])
                    if not connections and "design" in design_payload:
                        connections = design_payload["design"].get("connections", [])
                    for conn in connections:
                        if conn.get("id") == comp_id:
                            orig_params.update(conn.get("params", {}))
                            break

            # Handle path points for line structures
            if kind in (GeometryComponentKind.RESONATOR, GeometryComponentKind.COUPLER, GeometryComponentKind.FEEDLINE):
                svg = ""
                if graph_dict:
                    flat_connections = design_payload.get("design", {}).get("connections", [])
                    for conn in flat_connections:
                        if conn.get("id") == comp_id:
                            svg = conn.get("cachedSvg", "")
                            break
                else:
                    connections = design_payload.get("connections", [])
                    if not connections and "design" in design_payload:
                        connections = design_payload["design"].get("connections", [])
                    for conn in connections:
                        if conn.get("id") == comp_id:
                            svg = conn.get("cachedSvg", "")
                            break
                if svg:
                    path_points = _parse_svg_path_points(svg)
                    if path_points:
                        orig_params["path_points"] = path_points

            orientation_deg = 0.0
            if graph_dict:
                try:
                    graph = dict_to_graph(graph_dict)
                    for n in graph.nodes:
                        if n.id == comp_id:
                            orientation_deg = float(n.orientation_deg or 0.0)
                            break
                except Exception:
                    pass
            else:
                placements = design_payload.get("placements", [])
                if not placements and "design" in design_payload:
                    placements = design_payload["design"].get("placements", [])
                for pl in placements:
                    if pl.get("name") == comp_id or pl.get("id") == comp_id or pl.get("instanceId") == comp_id:
                        orientation_deg = float(pl.get("rotation" or "orientation_deg", 0.0))
                        break

            geom_comp = GeometryComponent(
                id=comp_id,
                kind=kind,
                x_mm=x_mm,
                y_mm=y_mm,
                orientation_deg=orientation_deg,
                layer=layer,
                material=metal_material,
                params=orig_params,
                bounding_box=bounds,
            )
            components.append(geom_comp)

            # Generate ports
            if kind == GeometryComponentKind.QUBIT:
                from app.simulation.geometry.constants import LAYER_JUNCTION
                port_id = f"port_{comp_id}"
                port = PortBuilder.build_port(
                    port_id=port_id,
                    x_mm=x_mm,
                    y_mm=y_mm,
                    orientation_deg=orientation_deg,
                    reference_layer=LAYER_JUNCTION,
                    associated_component_id=comp_id,
                )
                ports.append(port)
            elif kind == GeometryComponentKind.LAUNCHPAD:
                port = PortBuilder.build_port(
                    port_id=f"port_{comp_id}",
                    x_mm=x_mm,
                    y_mm=y_mm,
                    orientation_deg=orientation_deg,
                    reference_layer=layer,
                    associated_component_id=comp_id,
                )
                ports.append(port)
            elif kind in (GeometryComponentKind.RESONATOR, GeometryComponentKind.COUPLER, GeometryComponentKind.FEEDLINE):
                l_mm = (xmax - xmin) if (xmax - xmin) > 0 else 2.0
                if "length_mm" in orig_params:
                    l_mm = float(orig_params["length_mm"])
                elif "length_um" in orig_params:
                    l_mm = float(orig_params["length_um"]) / 1000.0
                elif "length" in orig_params:
                    l_mm = float(orig_params["length"]) / 1000.0

                angle_rad = math.radians(orientation_deg)
                dx = (l_mm / 2.0) * math.cos(angle_rad)
                dy = (l_mm / 2.0) * math.sin(angle_rad)

                port_in = PortBuilder.build_port(
                    port_id=f"port_{comp_id}_in",
                    x_mm=x_mm - dx,
                    y_mm=y_mm - dy,
                    orientation_deg=orientation_deg,
                    reference_layer=layer,
                    associated_component_id=comp_id,
                )
                port_out = PortBuilder.build_port(
                    port_id=f"port_{comp_id}_out",
                    x_mm=x_mm + dx,
                    y_mm=y_mm + dy,
                    orientation_deg=(orientation_deg + 180.0) % 360.0,
                    reference_layer=layer,
                    associated_component_id=comp_id,
                )
                ports.extend([port_in, port_out])

        # Center geometry so that the bounding box of active components is centered around (0, 0)
        # This keeps the design in the center of the die and prevents 3D view clipping.
        active_comps = [c for c in components if c.id != "die_substrate"]
        if active_comps:
            xs_min = [c.bounding_box[0] for c in active_comps if c.bounding_box]
            xs_max = [c.bounding_box[2] for c in active_comps if c.bounding_box]
            ys_min = [c.bounding_box[1] for c in active_comps if c.bounding_box]
            ys_max = [c.bounding_box[3] for c in active_comps if c.bounding_box]
            
            if xs_min and ys_min:
                g_xmin = min(xs_min)
                g_xmax = max(xs_max)
                g_ymin = min(ys_min)
                g_ymax = max(ys_max)
                
                cx = (g_xmin + g_xmax) / 2.0
                cy = (g_ymin + g_ymax) / 2.0
                
                logger.info("Centering geometry: shifting active area centered at (%.3f, %.3f) to (0,0)", cx, cy)
                
                # Shift components and their paths/bounds
                for c in components:
                    c.x_mm = round(c.x_mm - cx, 4)
                    c.y_mm = round(c.y_mm - cy, 4)
                    if c.bounding_box:
                        c.bounding_box = (
                            round(c.bounding_box[0] - cx, 4),
                            round(c.bounding_box[1] - cy, 4),
                            round(c.bounding_box[2] - cx, 4),
                            round(c.bounding_box[3] - cy, 4),
                        )
                    if c.params and "path_points" in c.params:
                        c.params["path_points"] = [
                            (round(pt[0] - cx, 4), round(pt[1] - cy, 4)) for pt in c.params["path_points"]
                        ]
                
                # Shift ports
                for p in ports:
                    p.x_mm = round(p.x_mm - cx, 4)
                    p.y_mm = round(p.y_mm - cy, 4)

        # Dynamically expand chip die size to fit all components if needed
        max_x_extent = 0.0
        max_y_extent = 0.0
        for c in components:
            if c.bounding_box:
                xmin, ymin, xmax, ymax = c.bounding_box
                max_x_extent = max(max_x_extent, abs(xmin), abs(xmax))
                max_y_extent = max(max_y_extent, abs(ymin), abs(ymax))


        margin = 0.2
        required_width = max_x_extent * 2.0 + margin
        required_height = max_y_extent * 2.0 + margin

        if required_width > chip_width_mm:
            logger.info("Expanding chip width from %s mm to %s mm to fit components", chip_width_mm, required_width)
            chip_width_mm = required_width
        if required_height > chip_height_mm:
            logger.info("Expanding chip height from %s mm to %s mm to fit components", chip_height_mm, required_height)
            chip_height_mm = required_height

        # 3. Inject substrate and air box as base components
        sub_comp = GeometryComponent(
            id="die_substrate",
            kind=GeometryComponentKind.GROUND_PLANE,
            x_mm=0.0,
            y_mm=0.0,
            orientation_deg=0.0,
            layer="substrate",
            material=substrate_material,
            params={"width_mm": chip_width_mm, "height_mm": chip_height_mm},
            bounding_box=(-chip_width_mm / 2.0, -chip_height_mm / 2.0, chip_width_mm / 2.0, chip_height_mm / 2.0),
        )
        components.insert(0, sub_comp)

        # 4. Perform full layout and connectivity validation
        self.validator.validate_design(components, ports, chip_width_mm, chip_height_mm)

        # 5. Export all geometry artifacts atomically to the workspace
        geom_metadata = GeometryExporter.export_geometry(
            workspace=workspace,
            design_id=design_id,
            components=components,
            ports=ports,
            chip_width_mm=chip_width_mm,
            chip_height_mm=chip_height_mm,
            raw_payload=design_payload,
            center_shift=(cx, cy) if "cx" in locals() else (0.0, 0.0),
        )

        # 6. Touch the workspace to record the update
        self.workspace_manager.touch_workspace(simulation_id)
        
        logger.info(
            "GeometryBuilder successfully compiled and exported layout '%s' for simulation %s.",
            design_id,
            simulation_id,
        )
        return geom_metadata
