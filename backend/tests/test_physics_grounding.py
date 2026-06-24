"""
Tests for the Increment-1 Physics-Grounding scaffold + ontology integration.

Covers: ontology TransmonCross default, claw geometry mapping, analytic intent
grounding, GeometryOracle fallback chain, DesignGraph node round-trip of the new
grounded fields, and end-to-end pipeline parity (grounded fields present).
"""
from __future__ import annotations

import asyncio


# ── Ontology ──────────────────────────────────────────────────────────────────

def test_grounded_qubit_default_is_transmon_cross():
    from app.services.design_synth import ontology
    assert ontology.grounded_default(ontology.QUBIT_ROLE) == "TransmonCross"
    # Legacy TransmonPocket remains supported (selectable lower in the ranking).
    assert "TransmonPocket" in ontology.candidates(ontology.QUBIT_ROLE)
    assert ontology.is_grounded_family("TransmonCross") is True
    assert ontology.is_grounded_family("TransmonPocket") is False


def test_qubit_design_options_have_claw_and_units():
    from app.services.design_synth import ontology
    opts = ontology.qubit_design_options("TransmonCross")
    # Claw lives in connection_pads.readout; geometry is unit-normalized.
    assert "connection_pads" in opts
    assert "readout" in opts["connection_pads"]
    assert "claw_length" in opts["connection_pads"]["readout"]
    assert str(opts["cross_length"]).endswith("um")
    # Internal template keys must not leak into design_options.
    assert "_default_connection_pads" not in opts


def test_other_roles_have_catalog_defaults():
    from app.services.design_synth import ontology
    assert ontology.grounded_default(ontology.RESONATOR_ROLE)
    assert ontology.grounded_default(ontology.ROUTE_ROLE) == "RouteMeander"
    assert ontology.grounded_default(ontology.LAUNCHPAD_ROLE) == "LaunchpadWirebond"


# ── GeometryOracle provider chain ─────────────────────────────────────────────

def test_oracle_falls_back_to_analytic_when_squadds_unavailable():
    from unittest.mock import MagicMock, patch
    from app.services.physics_grounding import GeometryOracle, TargetVector
    from app.services.physics_grounding.providers.analytic import AnalyticProvider
    # Force SQuADDS unavailable so analytic fallback is exercised regardless of mirror state
    mock_squadds = MagicMock()
    mock_squadds.available.return_value = False
    oracle = GeometryOracle(providers=[mock_squadds, AnalyticProvider()])
    g = oracle.resolve("qubit", "TransmonCross", TargetVector(f_q_ghz=5.0, alpha_mhz=-340.0))
    assert g.source == "analytic"          # SQuADDS forced unavailable → analytic
    assert g.design_options                # non-empty
    assert "connection_pads" in g.design_options


def test_oracle_catalog_fallback_for_unknown_family():
    from app.services.physics_grounding import GeometryOracle, TargetVector
    from app.services.physics_grounding.providers import GeometryProvider

    class _Dead(GeometryProvider):
        name = "dead"

        def available(self) -> bool:
            return False

        def resolve(self, role, family, target):  # pragma: no cover
            return None

    oracle = GeometryOracle(providers=[_Dead()])
    g = oracle.resolve("qubit", "TransmonCross", TargetVector())
    assert g.source == "catalog"           # final fallback when every provider defers


# ── Intent-level grounding ────────────────────────────────────────────────────

def test_ground_intent_produces_targets_for_each_qubit():
    from app.constraints.constraints import DesignConstraints
    from app.services.physics_grounding import ground_intent

    plan = ground_intent(DesignConstraints(qubit_count=5, topology="grid"))
    assert len(plan.role_targets) == 5
    assert plan.provenance in ("analytic", "squadds", "catalog")
    q1 = plan.target_for("Q1")
    assert q1 is not None and q1.f_q_ghz is not None and q1.alpha_mhz is not None


def test_physics_verifier_round_trip_residuals_small():
    from app.services.physics_grounding import TargetVector, physics_verifier
    res = physics_verifier.verify(TargetVector(f_q_ghz=5.0, alpha_mhz=-340.0))
    assert "f_q_ghz" in res and "alpha_mhz" in res
    assert abs(res["f_q_ghz"]) < 0.05      # analytic forward model is self-consistent


# ── DesignGraph round-trip of grounded fields ─────────────────────────────────

def test_serializer_round_trips_grounded_fields():
    from app.core.design_graph import DesignGraph, QubitNode, graph_to_dict, dict_to_graph

    g = DesignGraph(chip_name="T")
    q = QubitNode(id="Q1", frequency_ghz=5.0)
    q.component_id = "TransmonCross"
    q.design_options = {"cross_length": "200um"}
    q.geometry_source = "analytic"
    g.add_node(q)

    g2 = dict_to_graph(graph_to_dict(g))
    n = g2.get_node("Q1")
    assert n.component_id == "TransmonCross"
    assert n.design_options == {"cross_length": "200um"}
    assert n.geometry_source == "analytic"


# ── End-to-end pipeline ───────────────────────────────────────────────────────

def test_pipeline_includes_geometry_source_and_grounded_qubits():
    from app.constraints.constraints import DesignConstraints
    from app.services.design_pipeline import run_design_pipeline

    result = asyncio.run(run_design_pipeline(
        DesignConstraints(qubit_count=5, topology="grid", substrate="silicon", metal="aluminum")
    ))
    assert result.get("num_qubits") == 5
    assert result.get("geometry_source") in ("analytic", "squadds", "catalog")
    nodes = result["v2"]["graph"]["nodes"]
    qubits = [n for n in nodes if n["kind"] == "qubit"]
    assert qubits and all(n["component_id"] == "TransmonCross" for n in qubits)
    assert all(n.get("design_options") for n in qubits)
    assert "physics_plan" in result["v2"]


def _run_all() -> int:
    """Lightweight runner so the suite works with or without pytest installed."""
    import traceback
    fns = [v for k, v in sorted(globals().items())
           if k.startswith("test_") and callable(v)]
    failed = 0
    for fn in fns:
        try:
            fn()
            print(f"PASS  {fn.__name__}")
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print(f"FAIL  {fn.__name__}: {exc!r}")
            traceback.print_exc()
    print(f"\n{len(fns) - failed} passed, {failed} failed")
    return 1 if failed else 0


if __name__ == "__main__":  # `python tests/test_physics_grounding.py`
    import os
    import sys
    sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
    raise SystemExit(_run_all())
