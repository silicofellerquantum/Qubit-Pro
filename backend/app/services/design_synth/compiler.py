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
