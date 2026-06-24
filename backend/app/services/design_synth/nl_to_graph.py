"""
nl_to_graph.py — NL prompt → DesignIntent → DesignConstraints

Implements the "AI NL → graph" stage from the synthesis plan (Phase 3).

Strategy
--------
1. Claude constrained-JSON output (when API key is present)
   System prompt embeds controlled vocabularies (topologies, technologies,
   substrates, metals) so the model picks from a known enum — never free-forms
   component IDs, pins, or coordinates.

2. Fallback ladder (guarantees offline robustness)
   Claude unavailable → existing ml_intent / parse_prompt regex →
   DesignConstraints defaults.  The deterministic compiler always produces a
   valid DesignDocument regardless of which tier fires.

Output: ``NLToGraphResult`` — a plain dataclass carrying the DesignConstraints
plus provenance metadata so callers can surface the tier that fired and any
structured warnings/issues.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import Any

log = logging.getLogger(__name__)

# ── Controlled vocabularies (embedded in system prompt) ─────────────────────

TOPOLOGIES   = ["grid", "line", "ring", "star", "heavy_hex"]
TECHNOLOGIES = ["transmon", "fluxonium", "xmon"]
SUBSTRATES   = ["silicon", "sapphire", "silicon_nitride"]
METALS       = ["aluminum", "niobium", "tantalum", "nbtin"]

# ── DesignIntent schema (JSON-schema string for Claude tool-call) ────────────

_INTENT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "required": ["qubit_count", "topology", "technology"],
    "properties": {
        "qubit_count": {
            "type": "integer",
            "minimum": 1,
            "maximum": 100,
            "description": "Number of qubits in the chip",
        },
        "topology": {
            "type": "string",
            "enum": TOPOLOGIES,
            "description": "Qubit connectivity graph topology",
        },
        "technology": {
            "type": "string",
            "enum": TECHNOLOGIES,
            "description": "Qubit type / technology",
        },
        "target_freq_ghz": {
            "type": "number",
            "minimum": 3.0,
            "maximum": 8.0,
            "description": "Target qubit operating frequency in GHz",
        },
        "substrate": {
            "type": "string",
            "enum": SUBSTRATES,
        },
        "metal": {
            "type": "string",
            "enum": METALS,
        },
        "scale": {
            "type": "number",
            "minimum": 0.5,
            "maximum": 2.0,
            "description": "Placement scale multiplier (1.0 = default)",
        },
        "notes": {
            "type": "string",
            "description": "Any extra user intent or constraints (free text, ignored by compiler)",
        },
    },
    "additionalProperties": False,
}

_SYSTEM_PROMPT = """You are the Silicofeller Quantum Studio design compiler frontend.

Your ONLY job is to convert a natural-language chip description into a structured
DesignIntent JSON object using the provided tool. Never explain or add commentary —
respond exclusively with the tool call.

Controlled vocabularies (use ONLY these values):
- topology: """ + str(TOPOLOGIES) + """
- technology: """ + str(TECHNOLOGIES) + """
- substrate: """ + str(SUBSTRATES) + """
- metal: """ + str(METALS) + """

Rules:
- qubit_count: minimum 1, maximum 100
- target_freq_ghz: range 3.0–8.0 (default 5.0)
- scale: 0.5–2.0 (use 1.35 for "large/wide", 0.75 for "compact/dense", else 1.0)
- If the user asks for a specific IBM device (Falcon → 27Q heavy_hex, Heron → 133Q grid,
  Eagle → 127Q heavy_hex, Hummingbird → 65Q heavy_hex), use the appropriate qubit_count
  and topology.
- "surface code" → topology=grid, qubit_count=49 unless explicit
- Always prefer the closest valid topology enum.
"""


# ── Result dataclass ─────────────────────────────────────────────────────────

@dataclass
class NLToGraphResult:
    """Structured output of the NL→DesignConstraints conversion."""
    qubit_count:      int
    topology:         str
    technology:       str
    substrate:        str
    metal:            str
    target_freq_ghz:  float
    scale:            float
    notes:            str
    tier:             str   # "claude" | "ml_intent" | "regex"
    confidence:       float | None  # None when deterministic
    issues:           list[str] = field(default_factory=list)

    def to_design_constraints(self):
        """Convert to DesignConstraints for the pipeline."""
        from app.constraints.constraints import DesignConstraints, FreqConstraints
        return DesignConstraints(
            qubit_count  = self.qubit_count,
            technology   = self.technology,
            topology     = self.topology,
            substrate    = self.substrate,
            metal        = self.metal,
            scale        = self.scale,
            freq         = FreqConstraints(target_freq_ghz=self.target_freq_ghz),
            notes        = self.notes,
        )


# ── Tier 1: Claude constrained-JSON ─────────────────────────────────────────

async def _try_claude(prompt: str, max_qubits: int) -> NLToGraphResult | None:
    """
    Ask Claude to emit a DesignIntent tool-call.  Returns None if unavailable
    or if parsing fails (caller falls through to next tier).
    """
    from app.config import settings

    if not (settings.anthropic_api_key and
            settings.anthropic_api_key.startswith("sk-ant-")):
        return None

    try:
        import anthropic
        client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

        tool_def = {
            "name":        "emit_design_intent",
            "description": "Emit the structured DesignIntent for this chip description.",
            "input_schema": _INTENT_SCHEMA,
        }

        response = await client.messages.create(
            model="claude-3-5-haiku-20241022",
            max_tokens=512,
            system=_SYSTEM_PROMPT,
            tools=[tool_def],
            tool_choice={"type": "tool", "name": "emit_design_intent"},
            messages=[{"role": "user", "content": prompt}],
        )

        # Extract tool-use block
        for block in response.content:
            if block.type == "tool_use" and block.name == "emit_design_intent":
                inp: dict[str, Any] = block.input
                n = min(int(inp.get("qubit_count", 5)), max_qubits)
                return NLToGraphResult(
                    qubit_count     = n,
                    topology        = inp.get("topology", "grid"),
                    technology      = inp.get("technology", "transmon"),
                    substrate       = inp.get("substrate", "silicon"),
                    metal           = inp.get("metal", "aluminum"),
                    target_freq_ghz = float(inp.get("target_freq_ghz", 5.0)),
                    scale           = float(inp.get("scale", 1.0)),
                    notes           = inp.get("notes", ""),
                    tier            = "claude",
                    confidence      = None,
                )
    except Exception as exc:
        log.warning("Claude NL→graph failed (%s), falling back", exc)

    return None


# ── Tier 2: existing ML intent ───────────────────────────────────────────────

def _try_ml_intent(prompt: str, max_qubits: int) -> NLToGraphResult | None:
    try:
        from app.services.physics.ml_intent import resolve_design_params
        n, _req, topology, ml_info = resolve_design_params(prompt, max_qubits)
        conf = ml_info.get("confidence")
        return NLToGraphResult(
            qubit_count     = n,
            topology        = topology,
            technology      = "transmon",
            substrate       = "silicon",
            metal           = "aluminum",
            target_freq_ghz = 5.0,
            scale           = 1.0,
            notes           = "",
            tier            = "ml_intent",
            confidence      = float(conf) if conf is not None else None,
        )
    except Exception:
        return None


# ── Tier 3: regex parse_prompt ───────────────────────────────────────────────

def _fallback_regex(prompt: str, max_qubits: int) -> NLToGraphResult:
    from app.services.chip_generator import parse_prompt
    p = parse_prompt(prompt)
    n = min(int(p.get("num_qubits", 5)), max_qubits)
    return NLToGraphResult(
        qubit_count     = n,
        topology        = p.get("topology", "grid"),
        technology      = p.get("qubit_type", "transmon"),
        substrate       = p.get("substrate", "silicon"),
        metal           = p.get("metal", "aluminum"),
        target_freq_ghz = float(p.get("target_freq_ghz", 5.0)),
        scale           = float(p.get("scale", 1.0)),
        notes           = "",
        tier            = "regex",
        confidence      = None,
    )


# ── Public API ───────────────────────────────────────────────────────────────

async def nl_to_graph(
    prompt: str,
    max_qubits: int = 100,
    substrate: str | None = None,
    metal:     str | None = None,
) -> NLToGraphResult:
    """
    Convert a natural-language chip description to a ``NLToGraphResult``.

    Fallback ladder: Claude → ml_intent → regex.
    ``substrate``/``metal`` overrides explicit values from the caller (e.g.
    when the user picks them via a UI selector rather than in the prompt text).
    """
    result = (
        await _try_claude(prompt, max_qubits)
        or _try_ml_intent(prompt, max_qubits)
        or _fallback_regex(prompt, max_qubits)
    )

    # Apply explicit caller overrides
    if substrate and substrate in SUBSTRATES:
        result.substrate = substrate
    if metal and metal in METALS:
        result.metal = metal

    # Clamp qubit_count to platform maximum
    result.qubit_count = min(result.qubit_count, max_qubits)

    return result
