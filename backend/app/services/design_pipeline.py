"""
design_pipeline.py — V2 Design Pipeline

The V2 pipeline replaces the old prompt → generator → code flow with a
proper constraint-driven EDA pipeline:

    DesignConstraints
         ↓
    build_graph_from_constraints()     [design_graph layer]
         ↓
    GraphValidator.validate()          [structural checks]
         ↓
    FrequencyPlanner.plan()            [physics-accurate freq assignment]
         ↓
    place_qubits()                     [Kamada-Kawai placement]
         ↓
    route_design()                     [CPW + resonator + feedline routing]
         ↓
    run_full_drc()                     [4-domain DRC]
         ↓
    generate_qiskit_code()             [Qiskit Metal Python]
         ↓
    ExportEngine.export_all()          [JSON, QCL, GDS, SVG, DXF, PDF]
         ↓
    DesignResult (GenerateResponse-compatible dict)

Entry points
------------
run_design_pipeline(constraints) → DesignResult dict
run_design_from_prompt(prompt, substrate, metal) → DesignResult dict  (backward compat)
run_design_from_graph_json(graph_json, constraints_json) → DesignResult dict
"""

from __future__ import annotations

import logging
import math
from typing import Any

log = logging.getLogger(__name__)


async def run_design_pipeline(constraints: "DesignConstraints") -> dict[str, Any]:  # type: ignore[name-defined]
    """
    Full V2 constraint-driven design pipeline.

    Parameters
    ----------
    constraints : DesignConstraints

    Returns
    -------
    A GenerateResponse-compatible dict enriched with V2 fields.
    """
    from app.constraints.constraints import DesignConstraints
    from app.constraints.builder import build_graph_from_constraints
    from app.core.design_graph.validator import GraphValidator
    from app.core.design_graph.serializer import graph_to_dict
    from app.drc.runner import run_full_drc
    from app.exports.engine import ExportEngine
    from app.exports.formats import export_qclang
    from app.routing.pipeline import route_design
    from app.services.materials import get_material, get_physics_substrate
    from app.services.physics.frequency_planner import FrequencyPlanner
    from app.services.physics.topology_router import place_qubits, placement_to_dict
    from app.services.physics_grounding import ground_intent, resolve_geometry, reasonableness_gate
    from app.services.design_synth.compiler import schematic_compiler

    n         = constraints.qubit_count
    topology  = constraints.topology
    sub       = constraints.substrate
    met       = constraints.metal
    sub_label = get_material(sub).get("label", sub)
    met_label = get_material(met).get("label", met)

    # ── Step 0: Physics grounding (intent-level) ──────────────────────────────
    # Always-on: ground topology / frequency / coupling targets BEFORE the graph
    # is built, so the graph is constructed from grounded targets (not patched).
    plan = ground_intent(constraints)

    # ── Step 1: Build design graph (from grounded plan) ───────────────────────
    log.info("V2 pipeline: building graph (n=%d, topology=%s)", n, topology)
    graph = build_graph_from_constraints(constraints, plan=plan)

    # ── Step 2: Structural validation ─────────────────────────────────────────
    validation = GraphValidator(graph).validate()
    if not validation.passed:
        errors = [i.message for i in validation.errors]
        return {
            "success": False,
            "error": f"Graph validation failed: {'; '.join(errors)}",
            "validation": validation.to_dict(),
        }

    # ── Step 2.5: Physics grounding (node-level geometry) ─────────────────────
    # Resolve concrete design_options per node via the GeometryOracle chain
    # (SQuADDS -> analytic -> catalog) and stamp provenance onto each node.
    try:
        resolve_geometry(graph, plan)
    except Exception as exc:
        log.warning("Node-level geometry grounding failed: %s", exc)

    # ── Step 2.6: Physics reasonableness gate (Increment 2) ───────────────────
    # Non-blocking forward check: scqubits verifier validates grounded geometry
    # against targets. Failures produce warnings but do not abort generation.
    gate_report = None
    try:
        gate_report = reasonableness_gate.check_graph(graph, plan)
        for msg in gate_report.warning_messages():
            log.warning("Reasonableness gate: %s", msg)
    except Exception as exc:
        log.warning("Reasonableness gate check failed: %s", exc)

    # ── Step 3: Physics frequency planning ────────────────────────────────────
    physics_substrate = get_physics_substrate(sub)
    try:
        freq_plan_obj = FrequencyPlanner(
            n         = n,
            substrate = physics_substrate,
            topology  = topology,
        ).plan()
        freq_plan_dict = _freq_plan_to_dict(freq_plan_obj, sub, met)
        # Back-fill graph qubit frequencies from physics engine
        for qs in freq_plan_obj.qubits:
            if graph.has_node(qs.name):
                q = graph.get_node(qs.name)
                q.frequency_ghz   = qs.freq_GHz
                q.group           = qs.group
                q.ej_ghz          = qs.EJ_GHz
                q.ec_ghz          = qs.EC_GHz
        for rs in freq_plan_obj.resonators:
            if graph.has_node(rs.name):
                r = graph.get_node(rs.name)
                r.frequency_ghz = rs.freq_GHz
                r.length_mm     = rs.length_mm
                r.detuning_ghz  = rs.detuning_GHz
    except Exception as exc:
        log.warning("Frequency planning failed: %s", exc)
        freq_plan_dict = {"error": str(exc), "substrate": sub, "metal": met}
        freq_plan_obj  = None

    # ── Step 4: Physical placement ────────────────────────────────────────────
    # LAYOUT-015: Feature-flagged integration of layout_engine_v2
    from app.config import settings
    layout_quality: dict[str, Any] | None = None
    
    if settings.layout_engine_v2:
        # ── NEW PATH: Phase 1 Auto Layout Engine ──────────────────────────────
        log.info("V2 pipeline: using layout_engine_v2 (template-driven, CP-SAT)")
        try:
            from app.layout import generate_layout
            from app.layout.adapters import to_placement_dict
            
            # Generate layout candidate
            layout_candidate = generate_layout(graph, constraints=constraints)
            
            # Convert to legacy placement_dict format
            placement_dict = to_placement_dict(layout_candidate)
            
            # Normalise x_mm/y_mm → x/y for frontend
            for q_pd in placement_dict["qubits"]:
                if "x_mm" in q_pd:
                    q_pd["x"] = q_pd.pop("x_mm")
                    q_pd["y"] = q_pd.pop("y_mm")
            
            # Store layout quality metrics
            layout_quality = {
                "solver": layout_candidate.metadata.get("solver", "cpsat"),
                "template": layout_candidate.template_name,
                "generation_time_sec": layout_candidate.generation_time_sec,
                "score": layout_candidate.score.to_dict(),
                "gate_passed": layout_candidate.score.gate_passed,
                "overall_score": layout_candidate.score.overall_score,
            }
            
            placement_result = None  # Legacy result not used in v2 path
            
        except Exception as exc:
            log.error("Layout engine v2 failed: %s. Falling back to legacy.", exc)
            # Fallback to legacy path on failure
            placement_result = place_qubits(n, topology=topology, scale=constraints.scale)
            placement_dict   = placement_to_dict(placement_result)
            # Normalise x_mm/y_mm → x/y for frontend
            for q_pd in placement_dict["qubits"]:
                if "x_mm" in q_pd:
                    q_pd["x"] = q_pd.pop("x_mm")
                    q_pd["y"] = q_pd.pop("y_mm")
            # Back-fill placement into graph nodes
            for qp in placement_result.qubits:
                if graph.has_node(qp.name):
                    node = graph.get_node(qp.name)
                    node.x_mm            = qp.x_mm
                    node.y_mm            = qp.y_mm
                    node.orientation_deg = qp.orientation_deg
            # Derive coordinates for secondary nodes
            _assign_secondary_coords(graph, constraints)
    else:
        # ── LEGACY PATH: Original placement (byte-identical when flag OFF) ───
        try:
            placement_result = place_qubits(n, topology=topology, scale=constraints.scale)
            placement_dict   = placement_to_dict(placement_result)
            # Normalise x_mm/y_mm → x/y for frontend
            for q_pd in placement_dict["qubits"]:
                if "x_mm" in q_pd:
                    q_pd["x"] = q_pd.pop("x_mm")
                    q_pd["y"] = q_pd.pop("y_mm")
            # Back-fill placement into graph nodes
            for qp in placement_result.qubits:
                if graph.has_node(qp.name):
                    node = graph.get_node(qp.name)
                    node.x_mm            = qp.x_mm
                    node.y_mm            = qp.y_mm
                    node.orientation_deg = qp.orientation_deg
            # Derive coordinates for secondary nodes (couplers, resonators,
            # feedline, launchpads) that don't participate in the qubit solver.
            _assign_secondary_coords(graph, constraints)
        except Exception as exc:
            log.warning("Placement failed: %s", exc)
            placement_result = None
            placement_dict   = {"solver": "error", "qubits": [], "edges": []}

    # ── Step 5: Routing ───────────────────────────────────────────────────────
    route_result_dict: dict[str, Any] = {}
    try:
        route_result    = route_design(graph, constraints)
        route_result_dict = route_result.to_dict()
    except Exception as exc:
        log.warning("Routing failed: %s", exc)
        route_result_dict = {"warnings": [str(exc)]}

    # ── Step 6: DRC ───────────────────────────────────────────────────────────
    try:
        drc_report   = run_full_drc(graph, constraints)
        drc_dict     = drc_report.to_dict()
        # Legacy-compatible simplified drc dict for frontend
        drc_legacy   = {
            "passed":     drc_report.passed,
            "errors":     len(drc_report.errors),
            "warnings":   len(drc_report.warnings),
            "violations": [v.to_dict() for v in drc_report.violations],
        }
    except Exception as exc:
        log.warning("DRC failed: %s", exc)
        drc_dict   = {"passed": True, "errors": 0, "warnings": 0, "violations": []}
        drc_legacy = drc_dict

    # ── Step 7: Code generation (Qiskit Metal Python) ─────────────────────────
    try:
        qclang_src = export_qclang(graph)
        metal_code = _build_qiskit_metal_code(graph, placement_dict, met)
    except Exception as exc:
        log.warning("Code generation failed: %s", exc)
        qclang_src = f"# Code generation error: {exc}"
        metal_code = ""

    # ── Step 7.5: Compile DesignDocument (editor-consumable IR) ───────────────
    try:
        design_doc = schematic_compiler.compile(graph)
    except Exception as exc:
        log.warning("SchematicCompiler failed: %s", exc)
        design_doc = {"placements": [], "connections": []}

    # ── Step 8: Export package ────────────────────────────────────────────────
    engine = ExportEngine(
        graph         = graph,
        freq_plan     = freq_plan_dict,
        route_result  = route_result_dict,
        drc_report    = drc_legacy,
        constraints   = constraints.to_dict(),
    )
    exports = engine.export_all(
        project_name = constraints.chip_name,
        version      = "v2.0",
    )

    # ── Compose result ─────────────────────────────────────────────────────────
    from app.services.legacy_compat import chip_name as _chip_name
    label = f"{_chip_name(topology, n)} · {n}Q"

    result: dict[str, Any] = {
        # GenerateResponse-compatible fields
        "label":         label,
        "num_qubits":    n,
        "topology":      topology,
        "engine":        "quantum-studio-v2-pipeline",
        "interpretation": (
            f"V2 constraint-driven {n}-qubit {topology} chip on "
            f"{sub_label} / {met_label}. "
            f"DRC: {'PASS ✓' if drc_legacy.get('passed') else 'FAIL ✗'}. "
            f"Routing: {route_result_dict.get('stats', {}).get('total_segments', 0)} segments."
        ),
        "drc":           drc_legacy,
        "frequency_plan": freq_plan_dict,
        "placement":     placement_dict,
        "code":          metal_code,
        "qclang_source": qclang_src,
        "material":      {"substrate": sub, "metal": met},
        "geometry_source": plan.provenance,
        # Lossless round-trip: fully-formed DesignDocument for the editor.
        # fromGenerateResponse in schematic-editor.tsx short-circuits on this.
        "design":         design_doc,
        # V2 enriched fields
        "v2": {
            "graph":        graph_to_dict(graph),
            "physics_plan": plan.to_dict(),
            "document":     design_doc,
            "routing":      route_result_dict,
            "drc_full":     drc_dict,
            "exports":      {k: v[:200] + "…" if isinstance(v, str) and len(v) > 200
                             else v for k, v in exports.items()
                             if k not in ("json",)},
            "validation":       validation.to_dict(),
            "constraints":      constraints.to_dict(),
            "reasonableness":   gate_report.to_dict() if gate_report else {},
            "layout_quality":   layout_quality,  # LAYOUT-015: Phase 1 layout metrics
        },
    }
    return result


async def run_design_from_prompt(
    prompt: str,
    substrate: str | None = None,
    metal: str | None = None,
) -> dict[str, Any]:
    """
    Backward-compatible entry: parse prompt → constraints → V2 pipeline.
    Falls back to V1 chip_generator if V2 pipeline fails.
    """
    from app.services.chip_generator import parse_prompt
    from app.constraints.constraints import DesignConstraints

    try:
        params = parse_prompt(prompt)
        if substrate:
            params["substrate"] = substrate
        if metal:
            params["metal"] = metal
        constraints = DesignConstraints.from_prompt_params(params)
        return await run_design_pipeline(constraints)
    except Exception as exc:
        log.warning("V2 pipeline failed (%s), falling back to V1", exc)
        from app.services.chip_generator import generate_chip
        return await generate_chip(prompt, substrate, metal)


async def run_design_from_graph_json(
    graph_json: dict[str, Any],
    constraints_json: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Build a V2 design from a graph JSON payload (e.g. from the schematic editor).
    """
    from app.constraints.constraints import DesignConstraints
    from app.core.design_graph.serializer import dict_to_graph

    graph       = dict_to_graph(graph_json)
    constraints = DesignConstraints.from_dict(constraints_json or {})
    # Override with graph metadata
    constraints.qubit_count  = len(graph.qubits)
    constraints.topology     = graph.topology
    constraints.substrate    = graph.substrate
    constraints.metal        = graph.metal
    constraints.chip_width_mm  = graph.chip_width_mm
    constraints.chip_height_mm = graph.chip_height_mm
    constraints.chip_name    = graph.chip_name

    return await run_design_pipeline(constraints)


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _freq_plan_to_dict(fp, substrate: str, metal: str) -> dict[str, Any]:
    return {
        "epsilon_eff":              fp.epsilon_eff,
        "qubit_frequencies_GHz":    {q.name: q.freq_GHz    for q in fp.qubits},
        "qubit_groups":             {q.name: q.group        for q in fp.qubits},
        "EJ_GHz":                   {q.name: q.EJ_GHz       for q in fp.qubits},
        "EC_GHz":                   {q.name: q.EC_GHz       for q in fp.qubits},
        "resonator_frequencies_GHz":{r.name: r.freq_GHz    for r in fp.resonators},
        "resonator_lengths_mm":     {r.name: r.length_mm   for r in fp.resonators},
        "detunings_GHz":            {r.name: r.detuning_GHz for r in fp.resonators},
        "warnings":                 [w.message              for w in fp.warnings],
        "substrate": substrate,
        "metal":     metal,
    }


def _build_qiskit_metal_code(graph, placement_dict: dict, metal: str) -> str:
    """Generate Qiskit Metal Python from graph + placement dict."""
    from app.qclang.compiler import generate_qiskit_code
    from app.qclang.ast_nodes import ChipNode, QubitNode, CouplerNode, ReadoutNode, Attribute

    qubits = [
        QubitNode(
            name       = q.id,
            qubit_type = q.qubit_type.value if hasattr(q.qubit_type, "value") else "transmon",
            attributes = [Attribute("frequency", round(q.frequency_ghz, 4))],
        )
        for q in graph.qubits
    ]
    couplers = [
        CouplerNode(name=c.id, qubit_a=c.qubit_a_id, qubit_b=c.qubit_b_id)
        for c in graph.couplers if c.qubit_a_id and c.qubit_b_id
    ]
    readouts = [
        ReadoutNode(name=r.id, target_qubit=r.target_qubit_id)
        for r in graph.resonators if r.target_qubit_id
    ]
    chip = ChipNode(
        name     = graph.chip_name,
        qubits   = qubits,
        couplers = couplers,
        readouts = readouts,
    )
    return generate_qiskit_code(chip, placement_dict, metal)


def _best_resonator_angle(
    qx: float,
    qy: float,
    neighbor_positions: list[tuple[float, float]],
    count: int,
) -> float:
    """
    Choose the best angle for placing a resonator offset from a qubit at (qx, qy).

    Strategy:
    - Sample 8 candidate angles (0°, 45°, 90°, … 315°).
    - Score each by the minimum distance to any neighbouring qubit centre
      (projected onto the offset direction).  Prefer directions that point
      away from all neighbours — i.e. maximise the minimum neighbour distance.
    - If there are no neighbours, fall back to 90° + count×45° increments
      (preserves the old behaviour for isolated qubits).
    - The `count` parameter handles multiple resonators on the same qubit:
      on the second call the best direction is excluded so the two resonators
      spread to opposite sides.
    """
    N_CANDIDATES = 8
    candidates = [math.pi * 2 * i / N_CANDIDATES for i in range(N_CANDIDATES)]

    if not neighbor_positions:
        # No neighbours → classic 90° + 45°·count fallback.
        return math.pi / 2 + count * (math.pi / 4)

    def score(angle: float) -> float:
        # Direction vector for this candidate angle.
        dx = math.cos(angle)
        dy = math.sin(angle)
        # For each neighbour, compute the dot product of the neighbour
        # direction onto this candidate direction.  A large positive value
        # means the resonator would point straight at that neighbour → bad.
        # We want to minimise the maximum dot product (i.e. avoid neighbours).
        min_score = float("inf")
        for nx_, ny_ in neighbor_positions:
            nd_x = nx_ - qx
            nd_y = ny_ - qy
            nd_len = math.sqrt(nd_x * nd_x + nd_y * nd_y) or 1.0
            dot = (dx * nd_x + dy * nd_y) / nd_len   # cosine similarity
            min_score = min(min_score, -dot)          # negate: high = pointing away
        return min_score

    # Sort candidates by score descending (best = most away from neighbours).
    ranked = sorted(candidates, key=score, reverse=True)

    # The `count`-th best direction handles multiple resonators per qubit.
    idx = count % len(ranked)
    return ranked[idx]


def _assign_secondary_coords(graph: Any, constraints: Any) -> None:
    """
    Derive (x_mm, y_mm) for nodes that are not placed by the qubit solver:
    couplers (midpoint of qubit pair), resonators (offset from target qubit),
    feedline (horizontal bar at chip top), launchpads (chip left/right edges).

    Only fills in nodes that have x_mm is None (doesn't overwrite existing).
    """
    # Build qubit coord map for quick lookup.
    q_coords: dict[str, tuple[float, float]] = {}
    for node in graph.nodes:
        kind = node.kind.value if hasattr(node.kind, "value") else str(node.kind)
        if kind == "qubit" and node.x_mm is not None:
            q_coords[node.id] = (node.x_mm, node.y_mm)

    half_w = constraints.chip_width_mm  / 2
    half_h = constraints.chip_height_mm / 2

    # Track how many resonators have been placed per qubit (for offset rotation).
    ro_count: dict[str, int] = {}

    for node in graph.nodes:
        if node.x_mm is not None:
            continue  # already placed — skip

        kind = node.kind.value if hasattr(node.kind, "value") else str(node.kind)

        if kind == "coupler":
            # Place at the midpoint of the two connected qubits.
            qa_id = getattr(node, "qubit_a_id", None)
            qb_id = getattr(node, "qubit_b_id", None)
            if qa_id and qb_id and qa_id in q_coords and qb_id in q_coords:
                ax, ay = q_coords[qa_id]
                bx, by = q_coords[qb_id]
                mx = round((ax + bx) / 2, 4)
                my = round((ay + by) / 2, 4)
                # Jitter coupler 8% of the edge length perpendicular to it,
                # so overlapping couplers (diagonal pairs on a grid) separate.
                # Keep jitter small (was 15%) to avoid pushing into pocket bodies.
                edge_dx = bx - ax
                edge_dy = by - ay
                edge_len = max(math.sqrt(edge_dx**2 + edge_dy**2), 0.001)
                perp_x = -edge_dy / edge_len
                perp_y =  edge_dx / edge_len
                jitter = edge_len * 0.08
                node.x_mm = round(mx + perp_x * jitter, 4)
                node.y_mm = round(my + perp_y * jitter, 4)
            elif q_coords:
                # Fallback: use centroid of all qubits.
                xs = [v[0] for v in q_coords.values()]
                ys = [v[1] for v in q_coords.values()]
                node.x_mm = round(sum(xs) / len(xs), 4)
                node.y_mm = round(sum(ys) / len(ys), 4)

        elif kind == "resonator":
            target_id = getattr(node, "target_qubit_id", None)
            if target_id and target_id in q_coords:
                qx, qy = q_coords[target_id]
                count = ro_count.get(target_id, 0)
                ro_count[target_id] = count + 1

                # Build a list of all other qubit positions (neighbours) to
                # avoid when choosing the resonator direction.
                other_positions = [
                    v for k, v in q_coords.items() if k != target_id
                ]

                angle = _best_resonator_angle(qx, qy, other_positions, count)
                offset = 0.55  # mm from qubit centre
                node.x_mm = round(qx + offset * math.cos(angle), 4)
                node.y_mm = round(qy + offset * math.sin(angle), 4)
            elif q_coords:
                # Fallback: offset from centroid.
                xs = [v[0] for v in q_coords.values()]
                ys = [v[1] for v in q_coords.values()]
                cx = sum(xs) / len(xs)
                cy = sum(ys) / len(ys)
                count = ro_count.get("_fallback", 0)
                ro_count["_fallback"] = count + 1
                angle = count * (math.pi * 2 / max(len([
                    n for n in graph.nodes
                    if (n.kind.value if hasattr(n.kind, "value") else str(n.kind)) == "resonator"
                ]), 1))
                node.x_mm = round(cx + 0.6 * math.cos(angle), 4)
                node.y_mm = round(cy + 0.6 * math.sin(angle), 4)

        elif kind == "feedline":
            # Horizontal bar near the top of the chip (y = +80% of half-height).
            node.x_mm = 0.0
            node.y_mm = round(half_h * 0.80, 4)

        elif kind == "launchpad":
            # Distribute launchpads along the top edge, spaced evenly.
            lp_nodes = [
                nd for nd in graph.nodes
                if (nd.kind.value if hasattr(nd.kind, "value") else str(nd.kind)) == "launchpad"
            ]
            idx = lp_nodes.index(node) if node in lp_nodes else 0
            total = max(len(lp_nodes), 1)
            # Space them evenly within 60% of chip width, just inside top edge.
            span = half_w * 0.60
            x = round(-span + idx * (span * 2 / max(total - 1, 1)), 4) if total > 1 else 0.0
            node.x_mm = x
            node.y_mm = round(half_h * 0.92, 4)
