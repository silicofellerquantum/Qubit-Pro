"""
Tests for SchematicCompiler (DesignGraph -> DesignDocument) and PinAllocator.

Covers:
  - Single-qubit placement with grounded design_options in params
  - Resonator gets correct componentId and in/out pins
  - READOUT edge becomes a pin-to-pin Connection (no routeComponentId)
  - COUPLING edge carries routeComponentId=RouteMeander
  - 5-qubit grid: end-to-end pipeline emits result.design with correct shape
  - fromGenerateResponse short-circuit when result.design is present
"""
from __future__ import annotations

import asyncio
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))


# ── PinAllocator ─────────────────────────────────────────────────────────────

def test_pin_allocator_readout_edge():
    from app.services.design_synth.pin_allocator import PinAllocator
    a = PinAllocator()
    sp, tp = a.allocate("readout", "comp_Q1", "TransmonCross", "",
                                   "comp_RO_Q1", "ResonatorCoilRect", "")
    assert sp == "readout"
    assert tp == "spiralPin"


def test_pin_allocator_coupling_bus_pins():
    from app.services.design_synth.pin_allocator import PinAllocator
    a = PinAllocator()
    # First coupling on a TransmonCross should use bus_01
    sp1, tp1 = a.allocate("coupling", "comp_Q1", "TransmonCross", "",
                                       "comp_C1", "CoupledLineTee", "")
    assert sp1 == "bus_01"
    assert tp1 == "prime_start"
    # Second coupling on same qubit should pick bus_02 (bus_01 already used)
    sp2, tp2 = a.allocate("coupling", "comp_Q1", "TransmonCross", "",
                                       "comp_C2", "CoupledLineTee", "")
    assert sp2 == "bus_02"


def test_pin_allocator_explicit_hint_validated():
    from app.services.design_synth.pin_allocator import PinAllocator
    a = PinAllocator()
    sp, tp = a.allocate("readout", "comp_Q1", "TransmonCross", "readout",
                                   "comp_RO_Q1", "ResonatorCoilRect", "in")
    assert sp == "readout"
    # "in" is not a valid ResonatorCoilRect pin — allocator falls back to spiralPin
    assert tp == "spiralPin"


def test_pin_allocator_bad_hint_falls_back():
    from app.services.design_synth.pin_allocator import PinAllocator
    a = PinAllocator()
    # "nonexistent" is not a real pin on TransmonCross — should fall back
    sp, _ = a.allocate("readout", "comp_Q1", "TransmonCross", "nonexistent",
                                   "comp_R", "ResonatorCoilRect", "")
    assert sp == "readout"


# ── SchematicCompiler ─────────────────────────────────────────────────────────

def _make_simple_graph():
    from app.core.design_graph.graph import DesignGraph
    from app.core.design_graph.node import QubitNode, ResonatorNode
    from app.core.design_graph.edge import DesignEdge, EdgeKind

    g = DesignGraph(chip_name="Test")

    q = QubitNode(id="Q1", frequency_ghz=5.0)
    q.component_id = "TransmonCross"
    q.design_options = {"cross_length": "200um", "cross_gap": "20um",
                        "connection_pads": {"readout": {"claw_length": "30um"}}}
    q.x_mm = 2.0; q.y_mm = 2.0
    g.add_node(q)

    r = ResonatorNode(id="RO_Q1", frequency_ghz=6.5, target_qubit_id="Q1")
    r.component_id = "ResonatorCoilRect"
    r.design_options = {}
    r.x_mm = 2.0; r.y_mm = 3.5
    g.add_node(r)

    g.add_edge(DesignEdge("Q1", "RO_Q1", EdgeKind.READOUT,
                          pin_source="readout"))
    return g


def test_compiler_placement_ids_and_component_ids():
    from app.services.design_synth.compiler import SchematicCompiler
    doc = SchematicCompiler().compile(_make_simple_graph())
    ids = {p["id"] for p in doc["placements"]}
    assert "comp_Q1"    in ids
    assert "comp_RO_Q1" in ids
    # componentIds
    cids = {p["componentId"] for p in doc["placements"]}
    assert "TransmonCross"    in cids
    assert "ResonatorCoilRect" in cids


def test_compiler_qubit_params_contain_design_options():
    from app.services.design_synth.compiler import SchematicCompiler
    doc = SchematicCompiler().compile(_make_simple_graph())
    q = next(p for p in doc["placements"] if p["id"] == "comp_Q1")
    assert q["params"]["cross_length"] == "200um"
    assert "connection_pads" in q["params"]
    # Internal keys must not leak
    assert "_default_connection_pads" not in q["params"]


def test_compiler_readout_connection_pins():
    from app.services.design_synth.compiler import SchematicCompiler
    doc = SchematicCompiler().compile(_make_simple_graph())
    assert len(doc["connections"]) == 1
    conn = doc["connections"][0]
    assert conn["from"]["placementId"] == "comp_Q1"
    assert conn["from"]["pinName"]     == "readout"
    assert conn["to"]["placementId"]   == "comp_RO_Q1"
    assert conn["to"]["pinName"]       == "spiralPin"
    # READOUT edge — no route component
    assert "routeComponentId" not in conn


def test_compiler_coupling_edge_has_route_component():
    from app.core.design_graph.graph import DesignGraph
    from app.core.design_graph.node import QubitNode, CouplerNode
    from app.core.design_graph.edge import DesignEdge, EdgeKind
    from app.services.design_synth.compiler import SchematicCompiler

    g = DesignGraph(chip_name="T2")
    q1 = QubitNode(id="Q1"); q1.component_id = "TransmonCross"; q1.x_mm = 0; q1.y_mm = 0
    q2 = QubitNode(id="Q2"); q2.component_id = "TransmonCross"; q2.x_mm = 2; q2.y_mm = 0
    c1 = CouplerNode(id="C1", qubit_a_id="Q1", qubit_b_id="Q2")
    c1.component_id = "CoupledLineTee"; c1.x_mm = 1; c1.y_mm = 0
    g.add_node(q1); g.add_node(q2); g.add_node(c1)
    g.add_edge(DesignEdge("Q1", "C1", EdgeKind.COUPLING))
    g.add_edge(DesignEdge("C1", "Q2", EdgeKind.COUPLING))

    doc = SchematicCompiler().compile(g)
    for conn in doc["connections"]:
        assert conn.get("routeComponentId") == "RouteMeander"


def test_compiler_fallback_component_id_when_none():
    """Nodes without component_id should get an ontology default, not crash."""
    from app.core.design_graph.graph import DesignGraph
    from app.core.design_graph.node import QubitNode
    from app.services.design_synth.compiler import SchematicCompiler

    g = DesignGraph(chip_name="T3")
    q = QubitNode(id="Q1")
    q.component_id = None    # no ID
    q.x_mm = 0; q.y_mm = 0
    g.add_node(q)

    doc = SchematicCompiler().compile(g)
    assert doc["placements"][0]["componentId"] == "TransmonCross"


# ── End-to-end pipeline result.design ────────────────────────────────────────

def test_pipeline_result_design_present_and_well_formed():
    from app.constraints.constraints import DesignConstraints
    from app.services.design_pipeline import run_design_pipeline

    result = asyncio.run(run_design_pipeline(
        DesignConstraints(qubit_count=5, topology="grid")
    ))
    doc = result.get("design")
    assert doc is not None
    placements  = doc["placements"]
    connections = doc["connections"]

    # 5 qubits + 5 resonators + couplers + feedline + launchpads
    assert len(placements) >= 10

    qubit_placements = [p for p in placements if p["componentId"] == "TransmonCross"]
    assert len(qubit_placements) == 5

    # Every qubit has claw params
    for qp in qubit_placements:
        assert "connection_pads" in qp["params"] or "cross_length" in qp["params"]

    # All connection placementIds resolve to real placements
    placement_ids = {p["id"] for p in placements}
    for conn in connections:
        assert conn["from"]["placementId"] in placement_ids
        assert conn["to"]["placementId"]   in placement_ids

    # v2.document is the same object
    assert result["v2"]["document"] is doc


# ── fromGenerateResponse short-circuit check ─────────────────────────────────

def test_from_generate_response_uses_design_blob_when_present():
    """
    The TypeScript fromGenerateResponse function short-circuits when
    result.design has placements + connections.  We test the Python
    side emits the correct shape so the TS function can consume it.
    """
    from app.constraints.constraints import DesignConstraints
    from app.services.design_pipeline import run_design_pipeline

    result = asyncio.run(run_design_pipeline(
        DesignConstraints(qubit_count=3, topology="line")
    ))
    design = result["design"]
    assert isinstance(design["placements"], list)
    assert isinstance(design["connections"], list)
    assert len(design["placements"]) > 0
    # Verify the TS short-circuit condition:
    # result.design && result.design.placements && result.design.connections
    assert design["placements"] and design["connections"] is not None


def _run_all() -> int:
    import traceback
    fns = [v for k, v in sorted(globals().items())
           if k.startswith("test_") and callable(v)]
    failed = 0
    for fn in fns:
        try:
            fn()
            print(f"PASS  {fn.__name__}")
        except Exception as exc:
            failed += 1
            print(f"FAIL  {fn.__name__}: {exc!r}")
            traceback.print_exc()
    print(f"\n{len(fns) - failed} passed, {failed} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(_run_all())
