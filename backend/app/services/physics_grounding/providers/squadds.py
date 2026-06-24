"""
squadds.py — SQuADDS geometry provider (Increment 2).

Wraps ``SquaddsClient`` against a locally mirrored dataset (no remote calls
during generation).  Enabled when:
  - ``settings.physics_grounding_enabled`` is True  (always-on by design)
  - The local mirror directory contains the dataset file

Falls through to ``AnalyticProvider`` if the mirror is absent.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

from app.services.physics_grounding.providers.base import GeometryProvider, ProviderUnavailable
from app.services.physics_grounding.targets import GroundedGeometry, TargetVector

log = logging.getLogger(__name__)

# Roles that SQuADDS currently covers (TransmonCross qubit geometry).
_SUPPORTED_FAMILIES = frozenset({"TransmonCross", "TransmonCrossFL"})


class SquaddsProvider(GeometryProvider):
    name = "squadds"

    def available(self) -> bool:
        """True when the local mirror dataset file is present."""
        try:
            from app.services.physics_grounding.squadds_client import (
                get_squadds_client,
            )
            return get_squadds_client().mirror_exists()
        except Exception:
            return False

    def resolve(
        self,
        role: str,
        family: str,
        target: TargetVector,
    ) -> Optional[GroundedGeometry]:
        if family not in _SUPPORTED_FAMILIES:
            return None  # let oracle try next provider

        try:
            from app.services.physics_grounding.squadds_client import (
                get_squadds_client,
            )
            client = get_squadds_client()
            design_opts, confidence = client.find_transmon_cross(
                f_q_ghz=target.f_q_ghz,
                alpha_mhz=target.alpha_mhz,
            )
            return GroundedGeometry(
                design_options=design_opts,
                source="squadds",
                confidence=confidence,
            )
        except FileNotFoundError as exc:
            raise ProviderUnavailable(str(exc)) from exc
        except Exception as exc:
            log.warning("SquaddsProvider.resolve failed for %s/%s: %s", role, family, exc)
            raise ProviderUnavailable(str(exc)) from exc
