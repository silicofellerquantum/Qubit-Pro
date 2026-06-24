"""
pin_allocator.py — Deterministic pin-name resolution for the SchematicCompiler.

Given a ``DesignEdge`` (source_id, target_id, EdgeKind, pin_source, pin_target)
and the catalog pins of each endpoint, this module resolves the **exact**
pin names the editor ``Connection`` must reference.

Rules (applied in order, first match wins):
1. If the edge already carries explicit pin_source / pin_target, use them after
   validating they exist on the catalog component.  If a name is missing from the
   catalog, fall through to rule 2.
2. Apply per-edge-kind heuristics that mirror the established catalog naming:
       READOUT   qubit_pin="readout"        resonator_pin="in"
       COUPLING  qubit→coupler  pin="bus_01"/"bus_02" (round-robin), coupler="in"/"out"
       FEEDLINE  resonator_pin="out"        feedline/route_pin="in"
       IO        feedline_pin="end"/"start" launchpad_pin="tie"
3. If no heuristic matches, fall back to the first available pin on each side.
"""
from __future__ import annotations

from typing import Dict, List, Optional, Tuple


# Pre-assigned pin aliases per component family (cheaper than catalog look-up
# for the most common case; catalog look-up is the authoritative fallback).
# Pin names verified against live Qiskit Metal catalog (pin_service).
_FAMILY_PINS: Dict[str, List[str]] = {
    # Qubits
    "TransmonCross":               ["readout", "bus_01", "bus_02"],
    "TransmonPocket":              ["readout", "bus_0", "bus_1"],
    "TransmonPocket6":             ["readout", "bus_0", "bus_1", "bus_2", "bus_3"],
    "TransmonCrossFL":             ["readout", "bus_01", "bus_02"],
    # Resonators — ResonatorCoilRect exposes a single 'spiralPin'
    "ResonatorCoilRect":           ["spiralPin"],
    "ReadoutResFC":                ["readout"],
    "ResonatorLumped":             ["pin_east", "pin_ne", "pin_se", "pin_nw",
                                    "pin_west", "pin_sw", "pin_s", "pin_n"],
    # Tee couplers — actual Qiskit Metal pin names
    "CoupledLineTee":              ["prime_start", "prime_end", "second_end"],
    "LineTee":                     ["prime_start", "prime_end", "second_end"],
    "CapNInterdigitalTee":         ["prime_start", "prime_end", "second_end"],
    # Launchpads
    "LaunchpadWirebond":           ["tie"],
    "LaunchpadWirebondCoupled":    ["tie"],
    "LaunchpadWirebondDriven":     ["tie"],
    # Routes (pin_inputs drives routing, not connection_pads)
    "RouteMeander":                [],
    "RouteStraight":               [],
    "RoutePathfinder":             [],
}


def _catalog_pin_names(component_id: Optional[str]) -> List[str]:
    """Return pin names from the component registry catalog (cached)."""
    if not component_id:
        return []
    try:
        from app.services.pin_service import pin_service
        cp = pin_service.get_pins(component_id)
        return [p.name for p in cp.pins]
    except Exception:
        return _FAMILY_PINS.get(component_id, [])


def _pin_names(component_id: Optional[str]) -> List[str]:
    """Fast path: family table first, catalog fallback."""
    if component_id and component_id in _FAMILY_PINS:
        return list(_FAMILY_PINS[component_id])
    return _catalog_pin_names(component_id)


def _validate(pin: str, pins: List[str]) -> Optional[str]:
    """Return pin if it exists in pins list, else None."""
    return pin if pin in pins else None


# ── Heuristic tables per EdgeKind ────────────────────────────────────────────

# Source-side pin selector: given edge kind + source's pins, return best pin.
def _source_pin(kind: str, src_pins: List[str], used: List[str]) -> str:
    if kind == "readout":
        # qubit → resonator: qubit exposes 'readout'
        return _first(src_pins, ["readout"])
    if kind == "coupling":
        # qubit → coupler: bus_01/02 (TransmonCross), bus_0/1 (TransmonPocket)
        # coupler → qubit: prime_end or second_end (Tee couplers)
        candidates = ["bus_01", "bus_02", "bus_0", "bus_1",
                      "prime_end", "second_end", "prime_start"]
        return _first_unused(src_pins, candidates, used)
    if kind == "feedline":
        # resonator → feedline: use spiralPin or first available
        return _first(src_pins, ["spiralPin", "prime_end", "second_end", "pin_east"])
    if kind == "io":
        return _first(src_pins, ["prime_end", "second_end", "end", "start", "out", "tie"])
    return src_pins[0] if src_pins else "a"


def _target_pin(kind: str, tgt_pins: List[str], used: List[str] = []) -> str:
    if kind == "readout":
        # resonator target: spiralPin is the only pin on ResonatorCoilRect
        return _first(tgt_pins, ["spiralPin", "readout", "in"])
    if kind == "coupling":
        # Could be coupler-target (prime_start) or qubit-target (bus_01/02).
        # Try coupler pins first, then qubit bus pins (unused preferred).
        return _first_unused(tgt_pins,
                             ["prime_start", "bus_01", "bus_02", "bus_0", "bus_1", "in", "a"],
                             used)
    if kind == "feedline":
        # feedline target: prime_start or first available
        return _first(tgt_pins, ["prime_start", "in", "tap"])
    if kind == "io":
        return _first(tgt_pins, ["tie", "prime_start", "start"])
    return tgt_pins[0] if tgt_pins else "b"


def _first(pins: List[str], candidates: List[str]) -> str:
    for c in candidates:
        if c in pins:
            return c
    return pins[0] if pins else "a"


def _first_unused(pins: List[str], candidates: List[str], used: List[str]) -> str:
    for c in candidates:
        if c in pins and c not in used:
            return c
    # All preferred pins used — pick any available
    for c in candidates:
        if c in pins:
            return c
    return pins[0] if pins else "a"


# ── Public API ───────────────────────────────────────────────────────────────

class PinAllocator:
    """Stateful allocator: tracks which pins on each placement are already used."""

    def __init__(self) -> None:
        # placement_id -> set of already-allocated pin names
        self._used: Dict[str, List[str]] = {}

    def _mark(self, placement_id: str, pin: str) -> None:
        self._used.setdefault(placement_id, []).append(pin)

    def _used_for(self, placement_id: str) -> List[str]:
        return self._used.get(placement_id, [])

    def allocate(
        self,
        kind: str,
        src_id: str,
        src_component: Optional[str],
        src_hint: str,
        tgt_id: str,
        tgt_component: Optional[str],
        tgt_hint: str,
    ) -> Tuple[str, str]:
        """Return (source_pin, target_pin) for one directed edge.

        ``src_hint`` / ``tgt_hint`` are the pin names already on the edge (may
        be empty).  Catalog+heuristic logic is applied when hints are missing or
        invalid.
        """
        src_pins = _pin_names(src_component) or ["a"]
        tgt_pins = _pin_names(tgt_component) or ["b"]

        # Validate explicit hints first.
        sp = _validate(src_hint, src_pins) if src_hint else None
        tp = _validate(tgt_hint, tgt_pins) if tgt_hint else None

        if sp is None:
            sp = _source_pin(kind, src_pins, self._used_for(src_id))
        if tp is None:
            tp = _target_pin(kind, tgt_pins, self._used_for(tgt_id))

        self._mark(src_id, sp)
        self._mark(tgt_id, tp)
        return sp, tp
