"""
reasonableness.py — PhysicsReasonablenessGate (Increment 2).

Validates that grounded design_options produce physically plausible parameters
by comparing verifier residuals against configurable tolerances.

Gate policy
-----------
- A node **passes** if all residuals are within tolerance OR if the verifier
  cannot compute residuals (e.g. missing design data → no gate → pass).
- A node **fails** if any residual exceeds its threshold.
- On failure the gate emits a warning and falls back to the analytic provider,
  which always yields a baseline-reasonable geometry.
- The gate is non-blocking by default (``strict=False``): failure produces a
  warning in the pipeline response but does not abort generation.  Set
  ``strict=True`` to raise ``ReasonablenessError`` on failure.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

log = logging.getLogger(__name__)


class ReasonablenessError(ValueError):
    """Raised by the gate in strict mode when a node fails the physics check."""


@dataclass
class GateResult:
    """Per-node result of the reasonableness check."""
    node_id:    str
    passed:     bool
    residuals:  Dict[str, float] = field(default_factory=dict)
    warnings:   List[str]        = field(default_factory=list)


@dataclass
class GateReport:
    """Aggregate gate report for a full design graph."""
    results:    List[GateResult] = field(default_factory=list)
    all_passed: bool             = True

    def add(self, result: GateResult) -> None:
        self.results.append(result)
        if not result.passed:
            self.all_passed = False

    def warning_messages(self) -> List[str]:
        msgs: List[str] = []
        for r in self.results:
            msgs.extend(r.warnings)
        return msgs

    def to_dict(self) -> Dict[str, Any]:
        return {
            "all_passed": self.all_passed,
            "results": [
                {
                    "node_id":   r.node_id,
                    "passed":    r.passed,
                    "residuals": r.residuals,
                    "warnings":  r.warnings,
                }
                for r in self.results
            ],
        }


# Default tolerance thresholds
_DEFAULT_THRESHOLDS: Dict[str, float] = {
    "f_q_ghz":   0.10,   # ±100 MHz on qubit frequency
    "alpha_mhz": 50.0,   # ±50 MHz on anharmonicity
}


class PhysicsReasonablenessGate:
    """
    Checks every grounded qubit node in the graph for physical reasonableness.

    Parameters
    ----------
    thresholds : residual tolerance dict (key → absolute tolerance)
    strict     : if True, raise ``ReasonablenessError`` on any failure
    """

    def __init__(
        self,
        thresholds: Optional[Dict[str, float]] = None,
        strict: bool = False,
    ) -> None:
        self._thresholds = thresholds or dict(_DEFAULT_THRESHOLDS)
        self._strict = strict

    def check_graph(self, graph: Any, plan: Any) -> GateReport:
        """
        Check all qubit nodes in ``graph`` against their targets in ``plan``.

        Parameters
        ----------
        graph : DesignGraph (nodes have .kind, .id, .design_options, .component_id)
        plan  : PhysicsPlan (has .target_for(node_id))

        Returns
        -------
        GateReport
        """
        from app.services.physics_grounding.verifier import physics_verifier

        report = GateReport()
        for node in graph.nodes:
            kind_value = node.kind.value if hasattr(node.kind, "value") else str(node.kind)
            if kind_value != "qubit":
                continue

            target = plan.target_for(node.id)
            if target is None:
                continue

            design_opts = getattr(node, "design_options", None) or {}
            residuals = physics_verifier.verify(target, design_opts)

            result = self._evaluate(node.id, residuals)
            report.add(result)

            if not result.passed:
                msg = (
                    f"Node {node.id} failed reasonableness gate: "
                    + ", ".join(
                        f"{k}={v:+.4f} (tol={self._thresholds.get(k, '?')})"
                        for k, v in residuals.items()
                        if abs(v) > self._thresholds.get(k, float("inf"))
                    )
                )
                log.warning(msg)
                if self._strict:
                    raise ReasonablenessError(msg)

        return report

    def _evaluate(self, node_id: str, residuals: Dict[str, float]) -> GateResult:
        if not residuals:
            return GateResult(node_id=node_id, passed=True)

        warnings: List[str] = []
        passed = True
        for key, val in residuals.items():
            tol = self._thresholds.get(key, float("inf"))
            if abs(val) > tol:
                passed = False
                warnings.append(
                    f"{node_id}/{key}: residual {val:+.4f} exceeds tolerance ±{tol}"
                )

        return GateResult(
            node_id=node_id,
            passed=passed,
            residuals=residuals,
            warnings=warnings,
        )


# Module-level default instance
reasonableness_gate = PhysicsReasonablenessGate()
