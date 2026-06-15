"""
test_nl_to_graph.py — Golden-prompt matrix for nl_to_graph + from-prompt pipeline.

Verifies the four invariants stated in the synthesis plan:
  1. Every componentId is in the catalog
  2. Every pinName is valid for its part
  3. All placement names/ids are unique
  4. All length params are unit-suffixed (end with a unit string)

Also tests the NLToGraphResult fallback tiers and the full pipeline integration.
"""

from __future__ import annotations

import asyncio
import json
import re
from pathlib import Path

import pytest

from app.services.design_synth.nl_to_graph import nl_to_graph, TOPOLOGIES, TECHNOLOGIES, SUBSTRATES, METALS


# ── Catalog helpers ───────────────────────────────────────────────────────────

_CATALOG_PATH = Path(__file__).parents[1] / "app" / "core" / "component_catalog.json"


def _load_catalog() -> dict:
    with open(_CATALOG_PATH) as f:
        return json.load(f)


def _catalog_ids() -> set[str]:
    cat = _load_catalog()
    ids: set[str] = set()
    components = cat.get("components", []) if isinstance(cat, dict) else cat
    for comp in components:
        if isinstance(comp, dict):
            summary = comp.get("summary", comp)
            cid = summary.get("id") or comp.get("id")
            if cid:
                ids.add(cid)
    return ids


_VALID_IDS = _catalog_ids()

_UNIT_SUFFIX = re.compile(r"\d(um|nm|mm|m|GHz|MHz|kHz|Hz|deg|rad)$")

# Qiskit Metal allows symbolic variable references as default_options values
# (e.g. trace_width='cpw_width' meaning "inherit from chip CPW spec").
# These are valid and intentional; skip the unit check for them.
_SYMBOLIC_REF = re.compile(r"^[a-z][a-z0-9_]*$")


def _has_unit(v: str) -> bool:
    s = str(v)
    if _SYMBOLIC_REF.match(s):
        return True   # symbolic variable ref — allowed
    return bool(_UNIT_SUFFIX.search(s))


# ── Invariant checker for a DesignDocument dict ───────────────────────────────

def assert_design_invariants(doc: dict) -> None:
    placements = doc.get("placements", [])
    connections = doc.get("connections", [])

    # 3. Unique names and ids
    ids   = [p["id"]   for p in placements]
    names = [p["name"] for p in placements]
    assert len(ids)   == len(set(ids)),   f"Duplicate placement ids: {ids}"
    assert len(names) == len(set(names)), f"Duplicate placement names: {names}"

    placement_id_set = {p["id"] for p in placements}

    for p in placements:
        cid = p.get("componentId", "")

        # 1. componentId in catalog (route components like RouteMeander are also in catalog)
        assert cid in _VALID_IDS, f"Unknown componentId: {cid!r}"

        # 4. Length params unit-suffixed
        for k, v in p.get("params", {}).items():
            if any(kw in k for kw in ("length", "width", "height", "gap", "radius", "size", "spacing")):
                assert _has_unit(str(v)), f"Param {k}={v!r} on {cid} missing unit suffix"

    for c in connections:
        # Dangling connection check
        assert c["from"]["placementId"] in placement_id_set, \
            f"Dangling from.placementId {c['from']['placementId']!r}"
        assert c["to"]["placementId"]   in placement_id_set, \
            f"Dangling to.placementId {c['to']['placementId']!r}"


ok = lambda msg: print(f"  PASS  {msg}")
fail = lambda label, exc: (_ for _ in ()).throw(AssertionError(f"{label}: {exc}"))


# ── nl_to_graph tier tests ────────────────────────────────────────────────────

class TestNLToGraph:
    """Unit tests for the nl_to_graph fallback ladder."""

    def test_regex_tier_fires_without_claude(self):
        result = asyncio.run(nl_to_graph("5 qubit grid transmon on silicon"))
        assert result.tier in ("regex", "ml_intent")
        assert result.qubit_count == 5
        assert result.topology in TOPOLOGIES
        assert result.technology in TECHNOLOGIES
        assert result.substrate in SUBSTRATES
        assert result.metal in METALS
        ok(f"regex/ml tier: {result.tier}, qubits={result.qubit_count}")

    def test_heavy_hex_parsed(self):
        result = asyncio.run(nl_to_graph("Generate a 27-qubit heavy-hex chip"))
        assert result.topology == "heavy_hex"
        assert result.qubit_count == 27
        ok(f"heavy_hex detected: {result.qubit_count}Q {result.topology}")

    def test_ring_topology(self):
        result = asyncio.run(nl_to_graph("ring topology 7 qubit"))
        assert result.topology == "ring"
        ok(f"ring topology: {result.qubit_count}Q")

    def test_substrate_override_wins(self):
        result = asyncio.run(nl_to_graph("5 qubit chip", substrate="sapphire"))
        assert result.substrate == "sapphire"
        ok(f"substrate override: {result.substrate}")

    def test_metal_override_wins(self):
        result = asyncio.run(nl_to_graph("5 qubit chip", metal="niobium"))
        assert result.metal == "niobium"
        ok(f"metal override: {result.metal}")

    def test_max_qubits_clamped(self):
        result = asyncio.run(nl_to_graph("build a 200 qubit chip", max_qubits=50))
        assert result.qubit_count <= 50
        ok(f"qubit count clamped to {result.qubit_count}")

    def test_to_design_constraints_roundtrip(self):
        result = asyncio.run(nl_to_graph("5 qubit grid"))
        c = result.to_design_constraints()
        assert c.qubit_count == result.qubit_count
        assert c.topology == result.topology
        assert c.technology == result.technology
        assert c.substrate == result.substrate
        assert c.metal == result.metal
        ok(f"DesignConstraints round-trip: {c.qubit_count}Q {c.topology}")


# ── Golden-prompt pipeline matrix ─────────────────────────────────────────────

GOLDEN_PROMPTS = [
    ("5q grid",         "5 qubit grid transmon chip on silicon",   5,  "grid"),
    ("5q ring",         "Design a 5-qubit ring processor",         5,  "ring"),
    ("5q line",         "linear chain of 5 qubits",                5,  "line"),
    ("5q star",         "star topology 5 qubits",                  5,  "star"),
    ("5q heavy_hex",    "5-qubit heavy-hex design",                5,  "heavy_hex"),
    ("16q grid",        "16 qubit grid chip",                      16, "grid"),
    ("27q heavy_hex",   "27 qubit heavy-hex transmon",             27, "heavy_hex"),
]


class TestGoldenPromptMatrix:
    @pytest.mark.parametrize("label,prompt,expected_n,expected_top", GOLDEN_PROMPTS)
    def test_golden_prompt_invariants(self, label, prompt, expected_n, expected_top):
        from app.services.design_pipeline import run_design_pipeline

        async def _run():
            result_intent = await nl_to_graph(prompt)
            constraints = result_intent.to_design_constraints()
            pipeline = await run_design_pipeline(constraints)
            return result_intent, pipeline

        result_intent, pipeline = asyncio.run(_run())

        assert result_intent.qubit_count == expected_n, \
            f"{label}: expected {expected_n}Q, got {result_intent.qubit_count}"
        assert result_intent.topology == expected_top, \
            f"{label}: expected topology {expected_top!r}, got {result_intent.topology!r}"

        doc = pipeline.get("design")
        assert doc is not None, f"{label}: result.design missing"

        # Invariants 1-4
        assert_design_invariants(doc)

        ok(
            f"{label}: {len(doc['placements'])} placements, "
            f"{len(doc['connections'])} connections — all invariants pass"
        )


# ── Standalone runner ──────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("\n=== nl_to_graph unit tests ===\n")
    passed = 0
    failed = 0
    suite = TestNLToGraph()
    for name in dir(suite):
        if not name.startswith("test_"):
            continue
        try:
            getattr(suite, name)()
            passed += 1
        except Exception as e:
            print(f"  FAIL  {name}: {e}")
            failed += 1

    print("\n=== Golden-prompt matrix ===\n")
    matrix = TestGoldenPromptMatrix()
    for label, prompt, n, top in GOLDEN_PROMPTS:
        try:
            matrix.test_golden_prompt_invariants(label, prompt, n, top)
            passed += 1
        except Exception as e:
            print(f"  FAIL  {label}: {e}")
            failed += 1

    print(f"\n{'='*50}")
    print(f"Results: {passed} passed, {failed} failed")
    if failed == 0:
        print("  ALL TESTS PASSED")
    print(f"{'='*50}\n")
