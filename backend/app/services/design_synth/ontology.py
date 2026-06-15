"""
ontology.py — Logical role -> catalog componentId ontology.

Maps the design-graph's logical roles (qubit / coupler / resonator / route /
launchpad / feedline) to ranked candidate Qiskit Metal componentIds drawn from
``component_catalog.json``. The first *available* candidate is the default.

Per the approved plan, the **grounded qubit default is ``TransmonCross`` + claw**
(SQuADDS-covered; claw = the ``connection_pads.readout`` geometry). ``TransmonPocket``
is retained as a supported legacy/manual component lower in the ranking.

Also exposes the *claw mapping helper* that turns analytic / SQuADDS geometry
numbers into a Qiskit-Metal ``design_options`` dict for a TransmonCross.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

# Logical roles used by the design graph / grounding layer.
QUBIT_ROLE     = "qubit"
COUPLER_ROLE   = "coupler"
RESONATOR_ROLE = "resonator"
ROUTE_ROLE     = "route"
LAUNCHPAD_ROLE = "launchpad"
FEEDLINE_ROLE  = "feedline"

# Ranked candidate componentIds per role (preferred first). Filtered against the
# live catalog at lookup time so only parts that actually exist are returned.
_RANKINGS: Dict[str, List[str]] = {
    QUBIT_ROLE:     ["TransmonCross", "TransmonPocket", "TransmonCrossFL",
                     "TransmonPocket6", "TransmonConcentric"],
    COUPLER_ROLE:   ["CoupledLineTee", "LineTee", "CapNInterdigitalTee"],
    RESONATOR_ROLE: ["ResonatorCoilRect", "ReadoutResFC", "ResonatorLumped"],
    ROUTE_ROLE:     ["RouteMeander", "RouteStraight", "RoutePathfinder",
                     "RouteAnchors", "RouteFramed", "RouteMixed"],
    LAUNCHPAD_ROLE: ["LaunchpadWirebond", "LaunchpadWirebondCoupled",
                     "LaunchpadWirebondDriven"],
    FEEDLINE_ROLE:  ["RouteMeander", "RouteStraight"],
}

#: Catalog families that the physics-grounding stack can actively ground
#: (SQuADDS-covered). Currently the qubit-claw TransmonCross family.
GROUNDED_FAMILIES = frozenset({"TransmonCross"})

# Module-level cache of resolved (catalog-filtered) rankings.
_resolved_cache: Optional[Dict[str, List[str]]] = None


def _catalog_has(component_id: str) -> bool:
    from app.services.component_registry import component_registry_service
    return component_registry_service.get_catalog_item(component_id) is not None


def _resolved() -> Dict[str, List[str]]:
    global _resolved_cache
    if _resolved_cache is None:
        _resolved_cache = {
            role: [cid for cid in ids if _catalog_has(cid)]
            for role, ids in _RANKINGS.items()
        }
    return _resolved_cache


def invalidate() -> None:
    """Drop the resolved-ranking cache (e.g. after a catalog reload)."""
    global _resolved_cache
    _resolved_cache = None


def candidates(role: str) -> List[str]:
    """Ranked, catalog-validated candidate componentIds for a role."""
    return list(_resolved().get(role, []))


def grounded_default(role: str) -> Optional[str]:
    """The primary (first available) componentId for a role, or None."""
    ranked = candidates(role)
    return ranked[0] if ranked else None


def is_grounded_family(component_id: str) -> bool:
    """True if physics-grounding can produce geometry for this family."""
    return component_id in GROUNDED_FAMILIES


# ── Geometry helpers ─────────────────────────────────────────────────────────

def _round_um(v: float) -> str:
    r = round(float(v), 3)
    return f"{int(r) if r == int(r) else r}um"


def default_design_options(family: str) -> Dict[str, Any]:
    """Catalog ``default_options`` for a family, minus internal/template keys."""
    from app.services.component_registry import component_registry_service
    item = component_registry_service.get_catalog_item(family) or {}
    defaults = item.get("default_options", {}) or {}
    return {k: v for k, v in defaults.items() if not str(k).startswith("_")}


def _connection_pads_from_template(
    template: Dict[str, Any],
    *,
    claw_length_um: Optional[float] = None,
    ground_spacing_um: Optional[float] = None,
) -> Dict[str, Any]:
    """Build a ``connection_pads`` dict from a ``_default_connection_pads`` template.

    Mirrors the convention in ``pin_service._make_default_connection_pads`` and
    applies optional claw overrides (used by SQuADDS/analytic geometry).
    """
    if not template:
        return {}
    base = dict(template)
    if claw_length_um is not None:
        base["claw_length"] = _round_um(claw_length_um)
    if ground_spacing_um is not None:
        base["ground_spacing"] = _round_um(ground_spacing_um)
    if "connector_location" in base:
        base.pop("connector_location", None)
        return {
            "readout": {**base, "connector_location": "0"},
            "bus_01":  {**base, "connector_location": "180"},
            "bus_02":  {**base, "connector_location": "90"},
        }
    return {"readout": dict(base)}


def qubit_design_options(
    family: str,
    *,
    cross_length_um: Optional[float] = None,
    claw_length_um: Optional[float] = None,
    ground_spacing_um: Optional[float] = None,
) -> Dict[str, Any]:
    """Claw mapping helper: assemble TransmonCross-style ``design_options``.

    Starts from the catalog defaults, applies any supplied geometry numbers
    (e.g. from SQuADDS ``transmon_cross_hamiltonian_inverse`` outputs:
    ``cross_length`` / ``claw_length`` / ``ground_spacing``), and attaches the
    claw via ``connection_pads``.
    """
    from app.services.component_registry import component_registry_service
    item = component_registry_service.get_catalog_item(family) or {}
    defaults = item.get("default_options", {}) or {}

    opts: Dict[str, Any] = {k: v for k, v in defaults.items() if not str(k).startswith("_")}
    if cross_length_um is not None and "cross_length" in defaults:
        opts["cross_length"] = _round_um(cross_length_um)

    template = defaults.get("_default_connection_pads", {})
    cpads = _connection_pads_from_template(
        template,
        claw_length_um=claw_length_um,
        ground_spacing_um=ground_spacing_um,
    )
    if cpads:
        opts["connection_pads"] = cpads
    return opts
