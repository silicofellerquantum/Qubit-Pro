"""Palace simulation results parser and physics conversion package.

This package parses raw CSV solver outputs (capacitance, inductance, EPR, frequencies)
into strongly typed models and performs Hamiltonian energy derivations.
"""

from __future__ import annotations

from app.simulation.parser.exceptions import (
    FileMissingError,
    HeaderNotFoundError,
    InvalidFormatError,
    PhysicsConversionError,
    ResultParserError,
)
from app.simulation.parser.parser_models import (
    EigenmodeMode,
    EigenmodeResults,
    ElectrostaticResults,
    InductanceEntry,
    MagnetostaticResults,
    PalaceSolverType,
    ParsedSimulationResults,
    QubitPhysicalParameters,
)
from app.simulation.parser.result_parser import ResultParser

__all__ = [
    "ResultParser",
    "PalaceSolverType",
    "EigenmodeMode",
    "EigenmodeResults",
    "ElectrostaticResults",
    "InductanceEntry",
    "MagnetostaticResults",
    "QubitPhysicalParameters",
    "ParsedSimulationResults",
    "ResultParserError",
    "FileMissingError",
    "HeaderNotFoundError",
    "InvalidFormatError",
    "PhysicsConversionError",
]
