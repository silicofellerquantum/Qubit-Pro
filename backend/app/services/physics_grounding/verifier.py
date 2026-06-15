"""
verifier.py — PhysicsVerifier (forward check).

Increment 1 uses the analytic transmon closed forms (scqubits-style):
given target frequency + anharmonicity it derives EJ/EC (via the frequency
planner) and recomputes f01/anharmonicity, reporting residuals vs the targets:

    f01   ≈ sqrt(8·EJ·EC) − EC
    alpha ≈ −EC

Increment 2 swaps this for the full scqubits engine in ``physics_analysis`` and
verifies the *geometry-derived* EJ/EC (via SQuADDS/Palace) rather than the
target round-trip.
"""
from __future__ import annotations

import math
from typing import Dict

from app.services.physics_grounding.targets import TargetVector


class PhysicsVerifier:
    def verify(self, target: TargetVector) -> Dict[str, float]:
        """Return residuals {param: predicted - target}. Empty if not checkable."""
        from app.services.physics.frequency_planner import estimate_EJ_EC

        residuals: Dict[str, float] = {}
        if target.f_q_ghz is None or target.alpha_mhz is None:
            return residuals

        ej_ghz, ec_ghz = estimate_EJ_EC(target.f_q_ghz, target.alpha_mhz / 1000.0)
        f01_ghz   = math.sqrt(8.0 * ej_ghz * ec_ghz) - ec_ghz
        alpha_mhz = -ec_ghz * 1000.0
        residuals["f_q_ghz"]   = round(f01_ghz - target.f_q_ghz, 4)
        residuals["alpha_mhz"] = round(alpha_mhz - target.alpha_mhz, 2)
        return residuals


physics_verifier = PhysicsVerifier()
