"""Pydantic models representing validated simulation results and physical parameters."""

from __future__ import annotations

from enum import Enum
from typing import Dict, List, Optional

from pydantic import BaseModel, Field


class PalaceSolverType(str, Enum):
    """Supported solver types in AWS Palace."""

    EIGENMODE = "eigenmode"
    ELECTROSTATIC = "electrostatic"
    MAGNETOSTATIC = "magnetostatic"
    DRIVEN = "driven"


class EigenmodeMode(BaseModel):
    """Represents a single parsed electromagnetic eigenmode."""

    mode_index: int = Field(description="The index of the eigenmode (1-based).")
    frequency_ghz: float = Field(description="Resonant frequency of the mode in GHz.")
    quality_factor: float = Field(description="Quality factor (Q) of the mode.")
    epr: Dict[str, float] = Field(
        default_factory=dict,
        description="Energy Participation Ratio (EPR) mapping for junctions/ports.",
    )


class EigenmodeResults(BaseModel):
    """Collection of parsed eigenmodes."""

    modes: List[EigenmodeMode] = Field(default_factory=list, description="List of simulated eigenmodes.")


class ElectrostaticResults(BaseModel):
    """Represents the parsed capacitance matrix from electrostatic simulations."""

    terminal_ids: List[str] = Field(description="Ordered list of terminal names.")
    matrix: List[List[float]] = Field(
        description="N x N capacitance matrix in femtofarads (fF)."
    )
    units: str = Field(default="fF", description="Unit of capacitance values.")


class InductanceEntry(BaseModel):
    """Self-inductance entry for a specific element."""

    element_id: str = Field(description="Name of the inductor/terminal.")
    inductance_nH: float = Field(description="Self-inductance value in nanohenries (nH).")


class MagnetostaticResults(BaseModel):
    """Represents the parsed inductance matrix from magnetostatic simulations."""

    terminal_ids: List[str] = Field(description="Ordered list of terminal names.")
    matrix: List[List[float]] = Field(
        description="N x N inductance matrix in nanohenries (nH)."
    )
    inductance_data: List[InductanceEntry] = Field(
        default_factory=list,
        description="Extracted self-inductance entries (diagonal of the matrix).",
    )
    units: str = Field(default="nH", description="Unit of inductance values.")


class QubitPhysicalParameters(BaseModel):
    """Derived physical and Hamiltonian parameters for a qubit island."""

    qubit_id: str = Field(description="Identifier of the qubit (e.g., Q1).")
    qubit_type: str = Field(description="Type of qubit (e.g., transmon, fluxonium).")
    EC_ghz: float = Field(description="Charging energy Ec in GHz.")
    EJ_ghz: float = Field(description="Josephson energy Ej in GHz.")
    EL_ghz: Optional[float] = Field(
        default=None, description="Inductive energy EL in GHz (fluxonium only)."
    )
    ej_ec_ratio: float = Field(default=0.0, description="Ratio Ej/Ec.")
    capacitance_fF: float = Field(
        default=0.0, description="Self-capacitance of the qubit island in fF."
    )
    coupling_caps: Dict[str, float] = Field(
        default_factory=dict,
        description="Mutual coupling capacitances to other terminals/qubits in fF.",
    )
    coupling_strengths: Dict[str, float] = Field(
        default_factory=dict,
        description="Capacitive coupling strengths (g_ij) in GHz to other terminals/qubits.",
    )

    def model_post_init(self, __context) -> None:
        """Calculate the Ej/Ec ratio after model initialization."""
        if self.EC_ghz > 0.0:
            self.ej_ec_ratio = self.EJ_ghz / self.EC_ghz


class ParsedSimulationResults(BaseModel):
    """Unified container representing all parsed outputs and derived parameters."""

    solver_type: PalaceSolverType = Field(description="The solver type used in execution.")
    eigenmode: Optional[EigenmodeResults] = None
    electrostatic: Optional[ElectrostaticResults] = None
    magnetostatic: Optional[MagnetostaticResults] = None
    qubit_parameters: Optional[Dict[str, QubitPhysicalParameters]] = None
