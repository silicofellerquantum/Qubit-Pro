"""Geometry Builder service for parsing and constructing EM geometries."""

from __future__ import annotations

import logging
import math
import re
from typing import Any, Dict, List, Optional

from app.core.design_graph.serializer import dict_to_graph
from app.simulation.workspace import WorkspaceManager, WorkspaceState
from app.simulation.geometry.component_factory import ComponentFactory
from app.simulation.geometry.exceptions import GeometryError, GeometryValidationError
from app.simulation.geometry.geometry_exporter import GeometryExporter
from app.simulation.geometry.geometry_models import GeometryComponent, GeometryComponentKind, GeometryMetadata, LogicalPort
from app.simulation.geometry.geometry_validator import GeometryValidator
from app.simulation.geometry.layer_manager import LayerManager
from app.simulation.geometry.material_mapper import MaterialMapper
from app.simulation.geometry.coordinate_transform import simplify_path

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

        if graph_dict:
            # --- V2 Design Graph Flow ---
            logger.info("Parsing V2 design graph payload...")
            try:
                graph = dict_to_graph(graph_dict)
                design_id = graph.chip_name or "v2_design"
                chip_width_mm = float(graph.chip_width_mm) if graph.chip_width_mm else 10.0
                chip_height_mm = float(graph.chip_height_mm) if graph.chip_height_mm else 10.0
                substrate_material = graph.substrate or "silicon"
                metal_material = graph.metal or "aluminum"

                # Parse Qubits
                for q in graph.qubits:
                    q_params = {
                        "pad_width_um": getattr(q, "pad_width_um", 455.0),
                        "pad_height_um": getattr(q, "pad_height_um", 90.0),
                        "pad_gap_um": getattr(q, "pad_gap_um", 30.0),
                        "pocket_width_um": getattr(q, "pocket_width_um", 650.0),
                        "pocket_height_um": getattr(q, "pocket_height_um", 650.0),
                        "frequency_ghz": q.frequency_ghz,
                    }
                    if getattr(q, "design_options", None):
                        q_params.update(q.design_options)

                    comp, c_ports = ComponentFactory.create_component(
                        component_id=q.id,
                        kind=GeometryComponentKind.QUBIT,
                        x_mm=q.x_mm if q.x_mm is not None else 0.0,
                        y_mm=q.y_mm if q.y_mm is not None else 0.0,
                        orientation_deg=float(q.orientation_deg or 0.0),
                        layer="metal",
                        material=metal_material,
                        params=q_params,
                    )
                    components.append(comp)
                    ports.extend(c_ports)

                # Parse Resonators
                for r in graph.resonators:
                    r_params = {
                        "length_mm": r.length_mm,
                        "frequency_ghz": r.frequency_ghz,
                        "target_qubit_id": r.target_qubit_id,
                    }
                    if getattr(r, "design_options", None):
                        r_params.update(r.design_options)

                    comp, c_ports = ComponentFactory.create_component(
                        component_id=r.id,
                        kind=GeometryComponentKind.RESONATOR,
                        x_mm=r.x_mm if r.x_mm is not None else 0.0,
                        y_mm=r.y_mm if r.y_mm is not None else 0.0,
                        orientation_deg=float(r.orientation_deg or 0.0),
                        layer="metal",
                        material=metal_material,
                        params=r_params,
                    )
                    components.append(comp)
                    ports.extend(c_ports)

                # Parse Couplers
                for c in graph.couplers:
                    c_params = {
                        "strength_mhz": c.strength_mhz,
                        "qubit_a_id": c.qubit_a_id,
                        "qubit_b_id": c.qubit_b_id,
                    }
                    if getattr(c, "design_options", None):
                        c_params.update(c.design_options)

                    comp, c_ports = ComponentFactory.create_component(
                        component_id=c.id,
                        kind=GeometryComponentKind.COUPLER,
                        x_mm=c.x_mm if c.x_mm is not None else 0.0,
                        y_mm=c.y_mm if c.y_mm is not None else 0.0,
                        orientation_deg=float(c.orientation_deg or 0.0),
                        layer="metal",
                        material=metal_material,
                        params=c_params,
                    )
                    components.append(comp)
                    ports.extend(c_ports)

                # Parse Feedlines
                for f in graph.feedlines:
                    f_params = {
                        "length_mm": f.length_mm,
                        "cpw_width_um": f.cpw_width_um,
                        "cpw_gap_um": f.cpw_gap_um,
                    }
                    if getattr(f, "design_options", None):
                        f_params.update(f.design_options)

                    comp, c_ports = ComponentFactory.create_component(
                        component_id=f.id,
                        kind=GeometryComponentKind.FEEDLINE,
                        x_mm=f.x_mm if f.x_mm is not None else 0.0,
                        y_mm=f.y_mm if f.y_mm is not None else 0.0,
                        orientation_deg=float(f.orientation_deg or 0.0),
                        layer="metal",
                        material=metal_material,
                        params=f_params,
                    )
                    components.append(comp)
                    ports.extend(c_ports)

                # Parse Launchpads
                for lp in graph.launchpads:
                    lp_params = {
                        "pad_width_um": lp.pad_width_um,
                        "pad_gap_um": getattr(lp, "pad_gap_um", 15.0),
                    }
                    if getattr(lp, "design_options", None):
                        lp_params.update(lp.design_options)

                    comp, c_ports = ComponentFactory.create_component(
                        component_id=lp.id,
                        kind=GeometryComponentKind.LAUNCHPAD,
                        x_mm=lp.x_mm if lp.x_mm is not None else 0.0,
                        y_mm=lp.y_mm if lp.y_mm is not None else 0.0,
                        orientation_deg=float(lp.orientation_deg or 0.0),
                        layer="metal",
                        material=metal_material,
                        params=lp_params,
                    )
                    components.append(comp)
                    ports.extend(c_ports)

                # Parse Connections (Edges)
                node_coords = {}
                for n in graph.nodes:
                    node_coords[n.id] = (n.x_mm if n.x_mm is not None else 0.0, n.y_mm if n.y_mm is not None else 0.0)

                flat_connections = design_payload.get("design", {}).get("connections", [])
                flat_conn_map = {}
                
                def clean_id(pid: str) -> str:
                    if pid.startswith("comp_"):
                        return pid[len("comp_"):]
                    return pid

                for conn in flat_connections:
                    cid = conn.get("id") or ""
                    flat_conn_map[cid] = conn
                    
                    from_placement = clean_id(conn.get("from", {}).get("placementId", ""))
                    to_placement = clean_id(conn.get("to", {}).get("placementId", ""))
                    flat_conn_map[f"{from_placement}->{to_placement}"] = conn
                    flat_conn_map[f"{to_placement}->{from_placement}"] = conn

                for edge in graph.edges:
                    edge_id = edge.label or f"conn_{edge.source_id}_{edge.target_id}"
                    src_id = edge.source_id
                    tgt_id = edge.target_id

                    if src_id in node_coords and tgt_id in node_coords:
                        ax, ay = node_coords[src_id]
                        bx, by = node_coords[tgt_id]
                        mx = (ax + bx) / 2.0
                        my = (ay + by) / 2.0
                        dist = math.sqrt((bx - ax)**2 + (by - ay)**2)
                        angle = math.degrees(math.atan2(by - ay, bx - ax))

                        kind = GeometryComponentKind.RESONATOR

                        conn_params = {
                            "length_mm": dist,
                            "cpw_width_um": 10.0,
                            "cpw_gap_um": 5.0,
                        }
                        
                        matching_conn = flat_conn_map.get(edge_id) or flat_conn_map.get(f"{src_id}->{tgt_id}")
                        if matching_conn:
                            if matching_conn.get("params"):
                                conn_params.update(matching_conn.get("params"))
                            
                            path_points = _parse_svg_path_points(matching_conn.get("cachedSvg"))
                            if path_points:
                                conn_params["path_points"] = path_points

                        comp, c_ports = ComponentFactory.create_component(
                            component_id=edge_id,
                            kind=kind,
                            x_mm=round(mx, 4),
                            y_mm=round(my, 4),
                            orientation_deg=round(angle, 2),
                            layer="metal",
                            material=metal_material,
                            params=conn_params,
                        )
                        components.append(comp)
                        ports.extend(c_ports)

            except Exception as e:
                logger.error("Failed to parse V2 design graph layout: %s", e)
                raise GeometryValidationError(f"Failed to parse V2 design graph: {e}") from e

        else:
            # --- Legacy Fallback Flow ---
            logger.info("Falling back to legacy flat payload layout parsing...")
            design = design_payload.get("design", {})
            design_id = str(design_payload.get("id") or "legacy_design")
            chip_width_mm = 10.0
            chip_height_mm = 10.0
            
            freq_plan = design_payload.get("frequency_plan", {})
            substrate_material = str(freq_plan.get("substrate") or "silicon")
            metal_material = str(freq_plan.get("metal") or "aluminum")

            placements = design.get("placements", [])
            placement_map = {}

            for p in placements:
                inst_id = p.get("instanceId") or p.get("instance_id") or p.get("id") or p.get("name") or ""
                
                if "x" in p and "y" in p:
                    x = float(p["x"])
                    y = float(p["y"])
                elif "location" in p and isinstance(p["location"], dict):
                    x = float(p["location"].get("x", 0.0))
                    y = float(p["location"].get("y", 0.0))
                else:
                    x = 0.0
                    y = 0.0
                    
                rot = float(p.get("rotation" or "orientation_deg", 0.0))
                placement_map[inst_id] = (x, y)

                # Deduce kind from ID naming convention
                inst_lower = inst_id.lower()
                comp_lower = str(p.get("componentId", "")).lower()
                
                if "qubit" in inst_lower or "qubit" in comp_lower or "transmon" in comp_lower:
                    kind = GeometryComponentKind.QUBIT
                elif "resonator" in inst_lower or "meander" in comp_lower or "res" in inst_lower:
                    kind = GeometryComponentKind.RESONATOR
                elif "coupler" in inst_lower or "coupler" in comp_lower:
                    kind = GeometryComponentKind.COUPLER
                elif "feed" in inst_lower or "line" in inst_lower:
                    kind = GeometryComponentKind.FEEDLINE
                else:
                    kind = GeometryComponentKind.LAUNCHPAD

                comp, c_ports = ComponentFactory.create_component(
                    component_id=inst_id,
                    kind=kind,
                    x_mm=x,
                    y_mm=y,
                    orientation_deg=rot,
                    layer="metal",
                    material=metal_material,
                    params=p.get("params", {}),
                )
                components.append(comp)
                ports.extend(c_ports)

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

            # Parse connections in legacy fallback flow
            connections = design.get("connections", [])
            for conn in connections:
                conn_id = conn.get("id") or ""
                from_data = conn.get("from", {})
                to_data = conn.get("to", {})
                from_id = from_data.get("placementId")
                to_id = to_data.get("placementId")

                if from_id in placement_map and to_id in placement_map:
                    ax, ay = placement_map[from_id]
                    bx, by = placement_map[to_id]
                    mx = (ax + bx) / 2.0
                    my = (ay + by) / 2.0
                    dist = math.sqrt((bx - ax)**2 + (by - ay)**2)
                    angle = math.degrees(math.atan2(by - ay, bx - ax))

                    # Deduce kind (default to RESONATOR for CPW meanders)
                    kind = GeometryComponentKind.RESONATOR

                    conn_params = {
                        "length_mm": dist,
                        "cpw_width_um": 10.0,
                        "cpw_gap_um": 5.0,
                    }
                    if conn.get("params"):
                        conn_params.update(conn.get("params"))

                    # Parse and inject meandered path points if available
                    path_points = _parse_svg_path_points(conn.get("cachedSvg"))
                    if path_points:
                        conn_params["path_points"] = path_points

                    comp, c_ports = ComponentFactory.create_component(
                        component_id=conn_id,
                        kind=kind,
                        x_mm=round(mx, 4),
                        y_mm=round(my, 4),
                        orientation_deg=round(angle, 2),
                        layer="metal",
                        material=metal_material,
                        params=conn_params,
                    )
                    components.append(comp)
                    ports.extend(c_ports)

            # Fallback: synthesize qubit elements from frequency_plan if placements empty
            qubit_freqs = freq_plan.get("qubit_frequencies_GHz", {})
            if not components and qubit_freqs:
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

                    comp, c_ports = ComponentFactory.create_component(
                        component_id=qname,
                        kind=GeometryComponentKind.QUBIT,
                        x_mm=round(x_mm, 4),
                        y_mm=round(y_mm, 4),
                        orientation_deg=0.0,
                        layer="metal",
                        material=metal_material,
                        params={
                            "frequency_ghz": freq,
                            "ej_ghz": ej_map.get(qname, 10.0),
                            "ec_ghz": ec_map.get(qname, 0.34),
                        },
                    )
                    components.append(comp)
                    ports.extend(c_ports)

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
        )

        # 6. Touch the workspace to record the update
        self.workspace_manager.touch_workspace(simulation_id)
        
        logger.info(
            "GeometryBuilder successfully compiled and exported layout '%s' for simulation %s.",
            design_id,
            simulation_id,
        )
        return geom_metadata
