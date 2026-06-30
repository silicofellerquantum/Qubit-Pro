"""
Floorplanner-facing template registry adapter.

The template core in ``base.py`` returns template objects that produce
``Site`` models centered at the origin. The floorplanner needs a compact
result with coordinates translated into chip space, so this module provides
that compatibility layer.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Tuple

from app.layout.templates.base import TEMPLATE_REGISTRY, select_template


@dataclass(frozen=True, slots=True)
class TemplateResult:
    """Resolved template sites translated into chip coordinates."""

    name: str
    sites: List[Tuple[float, float, int]]
    metadata: Dict[str, Any] = field(default_factory=dict)


def _ensure_builtin_templates() -> None:
    """Ensure built-in templates are available even if tests cleared registry."""
    if {"square", "ring", "heavyhex", "vio"}.issubset(TEMPLATE_REGISTRY):
        return

    from app.layout.templates.heavyhex import HeavyHexTemplate
    from app.layout.templates.ring import RingTemplate
    from app.layout.templates.square import SquareLatticeTemplate
    from app.layout.templates.vio import QuantwareVIOTemplate

    TEMPLATE_REGISTRY.setdefault("square", SquareLatticeTemplate)
    TEMPLATE_REGISTRY.setdefault("ring", RingTemplate)
    TEMPLATE_REGISTRY.setdefault("heavyhex", HeavyHexTemplate)
    TEMPLATE_REGISTRY.setdefault("vio", QuantwareVIOTemplate)


def get_template(
    topology: str,
    n: int,
    pitch_mm: float,
    center_x_mm: float,
    center_y_mm: float,
    keywords: List[str] | None = None,
    io_budget: int = 0,
) -> TemplateResult | None:
    """
    Select and materialize a template for the floorplanner.

    Returns:
        ``TemplateResult`` with ``sites`` as ``(x_mm, y_mm, orientation_deg)``
        tuples, or ``None`` if no template can be selected.
    """
    _ensure_builtin_templates()

    try:
        template = select_template(topology, n, keywords, io_budget)
    except ValueError:
        return None

    raw_sites = template.sites(n, pitch_mm)
    translated_sites: List[Tuple[float, float, int]] = []
    for site in raw_sites:
        angle = float(site.metadata.get("angle_deg", 0.0))
        if template.name == "ring":
            orientation = int(round((90.0 - angle) % 360))
        else:
            orientation = int(site.metadata.get("orientation_deg", 0))

        translated_sites.append(
            (
                center_x_mm + site.x_mm,
                center_y_mm + site.y_mm,
                orientation,
            )
        )

    xs = [site.x_mm for site in raw_sites]
    ys = [site.y_mm for site in raw_sites]
    return TemplateResult(
        name=template.name,
        sites=translated_sites,
        metadata={
            "topology": topology,
            "pitch_mm": pitch_mm,
            "center_x_mm": center_x_mm,
            "center_y_mm": center_y_mm,
            "span_x_mm": max(xs, default=0.0) - min(xs, default=0.0),
            "span_y_mm": max(ys, default=0.0) - min(ys, default=0.0),
        },
    )
