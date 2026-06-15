"""
targets.py — Physics-grounding data models.

These describe the *target* Hamiltonian / EM quantities a design must hit, the
geometry resolved for each logical role, and the ``PhysicsPlan`` emitted by the
intent-level grounding stage (which runs *before* DesignGraph construction).

The target keys deliberately mirror SQuADDS' Hamiltonian parameter names so the
exact same vector can be used as a database query when the SQuADDS provider
lands in Increment 2.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

# Provenance of a grounded geometry/target:
#   "squadds"  — retrieved/interpolated from the SQuADDS database (Increment 2)
#   "ml"       — predicted by an ML inverse model                 (V2)
#   "analytic" — derived from the analytic frequency planner       (Increment 1)
#   "catalog"  — raw catalog default_options (final fallback)
GeometrySource = str


def _f(v: Any) -> Optional[float]:
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


@dataclass
class TargetVector:
    """Target Hamiltonian/EM parameters for a single qubit + its readout."""

    f_q_ghz:   Optional[float] = None   # qubit 0->1 transition frequency (GHz)
    alpha_mhz: Optional[float] = None   # anharmonicity (MHz, negative for transmon)
    f_r_ghz:   Optional[float] = None   # readout/cavity frequency (GHz)
    kappa_khz: Optional[float] = None   # resonator linewidth (kHz)
    g_mhz:     Optional[float] = None   # qubit-resonator coupling (MHz)

    def to_dict(self) -> Dict[str, Any]:
        # SQuADDS-compatible key names.
        return {
            "qubit_frequency_GHz":  self.f_q_ghz,
            "anharmonicity_MHz":    self.alpha_mhz,
            "cavity_frequency_GHz": self.f_r_ghz,
            "kappa_kHz":            self.kappa_khz,
            "g_MHz":                self.g_mhz,
        }

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "TargetVector":
        return cls(
            f_q_ghz   = _f(d.get("qubit_frequency_GHz",  d.get("f_q_ghz"))),
            alpha_mhz = _f(d.get("anharmonicity_MHz",    d.get("alpha_mhz"))),
            f_r_ghz   = _f(d.get("cavity_frequency_GHz", d.get("f_r_ghz"))),
            kappa_khz = _f(d.get("kappa_kHz",            d.get("kappa_khz"))),
            g_mhz     = _f(d.get("g_MHz",                d.get("g_mhz"))),
        )


@dataclass
class RoleTargets:
    """Per-qubit grounded targets, keyed elsewhere by qubit id (Q1, Q2, ...)."""

    qubit_id: str
    group:    str = "A"
    target:   TargetVector = field(default_factory=TargetVector)


@dataclass
class GroundedGeometry:
    """Resolved Qiskit Metal ``design_options`` for one component + provenance."""

    design_options: Dict[str, Any]      = field(default_factory=dict)
    source:         GeometrySource      = "analytic"
    confidence:     float               = 1.0   # 1.0 = exact/db-hit; lower = interpolated/fallback
    residuals:      Dict[str, float]    = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "design_options": self.design_options,
            "source":         self.source,
            "confidence":     self.confidence,
            "residuals":      self.residuals,
        }


@dataclass
class PhysicsPlan:
    """Output of intent-level Physics Grounding.

    Holds the (possibly snapped) constraints the graph should be built from,
    grounded per-qubit targets, and family-level grounded geometry. Node-level
    geometry is resolved later by ``resolve_geometry`` once the graph exists.
    """

    constraints:      Any                          = None   # DesignConstraints (grounded)
    role_targets:     Dict[str, RoleTargets]       = field(default_factory=dict)
    geometry_by_role: Dict[str, GroundedGeometry]  = field(default_factory=dict)
    provenance:       GeometrySource               = "analytic"
    warnings:         List[str]                    = field(default_factory=list)
    epsilon_eff:      float                        = 0.0

    def target_for(self, qubit_id: str) -> Optional[TargetVector]:
        rt = self.role_targets.get(qubit_id)
        return rt.target if rt else None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "provenance":  self.provenance,
            "epsilon_eff": self.epsilon_eff,
            "role_targets": {
                qid: {"group": rt.group, **rt.target.to_dict()}
                for qid, rt in self.role_targets.items()
            },
            "geometry_by_role": {k: v.to_dict() for k, v in self.geometry_by_role.items()},
            "warnings": list(self.warnings),
        }
