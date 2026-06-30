"""Comprehensive tests for the Palace simulation result parser and physics converter."""

from __future__ import annotations

import math
import tempfile
from pathlib import Path
from typing import Generator

import pytest

from app.simulation.parser import (
    EigenmodeResults,
    ElectrostaticResults,
    MagnetostaticResults,
    PalaceSolverType,
    ResultParser,
)
from app.simulation.parser.constants import (
    E_CHARGE,
    FF_TO_F,
    GHZ_TO_HZ,
    H_PLANCK,
    NA_TO_A,
    PHI0,
)
from app.simulation.parser.exceptions import (
    FileMissingError,
    HeaderNotFoundError,
    InvalidFormatError,
    PhysicsConversionError,
)


@pytest.fixture
def temp_dir() -> Generator[Path, None, None]:
    """Provide a temporary directory for writing mock CSV output files."""
    with tempfile.TemporaryDirectory() as tmpdir:
        yield Path(tmpdir)


# --- Unit Tests ---

def test_parse_eigenmode_success(temp_dir: Path):
    """Verify successful parsing of eig.csv and port-EPR.csv."""
    # Write mock eig.csv
    eig_content = """m, Re{f} (Hz), Im{f} (Hz), Q
1, 5.120000000000e+09, 0.0, 1.250000e+05
2, 5.240000000000e+09, 0.0, 1.450000e+05
"""
    with open(temp_dir / "eig.csv", "w", encoding="utf-8") as f:
        f.write(eig_content)

    # Write mock port-EPR.csv
    epr_content = """m, EPR[1], EPR[2]
1, 0.92, 0.08
2, 0.05, 0.95
"""
    with open(temp_dir / "port-EPR.csv", "w", encoding="utf-8") as f:
        f.write(epr_content)

    # Parse results
    port_names = ["junction_1", "junction_2"]
    results = ResultParser.parse_eigenmode(temp_dir, port_names)

    assert isinstance(results, EigenmodeResults)
    assert len(results.modes) == 2

    # Verify mode 1
    m1 = results.modes[0]
    assert m1.mode_index == 1
    assert math.isclose(m1.frequency_ghz, 5.12)
    assert math.isclose(m1.quality_factor, 125000.0)
    assert math.isclose(m1.epr["junction_1"], 0.92)
    assert math.isclose(m1.epr["junction_2"], 0.08)

    # Verify mode 2
    m2 = results.modes[1]
    assert m2.mode_index == 2
    assert math.isclose(m2.frequency_ghz, 5.24)
    assert math.isclose(m2.quality_factor, 145000.0)
    assert math.isclose(m2.epr["junction_1"], 0.05)
    assert math.isclose(m2.epr["junction_2"], 0.95)


def test_parse_electrostatic_success(temp_dir: Path):
    """Verify successful parsing of terminal-C.csv (Farad to fF)."""
    # Write mock terminal-C.csv (Maxwell capacitance matrix in Farads)
    c_content = """i, C[i][1] (F), C[i][2] (F), C[i][3] (F)
1,  9.000000e-14, -2.000000e-15, -1.000000e-15
2, -2.000000e-15,  9.000000e-14, -1.500000e-15
3, -1.000000e-15, -1.500000e-15,  8.000000e-14
"""
    with open(temp_dir / "terminal-C.csv", "w", encoding="utf-8") as f:
        f.write(c_content)

    terminal_names = ["island_1", "island_2", "readout_line"]
    results = ResultParser.parse_electrostatic(temp_dir, terminal_names)

    assert isinstance(results, ElectrostaticResults)
    assert results.terminal_ids == terminal_names
    assert results.units == "fF"
    assert len(results.matrix) == 3

    # Check Farads to fF conversion (multiplied by 1e15)
    # Row 1: [90.0, -2.0, -1.0]
    assert math.isclose(results.matrix[0][0], 90.0)
    assert math.isclose(results.matrix[0][1], -2.0)
    assert math.isclose(results.matrix[0][2], -1.0)


def test_parse_magnetostatic_success(temp_dir: Path):
    """Verify successful parsing of terminal-M.csv (Henries to nH)."""
    # Write mock terminal-M.csv (Inductance matrix in Henries)
    m_content = """i, M[i][1] (H), M[i][2] (H)
1,  1.500000e-08,  1.000000e-10
2,  1.000000e-10,  2.500000e-08
"""
    with open(temp_dir / "terminal-M.csv", "w", encoding="utf-8") as f:
        f.write(m_content)

    terminal_names = ["loop_1", "loop_2"]
    results = ResultParser.parse_magnetostatic(temp_dir, terminal_names)

    assert isinstance(results, MagnetostaticResults)
    assert results.terminal_ids == terminal_names
    assert results.units == "nH"
    assert len(results.matrix) == 2

    # Henries to nH (multiplied by 1e9)
    assert math.isclose(results.matrix[0][0], 15.0)
    assert math.isclose(results.matrix[0][1], 0.1)

    # Check extracted diagonal self-inductances
    assert len(results.inductance_data) == 2
    assert results.inductance_data[0].element_id == "loop_1"
    assert math.isclose(results.inductance_data[0].inductance_nH, 15.0)
    assert results.inductance_data[1].element_id == "loop_2"
    assert math.isclose(results.inductance_data[1].inductance_nH, 25.0)


def test_physics_parameter_conversion(temp_dir: Path):
    """Verify transmon Hamiltonian parameter and capacitive coupling derivations."""
    # Setup mock capacitance matrix
    c_content = """i, C[i][1] (F), C[i][2] (F)
1,  9.000000e-14, -2.000000e-15
2, -2.000000e-15,  9.000000e-14
"""
    with open(temp_dir / "terminal-C.csv", "w", encoding="utf-8") as f:
        f.write(c_content)

    # Parse electrostatic results
    terminal_names = ["island_1", "island_2"]
    electrostatic = ResultParser.parse_electrostatic(temp_dir, terminal_names)

    # Define qubit specifications
    qubits = [
        {
            "qubit_id": "Q1",
            "qubit_type": "transmon",
            "terminal_id": "island_1",
            "critical_current_nA": 30.0,
            "frequency_ghz": 5.0,
        },
        {
            "qubit_id": "Q2",
            "qubit_type": "transmon",
            "terminal_id": "island_2",
            "critical_current_nA": 30.0,
            "frequency_ghz": 5.0,
        }
    ]

    # Calculate parameters
    params = ResultParser.calculate_qubit_parameters(electrostatic, qubits)

    # 1. Analytical check for EC
    # C_Sigma = 90 fF = 9e-14 F
    # EC = e^2 / (2 * C) / h / 1e9
    expected_ec_joules = (E_CHARGE**2) / (2.0 * 90.0 * FF_TO_F)
    expected_ec_ghz = expected_ec_joules / (H_PLANCK * GHZ_TO_HZ)

    # 2. Analytical check for EJ
    # Ic = 30 nA = 3e-8 A
    # EJ = Phi_0 * Ic / 2pi / h / 1e9
    expected_ej_joules = PHI0 * (30.0 * NA_TO_A) / (2.0 * math.pi)
    expected_ej_ghz = expected_ej_joules / (H_PLANCK * GHZ_TO_HZ)

    # 3. Analytical check for coupling strength g
    # Cc = 2.0 fF
    # g = (Cc / 2) * sqrt(f1 * f2 / (C1 * C2))
    expected_g_ghz = (2.0 / 2.0) * math.sqrt((5.0 * 5.0) / (90.0 * 90.0))  # 5 / 90 = 0.05555... GHz

    # Verify Q1
    q1 = params["Q1"]
    assert q1.qubit_id == "Q1"
    assert q1.qubit_type == "transmon"
    assert math.isclose(q1.EC_ghz, expected_ec_ghz)
    assert math.isclose(q1.EJ_ghz, expected_ej_ghz)
    assert math.isclose(q1.capacitance_fF, 90.0)
    assert math.isclose(q1.coupling_caps["island_2"], 2.0)
    assert math.isclose(q1.coupling_strengths["Q2"], expected_g_ghz)
    assert math.isclose(q1.ej_ec_ratio, expected_ej_ghz / expected_ec_ghz)


# --- Error and Boundary Tests ---

def test_parser_missing_files_error(temp_dir: Path):
    """Verify that FileMissingError is raised when files are absent."""
    with pytest.raises(FileMissingError):
        ResultParser.parse_eigenmode(temp_dir)

    with pytest.raises(FileMissingError):
        ResultParser.parse_electrostatic(temp_dir, ["terminal_1"])


def test_parser_malformed_headers_error(temp_dir: Path):
    """Verify that HeaderNotFoundError is raised when column headers are wrong."""
    # Missing Re{f} and Q columns
    bad_eig = """m, Im{f}
1, 0.0
"""
    with open(temp_dir / "eig.csv", "w", encoding="utf-8") as f:
        f.write(bad_eig)

    with pytest.raises(HeaderNotFoundError):
        ResultParser.parse_eigenmode(temp_dir)


def test_parser_dimension_mismatch_error(temp_dir: Path):
    """Verify that InvalidFormatError is raised when matrices are not square."""
    # Row 2 is missing column 3
    bad_matrix = """i, C[i][1], C[i][2], C[i][3]
1,  9.0e-14, -2.0e-15, -1.0e-15
2, -2.0e-15,  9.0e-14
3, -1.0e-15, -1.5e-15,  8.0e-14
"""
    with open(temp_dir / "terminal-C.csv", "w", encoding="utf-8") as f:
        f.write(bad_matrix)

    with pytest.raises(InvalidFormatError):
        ResultParser.parse_electrostatic(temp_dir, ["t1", "t2", "t3"])


def test_parser_invalid_physics_bounds_error(temp_dir: Path):
    """Verify that PhysicsConversionError is raised when capacitances are non-positive."""
    c_content = """i, C[i][1], C[i][2]
1,  0.0, -2.0e-15
2, -2.0e-15,  9.0e-14
"""
    with open(temp_dir / "terminal-C.csv", "w", encoding="utf-8") as f:
        f.write(c_content)

    electrostatic = ResultParser.parse_electrostatic(temp_dir, ["island_1", "island_2"])

    qubits = [{
        "qubit_id": "Q1",
        "qubit_type": "transmon",
        "terminal_id": "island_1",
        "critical_current_nA": 30.0
    }]

    with pytest.raises(PhysicsConversionError) as exc:
        ResultParser.calculate_qubit_parameters(electrostatic, qubits)
    assert "non-positive self-capacitance" in str(exc.value)


# --- Backward Compatibility Test ---

def test_unified_parse_results_dict(temp_dir: Path):
    """Verify that parse_results returns a dictionary, satisfying backward compatibility."""
    c_content = """i, C[i][1], C[i][2]
1,  9.0e-14, -2.0e-15
2, -2.0e-15,  9.0e-14
"""
    with open(temp_dir / "terminal-C.csv", "w", encoding="utf-8") as f:
        f.write(c_content)

    raw_results = ResultParser.parse_results(
        output_dir=temp_dir,
        solver_type=PalaceSolverType.ELECTROSTATIC,
        terminal_names=["island_1", "island_2"]
    )

    assert isinstance(raw_results, dict)
    assert raw_results["solver_type"] == "electrostatic"
    assert "electrostatic" in raw_results
    assert raw_results["electrostatic"]["terminal_ids"] == ["island_1", "island_2"]
