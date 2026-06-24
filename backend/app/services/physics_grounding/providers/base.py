"""
base.py — GeometryProvider contract for the Physics-Grounding provider chain.

A provider maps a logical *role* (qubit / resonator / coupler / ...) + a chosen
catalog *family* (componentId) + a ``TargetVector`` to a ``GroundedGeometry``
(Qiskit Metal ``design_options`` + provenance).

The ``GeometryOracle`` tries providers in priority order:
    SQuADDS  ->  (ML, V2)  ->  analytic  ->  catalog default (final)
"""
from __future__ import annotations

import abc
from typing import Optional

from app.services.physics_grounding.targets import GroundedGeometry, TargetVector


class ProviderUnavailable(RuntimeError):
    """Raised when a provider cannot service a request (missing deps/data)."""


class GeometryProvider(abc.ABC):
    """Abstract base for all geometry providers."""

    #: short identifier, also used as the ``GroundedGeometry.source`` value
    name: str = "base"

    def available(self) -> bool:
        """Cheap check; if False the oracle skips this provider."""
        return True

    @abc.abstractmethod
    def resolve(
        self,
        role: str,
        family: str,
        target: TargetVector,
    ) -> Optional[GroundedGeometry]:
        """Return grounded geometry, ``None`` to defer, or raise ProviderUnavailable."""
        raise NotImplementedError
