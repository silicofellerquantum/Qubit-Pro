"""Qiskit Metal pin extraction."""
from __future__ import annotations

import logging
import math

from app.core.registry_cache import registry_cache
from app.core.editor_models import ComponentPins, PinHint, PinSpec

log = logging.getLogger(__name__)


def _make_default_connection_pads(cls: type) -> dict:
    """Build default connection_pads by walking MRO to find _default_connection_pads."""
    base = None
    for klass in cls.__mro__:
        default_opts = getattr(klass, "default_options", {})
        if "_default_connection_pads" in default_opts:
            base = dict(default_opts["_default_connection_pads"])
            break
    if base is None:
        return {}
    if "connector_location" in base:
        base.pop("connector_location", None)
        return {
            "readout": {**base, "connector_location": "0"},
            "bus_01":  {**base, "connector_location": "180"},
            "bus_02":  {**base, "connector_location": "90"},
        }
    if "loc_W" in base and "loc_H" in base:
        return {
            "a": {**base, "loc_W": "+1", "loc_H": "+1"},
            "b": {**base, "loc_W": "-1", "loc_H": "+1"},
            "c": {**base, "loc_W": "+1", "loc_H": "-1"},
            "d": {**base, "loc_W": "-1", "loc_H": "-1"},
        }
    return {name: dict(base) for name in ("a", "b", "c", "d")}


class PinService:
    @staticmethod
    def _cache_key(component_id: str) -> str:
        return f"pins:{component_id}"

    def extract_pins(self, component_id: str) -> ComponentPins:
        from app.services.component_registry import component_registry_service
        item = component_registry_service.get_catalog_item(component_id)
        if item is None:
            log.warning("Pins requested for unknown component %s. Returning empty pins.", component_id)
            return ComponentPins(id=component_id, pins=[])
        
        pins_list = []
        try:
            for p in item.get("pins", []):
                pins_list.append(PinSpec(**p))
        except Exception as exc:
            log.warning("Pin parsing failed for %s: %s", component_id, exc)
            
        return ComponentPins(id=component_id, pins=pins_list)

    def get_pins(self, component_id: str) -> ComponentPins:
        # Always read fresh from catalog — pins are fast and must reflect
        # the latest catalog state without requiring a cache flush.
        return self.extract_pins(component_id)


pin_service = PinService()

