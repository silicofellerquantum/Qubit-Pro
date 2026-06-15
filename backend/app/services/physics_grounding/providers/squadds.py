"""
squadds.py — SQuADDS geometry provider (STUB for Increment 1).

In Increment 2 this wraps the embedded SQuADDS library against a locally mirrored
dataset (the source of truth, refreshed periodically — no remote calls during
generation): ``find_closest_designs`` + ``interpolate_design`` to map a target
Hamiltonian vector to validated Qiskit Metal ``design_options``.

For Increment 1 the provider reports itself unavailable so the oracle falls
through to the analytic provider. Wiring (config flag + dataset dir) is in place
so enabling it later is a drop-in.
"""
from __future__ import annotations

from typing import Optional

from app.services.physics_grounding.providers.base import GeometryProvider, ProviderUnavailable
from app.services.physics_grounding.targets import GroundedGeometry, TargetVector


class SquaddsProvider(GeometryProvider):
    name = "squadds"

    def available(self) -> bool:
        # Increment 2 will gate on: settings.physics_grounding_enabled,
        # a populated settings.squadds_dataset_dir, and an importable `squadds`.
        return False

    def resolve(
        self,
        role: str,
        family: str,
        target: TargetVector,
    ) -> Optional[GroundedGeometry]:
        raise ProviderUnavailable("SQuADDS provider not available until Increment 2")
