"""Pydantic models for AWS Palace electromagnetic simulation backend."""

from __future__ import annotations

from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class PalaceSolverType(str, Enum):
    EIGENMODE = "eigenmode"
    ELECTROSTATIC = "electrostatic"
    DRIVEN = "driven"


class GeometryElementKind(str, Enum):
    QUBIT = "qubit"
    RESONATOR = "resonator"
    COUPLER = "coupler"
    FEEDLINE = "feedline"
    LAUNCHPAD = "launchpad"


class GeometryElement(BaseModel):
    """Normalized geometry element extracted from design graph nodes."""
    id: str = Field(description="Unique identifier of the element.")
    kind: GeometryElementKind = Field(description="Kind of element.")
    x_mm: float = Field(description="X coordinate in millimeters.")
    y_mm: float = Field(description="Y coordinate in millimeters.")
    orientation_deg: float = Field(default=0.0, description="Orientation angle in degrees.")
    params: Dict[str, Any] = Field(default_factory=dict, description="Component physical parameters.")


class EMGeometry(BaseModel):
    """Normalized electromagnetic geometry representation of the chip."""
    design_id: str = Field(description="Identifier of the design.")
    chip_width_mm: float = Field(description="Width of the chip die in mm.")
    chip_height_mm: float = Field(description="Height of the chip die in mm.")
    substrate: str = Field(description="Substrate material (e.g. silicon, sapphire).")
    metal: str = Field(description="Metal layer material (e.g. aluminum, niobium).")
    elements: List[GeometryElement] = Field(default_factory=list, description="List of physical elements.")

    @property
    def qubits(self) -> List[GeometryElement]:
        return [el for el in self.elements if el.kind == GeometryElementKind.QUBIT]

    @property
    def resonators(self) -> List[GeometryElement]:
        return [el for el in self.elements if el.kind == GeometryElementKind.RESONATOR]

    @property
    def couplers(self) -> List[GeometryElement]:
        return [el for el in self.elements if el.kind == GeometryElementKind.COUPLER]


class PalaceEigenmodeMode(BaseModel):
    """Eigennmode parameters parsed from Palace output."""
    mode_index: int = Field(description="1-based index of the mode.")
    frequency_ghz: float = Field(description="Resonant frequency in GHz.")
    quality_factor: float = Field(description="Quality factor of the mode.")
    epr: Dict[str, float] = Field(
        default_factory=dict,
        description="Energy participation ratios: {junction_id: participation_fraction}."
    )


class PalaceEigenmodeOutput(BaseModel):
    """Full eigenmode suite output parsed from simulation."""
    modes: List[PalaceEigenmodeMode] = Field(default_factory=list)


class PalaceElectrostaticOutput(BaseModel):
    """Lumped capacitance matrix output parsed from simulation."""
    terminal_ids: List[str] = Field(description="Ordered list of terminal identifiers.")
    matrix: List[List[float]] = Field(description="N x N capacitance matrix values in fF.")
    units: str = Field(default="fF", description="Capacitance matrix units.")


class PalaceSimulationOutput(BaseModel):
    """Container for parsed results of a Palace simulation run."""
    simulation_id: str = Field(description="Unique simulation ID.")
    design_id: str = Field(description="Design ID.")
    timestamp: str = Field(description="Timestamp of the simulation run.")
    solver_type: PalaceSolverType = Field(description="Solver type executed.")
    eigenmode: Optional[PalaceEigenmodeOutput] = None
    electrostatic: Optional[PalaceElectrostaticOutput] = None
    runtime_seconds: float = Field(default=0.0, description="Total solver runtime in seconds.")
    stdout: str = Field(default="", description="Solver stdout log.")
    stderr: str = Field(default="", description="Solver stderr log.")
