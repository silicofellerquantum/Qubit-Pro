"""
test_physics_grounding_i2.py — Increment 2 tests.

Covers:
- SquaddsClient: local mirror load, NN search, interpolation, confidence
- SquaddsProvider: available() gates on mirror, resolve() returns GroundedGeometry
- PhysicsVerifier: scqubits path + analytic fallback
- PhysicsReasonablenessGate: pass/fail/tolerance
- Pipeline: reasonableness field present in result
"""
from __future__ import annotations

import math
import os
from pathlib import Path
from typing import Any, Dict
from unittest.mock import MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
MIRROR_DIR = Path(__file__).parent.parent / "squadds_mirror"
MIRROR_FILE = MIRROR_DIR / "qubit-TransmonCross-cap_matrix.json"
MIRROR_AVAILABLE = MIRROR_FILE.exists()


# ---------------------------------------------------------------------------
# SquaddsClient tests
# ---------------------------------------------------------------------------
class TestSquaddsClient:
    def test_mirror_exists_true_when_file_present(self):
        from app.services.physics_grounding.squadds_client import SquaddsClient
        client = SquaddsClient(mirror_dir=MIRROR_DIR)
        assert client.mirror_exists() == MIRROR_AVAILABLE

    @pytest.mark.skipif(not MIRROR_AVAILABLE, reason="SQuADDS mirror not present")
    def test_find_transmon_cross_returns_design_options(self):
        from app.services.physics_grounding.squadds_client import SquaddsClient
        client = SquaddsClient(mirror_dir=MIRROR_DIR)
        opts, confidence = client.find_transmon_cross(f_q_ghz=5.0, alpha_mhz=-340.0)
        assert isinstance(opts, dict)
        assert "cross_length" in opts
        assert "connection_pads" in opts
        assert 0.0 <= confidence <= 1.0

    @pytest.mark.skipif(not MIRROR_AVAILABLE, reason="SQuADDS mirror not present")
    def test_cross_length_has_um_suffix(self):
        from app.services.physics_grounding.squadds_client import SquaddsClient
        client = SquaddsClient(mirror_dir=MIRROR_DIR)
        opts, _ = client.find_transmon_cross(f_q_ghz=4.9, alpha_mhz=-340.0)
        assert str(opts["cross_length"]).endswith("um"), \
            f"cross_length should have 'um' suffix, got {opts['cross_length']!r}"

    @pytest.mark.skipif(not MIRROR_AVAILABLE, reason="SQuADDS mirror not present")
    def test_connection_pads_readout_keys_present(self):
        from app.services.physics_grounding.squadds_client import SquaddsClient
        client = SquaddsClient(mirror_dir=MIRROR_DIR)
        opts, _ = client.find_transmon_cross(f_q_ghz=5.0, alpha_mhz=-340.0)
        cp = opts["connection_pads"]["readout"]
        for key in ("claw_length", "ground_spacing", "claw_width"):
            assert key in cp, f"Missing key {key!r} in connection_pads.readout"

    @pytest.mark.skipif(not MIRROR_AVAILABLE, reason="SQuADDS mirror not present")
    def test_different_targets_give_different_geometries(self):
        from app.services.physics_grounding.squadds_client import SquaddsClient
        client = SquaddsClient(mirror_dir=MIRROR_DIR)
        opts_a, _ = client.find_transmon_cross(f_q_ghz=4.5, alpha_mhz=-300.0)
        opts_b, _ = client.find_transmon_cross(f_q_ghz=5.5, alpha_mhz=-380.0)
        # Different targets → different cross_length (physics: lower freq = longer)
        cl_a = float(str(opts_a["cross_length"]).replace("um", ""))
        cl_b = float(str(opts_b["cross_length"]).replace("um", ""))
        assert cl_a != cl_b, "Different targets should produce different geometries"

    def test_missing_mirror_raises_file_not_found(self):
        from app.services.physics_grounding.squadds_client import SquaddsClient
        client = SquaddsClient(mirror_dir=Path("/nonexistent/path"))
        assert not client.mirror_exists()
        with pytest.raises(FileNotFoundError):
            client.find_transmon_cross(f_q_ghz=5.0)


# ---------------------------------------------------------------------------
# SquaddsProvider tests
# ---------------------------------------------------------------------------
class TestSquaddsProvider:
    def test_available_reflects_mirror(self):
        from app.services.physics_grounding.providers.squadds import SquaddsProvider
        provider = SquaddsProvider()
        # Patch at the squadds_client module level (imported lazily inside available())
        with patch(
            "app.services.physics_grounding.squadds_client.SquaddsClient.mirror_exists",
            return_value=False,
        ):
            assert provider.available() is False

        with patch(
            "app.services.physics_grounding.squadds_client.SquaddsClient.mirror_exists",
            return_value=True,
        ):
            assert provider.available() is True

    def test_resolve_unsupported_family_returns_none(self):
        from app.services.physics_grounding.providers.squadds import SquaddsProvider
        from app.services.physics_grounding.targets import TargetVector
        provider = SquaddsProvider()
        result = provider.resolve("qubit", "TransmonPocket", TargetVector(f_q_ghz=5.0))
        assert result is None

    @pytest.mark.skipif(not MIRROR_AVAILABLE, reason="SQuADDS mirror not present")
    def test_resolve_transmon_cross_returns_grounded_geometry(self):
        from app.services.physics_grounding.providers.squadds import SquaddsProvider
        from app.services.physics_grounding.squadds_client import SquaddsClient
        from app.services.physics_grounding.targets import TargetVector
        # Use the real client with the actual mirror — no patching needed
        provider = SquaddsProvider()
        target = TargetVector(f_q_ghz=5.0, alpha_mhz=-340.0)
        result = provider.resolve("qubit", "TransmonCross", target)
        assert result is not None
        assert result.source == "squadds"
        assert "cross_length" in result.design_options
        assert 0.0 <= result.confidence <= 1.0

    def test_resolve_raises_provider_unavailable_on_missing_mirror(self):
        from app.services.physics_grounding.providers.squadds import SquaddsProvider
        from app.services.physics_grounding.providers.base import ProviderUnavailable
        from app.services.physics_grounding.targets import TargetVector
        provider = SquaddsProvider()
        with patch(
            "app.services.physics_grounding.squadds_client.SquaddsClient.find_transmon_cross",
            side_effect=FileNotFoundError("no mirror"),
        ):
            with pytest.raises(ProviderUnavailable):
                provider.resolve("qubit", "TransmonCross", TargetVector(f_q_ghz=5.0))


# ---------------------------------------------------------------------------
# PhysicsVerifier tests (Increment 2: scqubits path)
# ---------------------------------------------------------------------------
class TestPhysicsVerifierI2:
    def test_analytic_fallback_when_no_design_options(self):
        from app.services.physics_grounding.verifier import PhysicsVerifier
        from app.services.physics_grounding.targets import TargetVector
        v = PhysicsVerifier()
        target = TargetVector(f_q_ghz=5.0, alpha_mhz=-340.0)
        residuals = v.verify(target, design_options=None)
        # Analytic residuals should be near zero (self-consistent)
        assert "f_q_ghz" in residuals
        assert abs(residuals["f_q_ghz"]) < 0.1

    def test_scqubits_path_with_lj(self):
        """When design_options contains hfss_inductance, use scqubits."""
        try:
            import scqubits  # noqa: F401
        except ImportError:
            pytest.skip("scqubits not installed")
        from app.services.physics_grounding.verifier import PhysicsVerifier
        from app.services.physics_grounding.targets import TargetVector
        v = PhysicsVerifier()
        # Lj = 9.686 nH → EJ ≈ 33.8 GHz → f01 ≈ 9.23 GHz (scqubits)
        # Set target to the expected f01 so residual should be ~0
        target = TargetVector(f_q_ghz=9.23, alpha_mhz=-340.0)
        design_opts = {"hfss_inductance": 9.686e-9}  # in Henries
        residuals = v.verify(target, design_options=design_opts)
        assert "f_q_ghz" in residuals
        # scqubits result should be self-consistent (residual ≈ 0)
        assert abs(residuals["f_q_ghz"]) < 0.05

    def test_returns_empty_when_no_target_freq(self):
        from app.services.physics_grounding.verifier import PhysicsVerifier
        from app.services.physics_grounding.targets import TargetVector
        v = PhysicsVerifier()
        residuals = v.verify(TargetVector())  # no f_q_ghz
        assert residuals == {}


# ---------------------------------------------------------------------------
# PhysicsReasonablenessGate tests
# ---------------------------------------------------------------------------
class TestPhysicsReasonablenessGate:
    def _make_passing_target(self):
        from app.services.physics_grounding.targets import TargetVector
        return TargetVector(f_q_ghz=5.0, alpha_mhz=-340.0)

    def test_empty_graph_passes(self):
        from app.services.physics_grounding.reasonableness import PhysicsReasonablenessGate
        gate = PhysicsReasonablenessGate()
        graph = MagicMock()
        graph.nodes = []
        plan = MagicMock()
        report = gate.check_graph(graph, plan)
        assert report.all_passed is True
        assert report.results == []

    def test_gate_passes_within_tolerance(self):
        from app.services.physics_grounding.reasonableness import PhysicsReasonablenessGate, GateResult
        gate = PhysicsReasonablenessGate(thresholds={"f_q_ghz": 0.1, "alpha_mhz": 50.0})
        result = gate._evaluate("Q1", {"f_q_ghz": 0.05, "alpha_mhz": -10.0})
        assert result.passed is True

    def test_gate_fails_outside_tolerance(self):
        from app.services.physics_grounding.reasonableness import PhysicsReasonablenessGate
        gate = PhysicsReasonablenessGate(thresholds={"f_q_ghz": 0.1})
        result = gate._evaluate("Q1", {"f_q_ghz": 0.5})
        assert result.passed is False
        assert len(result.warnings) == 1

    def test_strict_mode_raises_on_failure(self):
        from app.services.physics_grounding.reasonableness import (
            PhysicsReasonablenessGate, ReasonablenessError
        )
        gate = PhysicsReasonablenessGate(thresholds={"f_q_ghz": 0.01}, strict=True)
        node = MagicMock()
        node.kind.value = "qubit"
        node.id = "Q1"
        node.design_options = {}
        plan = MagicMock()
        from app.services.physics_grounding.targets import TargetVector
        plan.target_for.return_value = TargetVector(f_q_ghz=5.0, alpha_mhz=-340.0)
        graph = MagicMock()
        graph.nodes = [node]
        # Patch PhysicsVerifier.verify at the class level so the lazy import picks it up
        with patch(
            "app.services.physics_grounding.verifier.PhysicsVerifier.verify",
            return_value={"f_q_ghz": 0.5},  # > 0.01 tolerance → should fail
        ):
            with pytest.raises(ReasonablenessError):
                gate.check_graph(graph, plan)

    def test_non_qubit_nodes_skipped(self):
        from app.services.physics_grounding.reasonableness import PhysicsReasonablenessGate
        gate = PhysicsReasonablenessGate()
        node = MagicMock()
        node.kind.value = "resonator"
        graph = MagicMock()
        graph.nodes = [node]
        plan = MagicMock()
        report = gate.check_graph(graph, plan)
        assert report.all_passed is True
        assert report.results == []

    def test_gate_report_to_dict(self):
        from app.services.physics_grounding.reasonableness import (
            GateReport, GateResult
        )
        report = GateReport()
        report.add(GateResult(node_id="Q1", passed=True, residuals={"f_q_ghz": 0.01}))
        report.add(GateResult(node_id="Q2", passed=False, residuals={"f_q_ghz": 0.5},
                               warnings=["Q2/f_q_ghz: residual +0.5000 exceeds tolerance ±0.1"]))
        d = report.to_dict()
        assert d["all_passed"] is False
        assert len(d["results"]) == 2


# ---------------------------------------------------------------------------
# Pipeline integration: reasonableness field present
# ---------------------------------------------------------------------------
def test_pipeline_result_has_reasonableness_field():
    import asyncio
    from app.constraints.constraints import DesignConstraints
    from app.services.design_pipeline import run_design_pipeline
    result = asyncio.run(run_design_pipeline(
        DesignConstraints(qubit_count=2, topology="line", substrate="silicon", metal="aluminum")
    ))
    assert "v2" in result
    assert "reasonableness" in result["v2"], "v2.reasonableness missing from pipeline result"
    r = result["v2"]["reasonableness"]
    assert isinstance(r, dict)


# ---------------------------------------------------------------------------
# GeometryOracle: SQuADDS → analytic fallback chain
# ---------------------------------------------------------------------------
def test_oracle_falls_back_to_analytic_when_squadds_unavailable():
    from app.services.physics_grounding.oracle import GeometryOracle
    from app.services.physics_grounding.providers.base import ProviderUnavailable
    from app.services.physics_grounding.targets import TargetVector

    mock_squadds = MagicMock()
    mock_squadds.available.return_value = False

    from app.services.physics_grounding.providers.analytic import AnalyticProvider
    oracle = GeometryOracle(providers=[mock_squadds, AnalyticProvider()])
    geo = oracle.resolve("qubit", "TransmonCross", TargetVector(f_q_ghz=5.0))
    assert geo.source in ("analytic", "catalog")
    assert "cross_length" in geo.design_options


@pytest.mark.skipif(not MIRROR_AVAILABLE, reason="SQuADDS mirror not present")
def test_oracle_uses_squadds_when_mirror_present():
    from app.services.physics_grounding.oracle import GeometryOracle
    from app.services.physics_grounding.providers.squadds import SquaddsProvider
    from app.services.physics_grounding.targets import TargetVector

    # Real provider with real mirror — no patching needed
    oracle = GeometryOracle(providers=[SquaddsProvider()])
    geo = oracle.resolve("qubit", "TransmonCross", TargetVector(f_q_ghz=5.0, alpha_mhz=-340.0))
    assert geo.source == "squadds"
    assert geo.confidence > 0.0
