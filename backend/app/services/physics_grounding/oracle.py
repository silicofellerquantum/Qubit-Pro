"""
oracle.py — GeometryOracle: the node-level provider chain.

Resolves a (role, family, target) into a ``GroundedGeometry`` by trying
providers in priority order and falling back to the raw catalog defaults so a
result is *always* produced:

    SQuADDS  ->  (ML, V2)  ->  analytic  ->  catalog default (final)
"""
from __future__ import annotations

import logging
from typing import List, Optional

from app.services.physics_grounding.providers import (
    AnalyticProvider,
    GeometryProvider,
    ProviderUnavailable,
    SquaddsProvider,
)
from app.services.physics_grounding.targets import GroundedGeometry, TargetVector

log = logging.getLogger(__name__)


def default_providers() -> List[GeometryProvider]:
    """Provider chain in priority order (highest trust first)."""
    return [SquaddsProvider(), AnalyticProvider()]


class GeometryOracle:
    def __init__(self, providers: Optional[List[GeometryProvider]] = None) -> None:
        self._providers = providers if providers is not None else default_providers()

    def resolve(self, role: str, family: str, target: TargetVector) -> GroundedGeometry:
        for provider in self._providers:
            try:
                if not provider.available():
                    continue
                geometry = provider.resolve(role, family, target)
                if geometry is not None:
                    return geometry
            except ProviderUnavailable:
                continue
            except Exception as exc:  # pragma: no cover - defensive
                log.warning("Geometry provider %s failed for %s/%s: %s",
                            getattr(provider, "name", "?"), role, family, exc)
                continue
        return self._catalog_fallback(family)

    @staticmethod
    def _catalog_fallback(family: str) -> GroundedGeometry:
        from app.services.design_synth import ontology
        return GroundedGeometry(
            design_options=ontology.default_design_options(family),
            source="catalog",
            confidence=0.0,
        )
