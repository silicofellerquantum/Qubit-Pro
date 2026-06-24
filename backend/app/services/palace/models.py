from __future__ import annotations
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class SolverType(str, Enum):
    EIGENMODE = "eigenmode"
    ELECTROSTATIC = "electrostatic"
    DRIVEN = "driven"


class QubitGeom(BaseModel):
    id: str
    x_mm: float
    y_mm: float
    type: str
    design_options: Dict[str, Any] = Field(default_factory=dict)
    frequency_ghz: float
    anharmonicity_ghz: float
    ej_ghz: float
    ec_ghz: float


class ResonatorGeom(BaseModel):
    id: str
    x_mm: float
    y_mm: float
    type: str
    length_mm: float
    detuning_ghz: float
    frequency_ghz: float
    target_qubit_id: str
    design_options: Dict[str, Any] = Field(default_factory=dict)


class CouplerGeom(BaseModel):
    id: str
    x_mm: float
    y_mm: float
    type: str
    qubit_a_id: str
    qubit_b_id: str
    strength_mhz: float
    design_options: Dict[str, Any] = Field(default_factory=dict)


class FeedlineGeom(BaseModel):
    id: str
    x_mm: float
    y_mm: float
    length_mm: float
    design_options: Dict[str, Any] = Field(default_factory=dict)


class LaunchpadGeom(BaseModel):
    id: str
    x_mm: float
    y_mm: float
    style: str
    design_options: Dict[str, Any] = Field(default_factory=dict)


class ChipGeometry(BaseModel):
    chip_name: str
    width_mm: float
    height_mm: float
    substrate: str
    metal: str
    qubits: List[QubitGeom] = Field(default_factory=list)
    resonators: List[ResonatorGeom] = Field(default_factory=list)
    couplers: List[CouplerGeom] = Field(default_factory=list)
    feedlines: List[FeedlineGeom] = Field(default_factory=list)
    launchpads: List[LaunchpadGeom] = Field(default_factory=list)
