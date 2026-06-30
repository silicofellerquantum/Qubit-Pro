"""Pure string generation for standalone Qiskit Metal designs."""
from __future__ import annotations

import math
import re
from app.core.editor_models import DesignDocument, GeneratedCode, FeedlineModel

# ── Fabrication constants — single source of truth ────────────────────────────
# These MUST match what render_service/worker sends to RouteMeander.
# Changing a value here changes both the live preview AND the exported code.
from app.services.metal_codegen.config import get_settings as _get_settings
_FAB = _get_settings().fabrication
FILLET_UM: str = f"{int(_FAB.fillet_radius_um)}um"   # e.g. "50um"
DEFAULT_LEAD_UM: str = "100um"                         # start_straight / end_straight

# Fallback total_length when resolved options are unavailable.
# Only used on connections that have never been rendered by the worker.
_MEANDER_FACTOR = 1.5

# ── connection_pads defaults per component type ───────────────────────────────
# These mirror Qiskit Metal's _default_connection_pads. We always emit them
# so that pins a/b/c/d exist and routes can connect to them.

_TRANSMON_PAD = {
    "pad_gap":       "15um",
    "pad_width":     "125um",
    "pad_height":    "30um",
    "cpw_width":     "cpw_width",
    "cpw_gap":       "cpw_gap",
}

# Components that use loc_W/loc_H style connection pads
_LOC_WH_COMPONENTS = {
    "TransmonPocket",
    "TransmonPocketCL",
    "TransmonPocket6",
    "TransmonPocketTeeth",
    "TransmonCross",
    "TransmonCrossFL",
    "TransmonConcentric",
    "TransmonConcentricType2",
    "TransmonInterdigitated",
}

# Pin names used by specific components
_COMPONENT_PINS: dict[str, list[str]] = {
    "TunableCoupler01": ["Control", "Flux"],
    "LineTee":          ["prime_start", "prime_end", "second_end"],
    "CoupledLineTee":   ["prime_start", "prime_end", "second_end"],
    "CapNInterdigitalTee": ["prime_start", "prime_end", "second_end"],
    "LaunchpadWirebond": ["tie"],
    "LaunchpadWirebondCoupled": ["tie", "in"],
    "LaunchpadWirebondDriven": ["tie"],
    "OpenToGround":     ["open"],
    "ShortToGround":    ["short"],
}


def _get_valid_param_keys(component_id: str) -> set[str]:
    """
    Return the set of valid option keys for a component by reading its
    default_options. Returns empty set on failure (caller passes all params).

    Filters out stale/UI-only params the editor may have stored
    (e.g. 'readout_radius', 'arc_step', 'subtract', 'layer_subtract').
    Always includes 'pos_x', 'pos_y', 'orientation', 'chip', 'layer'
    since those are universal positioning params.
    """
    _UNIVERSAL = {"pos_x", "pos_y", "orientation", "chip", "layer"}
    try:
        # Custom components first
        if component_id == "ReadoutResFC":
            from app.services.custom_components.readout_res_fc import ReadoutResFC
            return set(ReadoutResFC.default_options.keys()) | _UNIVERSAL

        from app.services.component_registry import component_registry_service
        import importlib, inspect
        from qiskit_metal.qlibrary.core import QComponent as _QC

        summary = component_registry_service.get_component(component_id)
        if summary is None:
            return set()
        mod = importlib.import_module(summary.module)
        for _, cls in inspect.getmembers(mod, inspect.isclass):
            if issubclass(cls, _QC) and cls.__name__ == component_id:
                return set(cls.default_options.keys()) | _UNIVERSAL
    except Exception:
        pass
    return set()


def _build_connection_pads(component_id: str) -> dict | None:
    """
    Return a connection_pads dict for components that need it, or None
    for components that expose pins differently (LaunchpadWirebond, routes, etc.).
    """
    if component_id in _LOC_WH_COMPONENTS:
        base = dict(_TRANSMON_PAD)
        return {
            "a": {**base, "loc_W": "+1", "loc_H": "+1"},
            "b": {**base, "loc_W": "-1", "loc_H": "+1"},
            "c": {**base, "loc_W": "+1", "loc_H": "-1"},
            "d": {**base, "loc_W": "-1", "loc_H": "-1"},
        }
    # All other component types expose pins via their own geometry —
    # no connection_pads dict needed.
    return None


def _sanitize_var(name: str) -> str:
    """Convert an arbitrary string to a valid Python identifier."""
    return re.sub(r"[^a-zA-Z0-9]", "_", name).strip("_") or "comp"


def _resolve_name(placement_id: str, placement_names: dict[str, str]) -> str:
    """
    Return the human-readable placement name for a given placement ID.
    Falls back to stripping timestamp suffixes if not found directly.
    """
    if placement_id in placement_names:
        return placement_names[placement_id]
    stripped = re.sub(r"_\d{10,}(?:_[a-z0-9]+)?$", "", placement_id)
    if stripped in placement_names:
        return placement_names[stripped]
    for pid, pname in placement_names.items():
        if pid.startswith(stripped):
            return pname
    return placement_id


def _compute_total_length(
    from_id: str,
    to_id: str,
    placement_pos: dict[str, tuple[float, float]],
) -> str:
    """
    Fallback total_length for RouteMeander when resolved options are absent.
    Used only on connections that have never been rendered by the Qiskit Metal
    worker (i.e. routeOverrides lacks 'total_length').
    Clamped to [3mm, 30mm].
    """
    p1 = placement_pos.get(from_id)
    p2 = placement_pos.get(to_id)
    if p1 is None or p2 is None:
        return "7mm"
    dist = math.sqrt((p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2)
    if dist < 0.01:
        return "7mm"
    length_mm = round(dist * _MEANDER_FACTOR, 3)
    length_mm = max(3.0, min(30.0, length_mm))
    return f"{length_mm}mm"


class CodegenService:
    """Emit a self-contained Qiskit Metal Python script."""

    def generate(self, design: DesignDocument) -> GeneratedCode:
        from app.services.component_registry import component_registry_service

        imports: set[str] = {"from qiskit_metal import designs, MetalGUI"}
        setup = [
            "design = designs.DesignPlanar()",
            "design.overwrite_enabled = True",
            "",
        ]
        placement_lines: list[str] = []
        route_lines: list[str] = []

        # Map: placement_id → (human name, (x, y))
        placement_names: dict[str, str] = {}
        placement_pos:   dict[str, tuple[float, float]] = {}
        for p in design.placements:
            placement_names[p.id] = p.name
            placement_pos[p.id]   = (p.x, p.y)

        for placement in design.placements:
            summary = component_registry_service.get_component(placement.componentId)
            if summary is None:
                placement_lines.append(
                    f"# WARNING: unknown component {placement.componentId!r} - skipped"
                )
                continue

            class_name = placement.componentId
            imports.add(f"from {summary.module} import {class_name}")

            # ReadoutResFC: use the official qiskit_metal import path.
            # The class lives in qiskit_metal.qlibrary.resonators.readoutres_fc
            # in versions that ship it. Our custom fallback mirrors that API
            # exactly, so generated scripts work on any qiskit-metal install.
            if class_name == "ReadoutResFC":
                imports.discard(f"from {summary.module} import {class_name}")
                imports.add("from qiskit_metal.qlibrary.resonators.readoutres_fc import ReadoutResFC")

            # ── Resolve the valid param keys for this component ───────────────
            # Load from the catalog so we can filter out stale/unknown params
            # the editor may have stored (e.g. old field names, UI-only keys).
            valid_keys = _get_valid_param_keys(placement.componentId)

            # ── Build options dict ────────────────────────────────────────────
            options: dict = {}

            # Carry through user-set params, filtering out:
            #   - connection_pads (always regenerated from defaults)
            #   - keys not in the component's default_options (stale/UI params)
            for key, value in placement.params.items():
                if key == "connection_pads":
                    continue
                # If we know the valid keys, only pass through recognised ones
                if valid_keys and key not in valid_keys:
                    continue
                options[key] = value

            # Position / orientation
            options["pos_x"] = f"{placement.x}mm"
            options["pos_y"] = f"{placement.y}mm"
            if placement.rotation:
                options["orientation"] = f"{float(placement.rotation)}"

            # connection_pads — critical for TransmonPocket-family components
            pads = _build_connection_pads(class_name)
            if pads is not None:
                options["connection_pads"] = pads

            placement_lines.append(
                f"{placement.name} = {class_name}("
                f"design, {placement.name!r}, options={_fmt_opts(options)})"
            )

        # ── Pin conflict validation ───────────────────────────────────────────
        seen_pins: dict[tuple[str, str], str] = {}

        for idx, connection in enumerate(design.connections):
            route_id = connection.routeComponentId or "RouteMeander"
            route_summary = component_registry_service.get_component(route_id)
            if route_summary is None:
                route_lines.append(
                    f"# WARNING: unknown route component {route_id!r} - skipped"
                )
                continue

            imports.add(f"from {route_summary.module} import {route_id}")

            source_name = _resolve_name(connection.from_.placementId, placement_names)
            target_name = _resolve_name(connection.to.placementId, placement_names)

            if source_name == connection.from_.placementId and source_name not in placement_names.values():
                route_lines.append(
                    f"# WARNING: route references unknown placement "
                    f"{connection.from_.placementId!r} — skipped"
                )
                continue
            if target_name == connection.to.placementId and target_name not in placement_names.values():
                route_lines.append(
                    f"# WARNING: route references unknown placement "
                    f"{connection.to.placementId!r} — skipped"
                )
                continue

            src_pin_key = (source_name, connection.from_.pinName)
            tgt_pin_key = (target_name, connection.to.pinName)
            var_name = f"route_conn_p{idx + 1}_"

            # If either pin is already used, skip this route entirely —
            # emitting it would cause a hard Qiskit Metal error at runtime.
            src_conflict = seen_pins.get(src_pin_key)
            tgt_conflict = seen_pins.get(tgt_pin_key)
            if src_conflict or tgt_conflict:
                conflict_pin = (
                    f"{source_name}.{connection.from_.pinName}" if src_conflict
                    else f"{target_name}.{connection.to.pinName}"
                )
                used_by = src_conflict or tgt_conflict
                route_lines.append(
                    f"# SKIPPED {var_name}: pin conflict — "
                    f"{conflict_pin} already used by {used_by}"
                )
                continue

            seen_pins[src_pin_key] = var_name
            seen_pins[tgt_pin_key] = var_name

            # ── Route options ─────────────────────────────────────────────────
            # Priority order:
            #   1. routeOverrides that came from the Qiskit Metal worker
            #      (resolvedRouteOptions stored back by the frontend after render)
            #   2. Any user-set override already on the connection
            #   3. Canonical fabrication constants (fillet, leads)
            #   4. Heuristic fallback for total_length (never-rendered connections)
            route_options: dict[str, str] = {}
            for k, v in connection.routeOverrides.items():
                route_options[k] = str(v)

            if route_id == "RouteMeander":
                # fillet — use canonical constant unless already resolved to a
                # non-zero value.  The Qiskit Metal default is '0' (sharp corners)
                # which would produce wrong geometry; we always need the real value.
                existing_fillet = route_options.get("fillet", "")
                if not existing_fillet or existing_fillet in ("0", "0um", "0mm"):
                    route_options["fillet"] = FILLET_UM

                # total_length — use resolved value if present, else heuristic
                if "total_length" not in route_options:
                    route_options["total_length"] = _compute_total_length(
                        connection.from_.placementId,
                        connection.to.placementId,
                        placement_pos,
                    )

                # lead — always emit both start_straight and end_straight
                # so Qiskit Metal's redistribution is fully deterministic.
                # If a resolved 'lead' dict came back from the worker (stored as
                # JSON string by use-route-rendering.ts), parse and re-emit it;
                # otherwise default both sides to DEFAULT_LEAD_UM.
                if "lead" not in route_options:
                    route_options["lead"] = (
                        f"dict(start_straight='{DEFAULT_LEAD_UM}', "
                        f"end_straight='{DEFAULT_LEAD_UM}')"
                    )
                # If lead came back as a string that only contains start_straight
                # (e.g. from old metal_codegen.py which only set start_straight),
                # ensure end_straight is also present so the exit lead is controlled.
                else:
                    lead_v = route_options["lead"]
                    if isinstance(lead_v, str):
                        import json as _json2
                        try:
                            parsed_lead = _json2.loads(lead_v)
                            if isinstance(parsed_lead, dict):
                                parsed_lead.setdefault("start_straight", DEFAULT_LEAD_UM)
                                parsed_lead.setdefault("end_straight",   DEFAULT_LEAD_UM)
                                route_options["lead"] = parsed_lead
                        except Exception:
                            pass  # leave as-is; the emit code will handle it

            # ── Emit route line ───────────────────────────────────────────────
            # Build the route options part.
            # 'lead' and 'meander' are special — they must be emitted as nested
            # dict() calls, not quoted strings.
            # All other values are quoted string literals (e.g. '3.456mm').
            extra_parts = []
            for k, v in route_options.items():
                if k in ("lead", "meander"):
                    # v may be:
                    #   - a dict (from resolved options stored natively)
                    #   - a JSON string like '{"start_straight": "100um", ...}'
                    #   - already a dict()-literal string
                    if isinstance(v, dict):
                        inner = ", ".join(f"{dk}={dv!r}" for dk, dv in v.items())
                        extra_parts.append(f"{k}=dict({inner})")
                    else:
                        sv = str(v)
                        # Try to parse as JSON first (frontend stores as JSON string)
                        try:
                            import json as _json
                            parsed = _json.loads(sv)
                            if isinstance(parsed, dict):
                                inner = ", ".join(f"{dk}={dv!r}" for dk, dv in parsed.items())
                                extra_parts.append(f"{k}=dict({inner})")
                            else:
                                extra_parts.append(f"{k}={sv!r}")
                        except Exception:
                            # Already a dict()-literal string or similar
                            if sv.startswith("dict(") or sv.startswith("{"):
                                extra_parts.append(f"{k}={sv}")
                            else:
                                extra_parts.append(f"{k}={sv!r}")
                else:
                    extra_parts.append(f"{k}={v!r}")
            extra = ", ".join(extra_parts)

            route_lines.extend([
                f"{var_name} = {route_id}(design, {var_name!r}, options=dict(",
                f"    pin_inputs=dict(",
                f"        start_pin=dict(component={source_name!r}, pin={connection.from_.pinName!r}),",
                f"        end_pin=dict(component={target_name!r}, pin={connection.to.pinName!r}),",
                f"    ),",
                *([ f"    {extra}," ] if extra else []),
                f"))",
            ])

        n_comp = len(design.placements)
        header = (
            "# ----------------------------------------------------------------\n"
            "# Generated by Silicofeller - https://silicofeller.io\n"
            "# Run: pip install qiskit-metal && python this_file.py\n"
            "# ----------------------------------------------------------------\n"
        )

        # ── Emit feedline expansions ──────────────────────────────────────────
        feedline_lines: list[str] = []
        if design.feedlines:
            feedline_lines.append("")
            feedline_lines.append("# ── Feedlines ──────────────────────────────────────────────────")
            feedline_lines.append("# Each editor Feedline expands to: LaunchpadWirebond → RouteStraight → LaunchpadWirebond")
            imports.add("from qiskit_metal.qlibrary.terminations.launchpad_wb import LaunchpadWirebond")
            imports.add("from qiskit_metal.qlibrary.tlines.straight_path import RouteStraight")

            for fl in design.feedlines:
                feedline_lines.extend(_emit_feedline_expansion(fl))

        footer = [
            "",
            "design.rebuild()",
            "",
            "gui = MetalGUI(design)",
            "gui.rebuild()",
            "gui.autoscale()",
            "",
            f'print("{n_comp}-Component Chip Loaded Successfully")',
            "",
            'input("Press ENTER to close...")',
            "",
        ]
        sorted_imports = "\n".join(sorted(imports))
        body = "\n".join(setup + placement_lines + [""] + route_lines + feedline_lines + footer)
        code = f"{header}\n{sorted_imports}\n\n{body}\n"
        return GeneratedCode(language="python", filename="design.py", code=code)


codegen_service = CodegenService()


def _emit_feedline_expansion(fl: FeedlineModel) -> list[str]:
    """
    Expand one editor Feedline into the three Qiskit Metal components that
    produce equivalent geometry:

        LaunchpadWirebond (start)
        RouteStraight  (CPW body connecting the two pads)
        LaunchpadWirebond (end)

    The LaunchPad orientations are computed from the feedline direction so
    each pad faces inward along the CPW.

    For any resonator attached to this feedline we also emit a comment showing
    the computed attachment coordinates — the actual RouteMeander connection
    must be edited by the user or set up via the resonator codegen path.
    """
    import math as _math
    import re as _re

    lines: list[str] = []

    def _var(n: str) -> str:
        return _re.sub(r"[^a-zA-Z0-9]", "_", n).strip("_") or "comp"

    name = fl.name
    vname = _var(name)

    # ── Compute LaunchPad orientations from the feedline direction ──────────
    dx = fl.x2 - fl.x1
    dy = fl.y2 - fl.y1
    angle_deg = _math.degrees(_math.atan2(dy, dx))

    # LaunchPad A faces toward B (outward from chip edge inward)
    # Qiskit Metal orientation: 0 = right, 90 = up, 180 = left, 270 = down
    lp_a_orientation = round(angle_deg % 360, 1)
    lp_b_orientation = round((angle_deg + 180) % 360, 1)

    trace_w = f"{fl.traceWidth}um"
    trace_g = f"{fl.traceGap}um"
    lp_class = fl.launchpadType  # e.g. "LaunchpadWirebond"
    total_len_mm = round(_math.sqrt(dx * dx + dy * dy), 4)

    # ── LaunchPad A ─────────────────────────────────────────────────────────
    lp_a_name = f"{vname}_lp_start"
    lines.append(f"# Feedline '{name}' — LaunchPad A (start)")
    lines.append(
        f"{lp_a_name} = {lp_class}(design, {lp_a_name!r}, options=dict("
        f"pos_x={fl.x1!r}mm, pos_y={fl.y1!r}mm, "
        f"orientation={lp_a_orientation!r}, "
        f"trace_width={trace_w!r}, trace_gap={trace_g!r}))"
    )
    lines.append("")

    # ── LaunchPad B ─────────────────────────────────────────────────────────
    lp_b_name = f"{vname}_lp_end"
    lines.append(f"# Feedline '{name}' — LaunchPad B (end)")
    lines.append(
        f"{lp_b_name} = {lp_class}(design, {lp_b_name!r}, options=dict("
        f"pos_x={fl.x2!r}mm, pos_y={fl.y2!r}mm, "
        f"orientation={lp_b_orientation!r}, "
        f"trace_width={trace_w!r}, trace_gap={trace_g!r}))"
    )
    lines.append("")

    # ── RouteStraight (CPW body) ─────────────────────────────────────────────
    route_name = f"{vname}_cpw"
    lines.append(f"# Feedline '{name}' — CPW body (total length ≈ {total_len_mm} mm)")
    lines.append(
        f"{route_name} = RouteStraight(design, {route_name!r}, options=dict("
    )
    lines.append(
        f"    pin_inputs=dict("
        f"start_pin=dict(component={lp_a_name!r}, pin='tie'), "
        f"end_pin=dict(component={lp_b_name!r}, pin='tie')),"
    )
    lines.append(f"    trace_width={trace_w!r},")
    lines.append(f"    trace_gap={trace_g!r},")
    lines.append(f"))")
    lines.append("")

    # ── Resonator attachment comments ────────────────────────────────────────
    if fl.attachedResonators:
        lines.append(f"# Feedline '{name}' — resonator attachment points:")
        for att in fl.attachedResonators:
            t = max(0.0, min(1.0, att.t))
            ax = round(fl.x1 + (fl.x2 - fl.x1) * t, 4)
            ay = round(fl.y1 + (fl.y2 - fl.y1) * t, 4)
            lines.append(
                f"#   resonator={att.resonatorId!r}  t={t:.3f}  "
                f"attachment=({ax}mm, {ay}mm)  "
                f"coupling_gap={att.couplingGap}um  side={att.orientation!r}"
            )
        lines.append("")

    return lines


def generate_from_editor_state(
    components: list,
    connections: list,
    variables: dict | None = None,
) -> dict:
    """
    Generate Qiskit Metal Python from a legacy editor-state payload.

    This is the single public entry point for the /generate/metal-code endpoint.
    Internally delegates to metal_codegen.MetalCodeGenerator so callers don't need
    to import from metal_codegen directly.

    Returns a dict with keys: code, warnings, component_count, filename.
    """
    from app.services.metal_codegen.adapter import editor_state_to_design
    from app.services.metal_codegen.metal_codegen import MetalCodeGenerator

    design = editor_state_to_design(
        components=components,
        connections=connections,
        variables=variables or {},
    )
    result = MetalCodeGenerator(design).generate()
    return {
        "code": result.source_code,
        "warnings": result.warnings or [],
        "component_count": result.component_count,
        "filename": "design.py",
    }


def _fmt_opts(options: dict) -> str:
    if not options:
        return "dict()"
    pairs = ", ".join(f"{key}={_fmt_value(value)}" for key, value in options.items())
    return f"dict({pairs})"


# CPW variable names that Qiskit Metal resolves from design.variables at runtime.
# These must be emitted as bare identifiers (no quotes) in the generated code.
_CPW_VARS = {"cpw_width", "cpw_gap"}


def _fmt_value(value) -> str:
    """
    Serialize a parameter value for emission into Python source.

    Rules:
    - dicts  → Python dict literal  { 'key': value, ... }
    - strings that are CPW variable refs ('cpw_width', 'cpw_gap') → bare name
    - all other strings / numbers → repr()
    """
    if isinstance(value, dict):
        if not value:
            return "{}"
        pairs = ", ".join(f"{k!r}: {_fmt_value(v)}" for k, v in value.items())
        return "{" + pairs + "}"
    if isinstance(value, str) and value in _CPW_VARS:
        # Keep as a bare variable reference so Metal resolves it at runtime
        return repr(value)   # still a quoted string: 'cpw_width'
    return repr(value)
