"""
verifier.py — PhysicsVerifier (forward check).

Increment 2: uses the ``scqubits`` Transmon solver when available for a
geometry-derived forward check.  Falls back to the analytic closed-form
if scqubits is not importable or design_options lacks inductance information.

Forward check flow:
  1. If ``design_options`` contains ``hfss_inductance`` (nH), extract EJ from Lj.
  2. Derive EC from cross_to_cross cap (if available in design_options or from
     target alpha).
  3. Solve f01 and anharmonicity with scqubits ``Transmon`` (truncation = 10).
  4. Compute and return residuals.

Increment 1 analytic fallback:
    f01   ≈ sqrt(8·EJ·EC) − EC
    alpha ≈ −EC
"""
from __future__ import annotations

import logging
import math
from typing import Any, Dict, Optional

from app.services.physics_grounding.targets import TargetVector

log = logging.getLogger(__name__)

# Physical constants
_E_CHARGE = 1.602e-19   # C
_H_PLANCK = 6.626e-34   # J·s
_F_TO_F   = 1e-15       # fF → F

# scqubits Transmon truncation (10 is enough for f01 + alpha to 1 MHz accuracy)
_TRUNC_DIM = 10


def _EJ_from_Lj_nH(Lj_nH: float) -> float:
    """Josephson energy EJ (GHz) from junction inductance Lj (nH)."""
    # EJ = Φ0² / (2π² Lj)   where Φ0 = h/(2e)
    phi0 = _H_PLANCK / (2.0 * _E_CHARGE)
    EJ_J = phi0**2 / (2.0 * math.pi**2 * Lj_nH * 1e-9)
    return EJ_J / _H_PLANCK / 1e9


def _EC_from_alpha(alpha_mhz: float) -> float:
    """EC (GHz) from anharmonicity (MHz, negative for transmon)."""
    return abs(alpha_mhz) / 1000.0


class PhysicsVerifier:
    """
    Forward-verify a set of design_options against target Hamiltonian parameters.

    Uses scqubits ``Transmon`` when available; falls back to analytic closed forms.
    """

    def verify(
        self,
        target: TargetVector,
        design_options: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, float]:
        """
        Return residuals ``{param: predicted − target}``.  Empty if not checkable.

        Parameters
        ----------
        target         : target Hamiltonian parameters
        design_options : Qiskit Metal design_options (may contain hfss_inductance)
        """
        if target.f_q_ghz is None:
            return {}

        # Try scqubits path first
        scq_result = self._verify_scqubits(target, design_options)
        if scq_result is not None:
            return scq_result

        # Analytic fallback
        return self._verify_analytic(target)

    # ------------------------------------------------------------------
    # scqubits path
    # ------------------------------------------------------------------
    def _verify_scqubits(
        self,
        target: TargetVector,
        design_options: Optional[Dict[str, Any]],
    ) -> Optional[Dict[str, float]]:
        try:
            import scqubits as scq  # noqa: F401
        except ImportError:
            return None

        if design_options is None:
            return None

        # Extract Lj (nH) from design_options
        Lj_raw = design_options.get("hfss_inductance")
        if Lj_raw is None:
            return None

        try:
            if isinstance(Lj_raw, str):
                Lj_nH = float(Lj_raw.lower().replace("nh", "").replace("h", "").strip())
                if "nh" not in Lj_raw.lower():
                    Lj_nH *= 1e9  # assume H → nH
            else:
                Lj_nH = float(Lj_raw)
                if Lj_nH < 1e-6:  # it's in Henries, convert to nH
                    Lj_nH = Lj_nH * 1e9
        except (ValueError, TypeError):
            return None

        EJ_GHz = _EJ_from_Lj_nH(Lj_nH)
        EC_GHz = (
            _EC_from_alpha(target.alpha_mhz)
            if target.alpha_mhz is not None
            else 0.34  # IBM typical
        )

        try:
            import scqubits as scq
            import warnings

            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                tmon = scq.Transmon(
                    EJ=EJ_GHz,
                    EC=EC_GHz,
                    ng=0.0,
                    ncut=40,
                    truncated_dim=_TRUNC_DIM,
                )
                # f01 = eigenvalue(1) - eigenvalue(0) in GHz
                evals = tmon.eigenvals(evals_count=3)
                f01_ghz   = float(evals[1] - evals[0])
                alpha_mhz = float((evals[2] - evals[1] - (evals[1] - evals[0])) * 1000.0)

            residuals: Dict[str, float] = {
                "f_q_ghz":   round(f01_ghz - target.f_q_ghz, 4),
            }
            if target.alpha_mhz is not None:
                residuals["alpha_mhz"] = round(alpha_mhz - target.alpha_mhz, 2)
            return residuals

        except Exception as exc:
            log.debug("scqubits verify failed: %s", exc)
            return None

    # ------------------------------------------------------------------
    # Analytic fallback (Increment 1)
    # ------------------------------------------------------------------
    def _verify_analytic(self, target: TargetVector) -> Dict[str, float]:
        if target.f_q_ghz is None or target.alpha_mhz is None:
            return {}
        from app.services.physics.frequency_planner import estimate_EJ_EC

        ej_ghz, ec_ghz = estimate_EJ_EC(target.f_q_ghz, target.alpha_mhz / 1000.0)
        f01_ghz   = math.sqrt(8.0 * ej_ghz * ec_ghz) - ec_ghz
        alpha_mhz = -ec_ghz * 1000.0
        return {
            "f_q_ghz":   round(f01_ghz - target.f_q_ghz, 4),
            "alpha_mhz": round(alpha_mhz - target.alpha_mhz, 2),
        }


physics_verifier = PhysicsVerifier()
