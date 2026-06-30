"""Pydantic schemas and models for the Palace EM solver JSON configuration."""

from __future__ import annotations

from typing import Dict, List, Optional
from pydantic import BaseModel, Field, ConfigDict, field_validator


class ProblemBlock(BaseModel):
    """Configuration options for the general problem specification."""
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    solver_type: str = Field(
        ...,
        serialization_alias="Type",
        description="The solver formulation to use: 'Eigenmode', 'Electrostatic', 'Magnetostatic', or 'Driven'."
    )
    verbose: int = Field(1, serialization_alias="Verbose", ge=0, description="Verbosity level of solver logs.")
    output: str = Field("out", serialization_alias="Output", description="Name of the output directory.")
    output_formats: Dict[str, bool] = Field(
        default_factory=lambda: {"Paraview": True},
        serialization_alias="OutputFormats",
        description="Active volumetric visualization export formats."
    )

    @field_validator("solver_type")
    @classmethod
    def validate_solver_type(cls, v: str) -> str:
        valid = {"Eigenmode", "Electrostatic", "Magnetostatic", "Driven"}
        # Map lowercase or mixed case to correct titlecase
        v_title = v.title()
        if v_title not in valid:
            raise ValueError(f"Invalid solver type: '{v}'. Must be one of {valid}")
        return v_title


class ModelBlock(BaseModel):
    """Mesh file and unit scaling specification."""
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    mesh: str = Field(..., serialization_alias="Mesh", description="Path to the mesh file (usually mesh.msh).")
    l0: float = Field(
        1.0e-3,
        serialization_alias="L0",
        gt=0.0,
        description="Scale factor of coordinates to meters (e.g., 1e-3 to scale mm to meters)."
    )


class MaterialBlock(BaseModel):
    """Material properties assigned to specific 3D mesh attributes."""
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    attributes: List[int] = Field(..., serialization_alias="Attributes", description="Mesh volume tags to apply to.")
    permittivity: float = Field(1.0, serialization_alias="Permittivity", gt=0.0)
    permeability: float = Field(1.0, serialization_alias="Permeability", gt=0.0)
    loss_tangent: Optional[float] = Field(None, serialization_alias="LossTan", ge=0.0)
    conductivity: Optional[float] = Field(None, serialization_alias="Conductivity", ge=0.0)


class DomainsBlock(BaseModel):
    """Materials definition block for simulation subdomains."""
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    materials: List[MaterialBlock] = Field(..., serialization_alias="Materials")


class PecBlock(BaseModel):
    """Perfect Electric Conductor boundary condition."""
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    attributes: List[int] = Field(..., serialization_alias="Attributes")


class AbsorbingBlock(BaseModel):
    """Absorbing / scattering boundary condition for open boundaries."""
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    attributes: List[int] = Field(..., serialization_alias="Attributes")
    order: int = Field(1, serialization_alias="Order", ge=1, le=2)


class TerminalBlock(BaseModel):
    """Terminal boundary definition for electrostatic simulations."""
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    index: int = Field(..., serialization_alias="Index", ge=1)
    attributes: List[int] = Field(..., serialization_alias="Attributes")


class LumpedPortBlock(BaseModel):
    """Lumped excitation port definition for wave or magnetostatic simulations."""
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    index: int = Field(..., serialization_alias="Index", ge=1)
    attributes: List[int] = Field(..., serialization_alias="Attributes")
    r: float = Field(0.0, serialization_alias="R", ge=0.0, description="Resistance in Ohms.")
    l: float = Field(0.0, serialization_alias="L", ge=0.0, description="Inductance in nH (converted to Henries in solver if needed).")
    c: float = Field(0.0, serialization_alias="C", ge=0.0, description="Capacitance in fF.")
    direction: str = Field("+X", serialization_alias="Direction")


class SurfaceCurrentBlock(BaseModel):
    """Surface current boundary definition for magnetostatic simulations."""
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    index: int = Field(..., serialization_alias="Index", ge=1)
    attributes: List[int] = Field(..., serialization_alias="Attributes")
    direction: str = Field("+X", serialization_alias="Direction")


class BoundariesBlock(BaseModel):
    """Boundary conditions block mapping mesh surfaces to physical constraints."""
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    pec: Optional[PecBlock] = Field(None, serialization_alias="PEC")
    absorbing: Optional[AbsorbingBlock] = Field(None, serialization_alias="Absorbing")
    terminal: Optional[List[TerminalBlock]] = Field(None, serialization_alias="Terminal")
    lumped_port: Optional[List[LumpedPortBlock]] = Field(None, serialization_alias="LumpedPort")
    surface_current: Optional[List[SurfaceCurrentBlock]] = Field(None, serialization_alias="SurfaceCurrent")


class LinearSolverBlock(BaseModel):
    """Linear iterative solver and tolerance settings."""
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    solver_type: str = Field("Default", serialization_alias="Type")
    tol: float = Field(1.0e-8, serialization_alias="Tol", gt=0.0)
    max_its: int = Field(100, serialization_alias="MaxIts", ge=1)


class EigenmodeSolverBlock(BaseModel):
    """Eigenmode solver settings."""
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    n: int = Field(5, serialization_alias="N", ge=1, description="Number of modes to compute.")
    target: float = Field(5.0e9, serialization_alias="Target", ge=0.0, description="Target search frequency in Hz.")
    save: int = Field(5, serialization_alias="Save", ge=0, description="Number of mode visualization files to save.")


class ElectrostaticSolverBlock(BaseModel):
    """Electrostatic solver settings."""
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    save: int = Field(1, serialization_alias="Save", ge=0)


class MagnetostaticSolverBlock(BaseModel):
    """Magnetostatic solver settings."""
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    save: int = Field(1, serialization_alias="Save", ge=0)


class DrivenSolverBlock(BaseModel):
    """Frequency-driven solver settings for sweep analysis."""
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    min_freq: float = Field(..., serialization_alias="MinFreq", ge=0.0, description="Start frequency in Hz.")
    max_freq: float = Field(..., serialization_alias="MaxFreq", ge=0.0, description="Stop frequency in Hz.")
    freq_step: float = Field(..., serialization_alias="FreqStep", gt=0.0, description="Step frequency in Hz.")


class SolverBlock(BaseModel):
    """Solver settings including element order, linear solver, and formulation options."""
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    order: int = Field(1, serialization_alias="Order", ge=1, le=4, description="FEM basis polynomial order.")
    linear: LinearSolverBlock = Field(default_factory=LinearSolverBlock, serialization_alias="Linear")
    eigenmode: Optional[EigenmodeSolverBlock] = Field(None, serialization_alias="Eigenmode")
    electrostatic: Optional[ElectrostaticSolverBlock] = Field(None, serialization_alias="Electrostatic")
    magnetostatic: Optional[MagnetostaticSolverBlock] = Field(None, serialization_alias="Magnetostatic")
    driven: Optional[DrivenSolverBlock] = Field(None, serialization_alias="Driven")


class PalaceConfig(BaseModel):
    """Top-level Palace solver configuration JSON schema."""
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    problem: ProblemBlock = Field(..., serialization_alias="Problem")
    model: ModelBlock = Field(..., serialization_alias="Model")
    domains: DomainsBlock = Field(..., serialization_alias="Domains")
    boundaries: BoundariesBlock = Field(..., serialization_alias="Boundaries")
    solver: SolverBlock = Field(..., serialization_alias="Solver")
