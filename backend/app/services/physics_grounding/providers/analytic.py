"""
analytic.py — Analytic geometry provider (Increment 1 default).

Produces deterministic ``design_options`` from the catalog defaults + the
ontology claw helper. It is always available and behavior-preserving: it does
not invent a geometry inverse, it grounds each role in validated catalog
defaults. SQuADDS (Increment 2) and ML (V2) sit *above* this in the chain and
override it with retrieved/predicted geometry when available.
"""
from __future__ import annotations

from typing import Optional

from app.services.physics_grounding.providers.base import GeometryProvider
from app.services.physics_grounding.targets import GroundedGeometry, TargetVector


class AnalyticProvider(GeometryProvider):
    name = "analytic"

    def available(self) -> bool:
        return True

    def resolve(
        self,
        role: str,
        family: str,
        target: TargetVector,
    ) -> Optional[GroundedGeometry]:
        from app.services.design_synth import ontology

        if role == ontology.QUBIT_ROLE and ontology.is_grounded_family(family):
            # Claw-bearing qubit (TransmonCross): assemble cross + claw options.
            opts = ontology.qubit_design_options(family)
        else:
            opts = ontology.default_design_options(family)

        return GroundedGeometry(design_options=opts, source=self.name, confidence=1.0)
