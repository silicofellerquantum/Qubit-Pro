"""Tests for the simulation results validator."""

from __future__ import annotations

import pytest
from app.simulation.validator import validate_eigenmode_results
from app.simulation.parser.result_parser import ResultParser
from app.simulation.service.simulation_service import SimulationService
from app.simulation.service.execution_context import ExecutionContext

def test_validate_eigenmode_results_valid():
    """Verify validation passes for clean, physically sound results."""
    modes = [
        {"mode_index": 1, "frequency_ghz": 5.12, "quality_factor": 120000.0, "epr": {"junction_1": 0.95}},
        {"mode_index": 2, "frequency_ghz": 5.84, "quality_factor": 150000.0, "epr": {"junction_1": 0.04}}
    ]
    report = validate_eigenmode_results(modes)
    assert report["is_valid"] is True
    assert len(report["errors"]) == 0
    assert len(report["warnings"]) == 0

def test_validate_eigenmode_results_sort_violation():
    """Verify sort violation is flagged as a critical error."""
    modes = [
        {"mode_index": 1, "frequency_ghz": 5.84, "quality_factor": 150000.0, "epr": {}},
        {"mode_index": 2, "frequency_ghz": 5.12, "quality_factor": 120000.0, "epr": {}}
    ]
    report = validate_eigenmode_results(modes)
    assert report["is_valid"] is False
    assert any("Frequency sort violation" in err for err in report["errors"])

def test_validate_eigenmode_results_spurious_freq():
    """Verify modes exceeding the frequency ceiling generate warnings."""
    modes = [
        {"mode_index": 1, "frequency_ghz": 5.12, "quality_factor": 120000.0, "epr": {}},
        {"mode_index": 2, "frequency_ghz": 512.0, "quality_factor": 150000.0, "epr": {}}
    ]
    report = validate_eigenmode_results(modes)
    assert report["is_valid"] is True
    assert len(report["errors"]) == 0
    assert any("Spurious high-frequency mode detected" in wrn for wrn in report["warnings"])

def test_validate_eigenmode_results_underflow_epr():
    """Verify EPR values below the floor trigger warnings."""
    modes = [
        {"mode_index": 1, "frequency_ghz": 5.12, "quality_factor": 120000.0, "epr": {"junction_1": 1e-32}}
    ]
    report = validate_eigenmode_results(modes)
    assert report["is_valid"] is True
    assert any("EPR underflow detected" in wrn for wrn in report["warnings"])

def test_validate_eigenmode_results_low_q():
    """Verify Q < 1 triggers a warning."""
    modes = [
        {"mode_index": 1, "frequency_ghz": 5.12, "quality_factor": 0.15, "epr": {}}
    ]
    report = validate_eigenmode_results(modes)
    assert report["is_valid"] is True
    assert any("Low quality factor detected" in wrn for wrn in report["warnings"])
