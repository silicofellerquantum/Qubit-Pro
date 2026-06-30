"""
compiler.py — SchematicCompiler: DesignGraph → DesignDocument

The compiler deterministically converts the backend logical IR (DesignGraph,
post-placement, post-grounding) into the frontend editor IR (DesignDocument
= {placements, connections}).  This replaces the lossy client-side
``fromGenerateResponse`` fallback in ``schematic-editor.tsx``.

Coordinate convention
---------------------
Graph nodes store x_mm / y_mm in millimetres.
The editor canvas works in the same world-space millimetres so no scaling is
needed — the compiler passes them through directly.  (The canvas ruler / grid
is calibrated in mm.)

Component-id mapping
---------------------
Each node carries ``node.component_id`` (set by the builder + grounding layer).
The compiler uses that directly.  Nodes without a component_id fall back to the
ontology default for their kind (graceful degradation).

Route connections
-----------------
COUPLING and FEEDLINE edges become ``Connection`` objects with ``routeComponentId``
set to the first available route component (RouteMeander).  READOUT edges are
direct pin-to-pin connections (no intermediate route object needed in the editor
because the resonator IS the route visually).
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from app.services.design_synth.pin_allocator import PinAllocator
from app.simulation.geometry.coordinate_transform import simplify_path

log = logging.getLogger(__name__)

# Route component used for coupler / feedline wires.
_DEFAULT_ROUTE = "RouteMeander"

# Placement offset grid (mm) when a node has no coordinates (safety net).
_GRID_STEP = 1.5


def _safe_id(raw: str) -> str:
    """Sanitise a raw node-id to a stable placement id."""
    return "comp_" + raw.replace(" ", "_")


def _placement_params(node: Any) -> Dict[str, Any]:
    """Build the ``params`` dict for a Placement from grounded design_options.

    design_options keys are already Qiskit Metal parameter names with unit
    suffixes (e.g. ``"cross_length": "200um"``).  The editor accepts these
    directly as-is.  We strip internal keys (prefixed ``_``) and the top-level
    ``chip`` key, but preserve ``connection_pads`` so claw geometry is visible.
    """
    opts = dict(getattr(node, "design_options", {}) or {})
    return {k: v for k, v in opts.items()
            if not str(k).startswith("_") and k != "chip"
            and (not isinstance(v, dict) or k == "connection_pads")}


class SchematicCompiler:
    """Compile a ``DesignGraph`` to a ``DesignDocument`` dict."""

    def compile(self, graph: Any) -> Dict[str, Any]:
        """Return ``{"placements": [...], "connections": [...]}``."""
        from app.services.design_synth import ontology
        from app.core.design_graph.node import NodeKind

        allocator = PinAllocator()
        placements: List[Dict[str, Any]] = []
        connections: List[Dict[str, Any]] = []

        # Index nodes for quick lookup.
        node_by_id: Dict[str, Any] = {n.id: n for n in graph.nodes}

        # ── Pass 1: build placements ──────────────────────────────────────────
        grid_x = 0.0
        grid_y = 0.0
        for node in graph.nodes:
            kind_val = node.kind.value if hasattr(node.kind, "value") else str(node.kind)

            # component_id
            cid = node.component_id
            if not cid:
                role = {
                    "qubit":     ontology.QUBIT_ROLE,
                    "resonator": ontology.RESONATOR_ROLE,
                    "coupler":   ontology.COUPLER_ROLE,
                    "feedline":  ontology.FEEDLINE_ROLE,
                    "launchpad": ontology.LAUNCHPAD_ROLE,
                }.get(kind_val)
                cid = (ontology.grounded_default(role) if role else None) or "TransmonCross"

            # coordinates (mm — pass through directly)
            x = node.x_mm if node.x_mm is not None else grid_x
            y = node.y_mm if node.y_mm is not None else grid_y
            if node.x_mm is None:
                grid_x += _GRID_STEP
                if grid_x > 10.0:
                    grid_x = 0.0
                    grid_y += _GRID_STEP

            rotation = getattr(node, "orientation_deg", 0) or 0

            params = _placement_params(node)

            placements.append({
                "id":          _safe_id(node.id),
                "componentId": cid,
                "name":        node.id,
                "x":           round(x, 4),
                "y":           round(y, 4),
                "rotation":    rotation,
                "params":      params,
            })

        # ── Pass 2: build connections ─────────────────────────────────────────
        for edge in graph.edges:
            src = node_by_id.get(edge.source_id)
            tgt = node_by_id.get(edge.target_id)
            if src is None or tgt is None:
                log.warning("Compiler: dangling edge %s->%s — skipped",
                            edge.source_id, edge.target_id)
                continue

            kind = edge.kind.value if hasattr(edge.kind, "value") else str(edge.kind)

            # Skip feedline/io edges: the RouteMeander trunk (FL1) and
            # LaunchpadWirebond-to-feedline IOs have no meaningful pin_inputs
            # in Qiskit Metal and clutter the schematic without rendering.
            if kind in ("feedline", "io"):
                continue

            src_pin, tgt_pin = allocator.allocate(
                kind         = kind,
                src_id       = _safe_id(src.id),
                src_component= src.component_id,
                src_hint     = edge.pin_source or "",
                tgt_id       = _safe_id(tgt.id),
                tgt_component= tgt.component_id,
                tgt_hint     = edge.pin_target or "",
            )

            conn: Dict[str, Any] = {
                "id":   f"conn_{edge.source_id}_{edge.target_id}",
                "from": {"placementId": _safe_id(src.id), "pinName": src_pin},
                "to":   {"placementId": _safe_id(tgt.id), "pinName": tgt_pin},
            }

            # Only coupling/bus edges render as RouteMeander wires.
            # Readout connections are direct qubit↔resonator adjacency links
            # (the resonator IS the route visually; no extra route component).
            if kind in ("coupling", "bus"):
                conn["routeComponentId"] = _DEFAULT_ROUTE

            connections.append(conn)

        return {"placements": placements, "connections": connections}


# Module-level singleton.
schematic_compiler = SchematicCompiler()


def compile_schematic_to_v2_graph(payload: dict[str, Any]) -> dict[str, Any]:
    """Compile the flat design document (placements/connections) from the schematic
    editor into a serialized V2 DesignGraph, storing it under payload['v2']['graph'].
    """
    import copy
    from app.core.design_graph.graph import DesignGraph
    from app.core.design_graph.node import (
        QubitNode, CouplerNode, ResonatorNode, FeedlineNode, LaunchpadNode,
        NodeKind, QubitType, CouplerType, ResonatorType, LaunchpadStyle
    )
    from app.core.design_graph.edge import DesignEdge, EdgeKind
    from app.core.design_graph.serializer import graph_to_dict

    # Work on a deep copy of payload to avoid mutating the original in unexpected ways
    payload = copy.deepcopy(payload)

    design = payload.get("design")
    if not design or "placements" not in design:
        return payload

    placements = design.get("placements", [])
    connections = design.get("connections", [])

    # Helper to convert values safely
    def to_float(val: Any, default: float) -> float:
        try:
            return float(val) if val is not None else default
        except (ValueError, TypeError):
            return default

    # Initialize a new DesignGraph
    freq_plan = payload.get("frequency_plan", {})
    g = DesignGraph(
        chip_name=str(payload.get("label") or "QuantumChip"),
        chip_width_mm=to_float(payload.get("chip_size_mm"), 10.0),
        chip_height_mm=to_float(payload.get("chip_size_mm"), 10.0),
        substrate=str(freq_plan.get("substrate") or payload.get("material", {}).get("substrate") or "silicon"),
        metal=str(freq_plan.get("metal") or payload.get("material", {}).get("metal") or "aluminum"),
        topology=str(payload.get("topology") or "custom"),
    )

    # Helper to strip 'comp_' prefix from placement IDs for graph node IDs
    def clean_id(pid: str) -> str:
        if pid.startswith("comp_"):
            return pid[len("comp_"):]
        return pid

    # Map placement ID -> node ID
    placement_to_node = {}

    # 1. Reconstruct Nodes
    for p in placements:
        inst_id = str(p.get("id") or "")
        name = str(p.get("name") or clean_id(inst_id))
        placement_to_node[inst_id] = name

        comp_id = str(p.get("componentId") or "")
        comp_lower = comp_id.lower()
        name_lower = name.lower()

        x = p.get("x")
        y = p.get("y")
        rot = p.get("rotation") or 0

        # Extract parameters
        params = p.get("params") or {}

        # Classify and create the node
        if (
            name_lower.startswith("q")
            or "qubit" in name_lower
            or "qubit" in comp_lower
            or "transmon" in comp_lower
        ):
            node = QubitNode(
                id=name,
                qubit_type=QubitType.TRANSMON,
                frequency_ghz=to_float(params.get("frequency_ghz") or params.get("frequency"), 5.0),
                anharmonicity_ghz=to_float(params.get("anharmonicity_ghz") or params.get("anharmonicity"), -0.34),
            )
        elif (
            name_lower.startswith("c")
            or "coupler" in name_lower
            or "coupler" in comp_lower
            or "route" in comp_lower
        ):
            node = CouplerNode(
                id=name,
                coupler_type=CouplerType.FIXED,
                strength_mhz=to_float(params.get("strength_mhz") or params.get("coupling_strength"), 10.0),
            )
        elif (
            name_lower.startswith("r")
            or "resonator" in name_lower
            or "resonator" in comp_lower
            or "res" in name_lower
            or "res" in comp_lower
        ):
            node = ResonatorNode(
                id=name,
                resonator_type=ResonatorType.READOUT,
                frequency_ghz=to_float(params.get("frequency_ghz") or params.get("frequency"), 6.5),
                length_mm=to_float(params.get("length_mm"), 7.5),
            )
        elif (
            name_lower.startswith("f")
            or "feed" in name_lower
            or "line" in name_lower
            or "feedline" in comp_lower
        ):
            node = FeedlineNode(
                id=name,
                length_mm=to_float(params.get("length_mm"), 10.0),
            )
        elif (
            name_lower.startswith("l")
            or name_lower.startswith("p")
            or "launch" in name_lower
            or "pad" in name_lower
            or "launchpad" in comp_lower
        ):
            node = LaunchpadNode(
                id=name,
                style=LaunchpadStyle.WIREBOND,
            )
        else:
            node = QubitNode(id=name)

        # Set common attributes
        node.x_mm = to_float(x, 0.0)
        node.y_mm = to_float(y, 0.0)
        node.orientation_deg = int(to_float(rot, 0.0))
        node.component_id = comp_id
        node.design_options = params

        g.add_node(node)

    # 2. Reconstruct Edges (Connections)
    for conn in connections:
        conn_id = str(conn.get("id") or "")
        from_data = conn.get("from") or {}
        to_data = conn.get("to") or {}

        from_placement = str(from_data.get("placementId") or "")
        to_placement = str(to_data.get("placementId") or "")

        from_node = placement_to_node.get(from_placement)
        to_node = placement_to_node.get(to_placement)

        if from_node and to_node and g.has_node(from_node) and g.has_node(to_node):
            # Determine edge kind
            n_from = g.get_node(from_node)
            n_to = g.get_node(to_node)

            kinds = {n_from.kind, n_to.kind}

            if NodeKind.QUBIT in kinds and NodeKind.COUPLER in kinds:
                kind = EdgeKind.COUPLING
            elif NodeKind.QUBIT in kinds and NodeKind.RESONATOR in kinds:
                kind = EdgeKind.READOUT
            elif NodeKind.RESONATOR in kinds and NodeKind.FEEDLINE in kinds:
                kind = EdgeKind.FEEDLINE
            elif NodeKind.FEEDLINE in kinds and NodeKind.LAUNCHPAD in kinds:
                kind = EdgeKind.IO
            else:
                kind = EdgeKind.COUPLING  # fallback

            # Helper to parse meander points from cachedSvg
            def _parse_svg_path_points(svg_str: str | None) -> list[tuple[float, float]] | None:
                import re
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

            edge_meta = {
                "cpw_width_um": 10.0,
                "cpw_gap_um": 5.0,
            }
            if conn.get("params"):
                edge_meta.update(conn.get("params"))
            
            path_points = _parse_svg_path_points(conn.get("cachedSvg"))
            if path_points:
                edge_meta["path_points"] = path_points

            edge = DesignEdge(
                source_id=from_node,
                target_id=to_node,
                kind=kind,
                pin_source=str(from_data.get("pinName") or ""),
                pin_target=str(to_data.get("pinName") or ""),
                label=conn_id,
                meta=edge_meta,
            )
            g.add_edge(edge)

    # 3. Update Coupler qubits references (qubit_a_id, qubit_b_id) based on connections
    for coupler in g.couplers:
        neighbors = g.neighbors(coupler.id)
        qubit_neighbors = [nb for nb in neighbors if g.get_node(nb).kind == NodeKind.QUBIT]
        if len(qubit_neighbors) >= 1:
            coupler.qubit_a_id = qubit_neighbors[0]
        if len(qubit_neighbors) >= 2:
            coupler.qubit_b_id = qubit_neighbors[1]

    # 4. Update Resonator target_qubit_id based on connections
    for resonator in g.resonators:
        neighbors = g.neighbors(resonator.id)
        qubit_neighbors = [nb for nb in neighbors if g.get_node(nb).kind == NodeKind.QUBIT]
        if qubit_neighbors:
            resonator.target_qubit_id = qubit_neighbors[0]

    # Serialize to dictionary and set in the payload
    graph_dict = graph_to_dict(g)
    if "v2" not in payload:
        payload["v2"] = {}
    payload["v2"]["graph"] = graph_dict

    return payload

