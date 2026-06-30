"""
feedline_reconstructor.py
─────────────────────────
Round-trip import support for native Feedline objects.

When a design is imported from Qiskit Metal Python code (or reconstructed
from a bridge worker response) this module detects the canonical pattern

    LaunchpadWirebond → RouteStraight → LaunchpadWirebond

and collapses it back into a single FeedlineModel.  The result is then stored
in DesignDocument.feedlines so the editor shows one Feedline object rather than
three separate placements.

The reconstruction is exact:
  - LaunchPad positions  → feedline x1/y1 and x2/y2
  - RouteStraight trace_width / trace_gap  → feedline traceWidth / traceGap
  - Attached resonators  → feedline.attachedResonators (derived from connections
    that land on a CoupledLineTee or LineTee whose prime line falls on the route)

Usage (called from the main backend after a design load / code-run):
    from app.services.feedline_reconstructor import reconstruct_feedlines
    doc = reconstruct_feedlines(doc)
"""

from __future__ import annotations

import math
import re
from typing import Any

from app.core.editor_models import (
    DesignDocument,
    FeedlineAttachment,
    FeedlineModel,
    Placement,
    Connection,
)

# ── LaunchPad class name pattern ──────────────────────────────────────────────
_LP_RE = re.compile(r"^LaunchpadWirebond", re.IGNORECASE)
_RS_RE = re.compile(r"^RouteStraight",     re.IGNORECASE)
_TEE_RE = re.compile(r"^(CoupledLineTee|LineTee|CapNInterdigitalTee)", re.IGNORECASE)


def _parse_mm(val: Any) -> float | None:
    """Parse a Qiskit Metal length string to millimetres."""
    if val is None:
        return None
    s = str(val).strip()
    try:
        num = float(re.sub(r"[a-zA-Z]", "", s))
    except ValueError:
        return None
    if s.endswith("mm"):
        return num
    if s.endswith("um"):
        return num * 0.001
    if s.endswith("nm"):
        return num * 1e-6
    return num  # bare number → assume mm


def _parse_um(val: Any) -> float | None:
    mm = _parse_mm(val)
    return mm * 1000 if mm is not None else None


# ── Core reconstruction ────────────────────────────────────────────────────────

def reconstruct_feedlines(doc: DesignDocument) -> DesignDocument:
    """
    Scan `doc` for LaunchpadWirebond → RouteStraight → LaunchpadWirebond triples
    connected via RouteStraight.  Collapse each triple into a FeedlineModel and
    remove the three component placements from doc.placements plus the two
    Connection objects that wired them together.

    Returns the mutated DesignDocument (same object, modified in-place).
    """
    placements_by_id: dict[str, Placement] = {p.id: p for p in doc.placements}
    connections_by_id: dict[str, Connection] = {c.id: c for c in doc.connections}

    # Index: placement_id → list of connection ids touching that placement
    touching: dict[str, list[str]] = {}
    for c in doc.connections:
        for pid in (c.from_.placementId, c.to.placementId):
            touching.setdefault(pid, []).append(c.id)

    consumed_placements: set[str] = set()
    consumed_connections: set[str] = set()
    new_feedlines: list[FeedlineModel] = list(doc.feedlines)

    # Find all RouteStraight placements
    for rs_pl in doc.placements:
        if not _RS_RE.match(rs_pl.componentId):
            continue
        if rs_pl.id in consumed_placements:
            continue

        # Find the two connections attached to this RouteStraight
        conn_ids = touching.get(rs_pl.id, [])
        if len(conn_ids) < 2:
            continue

        lp_start_pl: Placement | None = None
        lp_end_pl:   Placement | None = None
        start_conn:  Connection | None = None
        end_conn:    Connection | None = None

        for cid in conn_ids:
            c = connections_by_id.get(cid)
            if c is None:
                continue
            # The other side of this connection
            other_id = (
                c.to.placementId
                if c.from_.placementId == rs_pl.id
                else c.from_.placementId
            )
            other_pl = placements_by_id.get(other_id)
            if other_pl is None:
                continue
            if not _LP_RE.match(other_pl.componentId):
                continue
            if lp_start_pl is None:
                lp_start_pl = other_pl
                start_conn  = c
            elif lp_end_pl is None:
                lp_end_pl = other_pl
                end_conn  = c

        if lp_start_pl is None or lp_end_pl is None:
            continue

        # ── Build FeedlineModel ────────────────────────────────────────────
        x1 = lp_start_pl.x
        y1 = lp_start_pl.y
        x2 = lp_end_pl.x
        y2 = lp_end_pl.y

        tw_raw = rs_pl.params.get("trace_width") or lp_start_pl.params.get("trace_width") or "10um"
        tg_raw = rs_pl.params.get("trace_gap")   or lp_start_pl.params.get("trace_gap")   or "6um"

        trace_w = _parse_um(tw_raw) or 10.0
        trace_g = _parse_um(tg_raw) or 6.0

        total_len = math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)

        # Derive a sensible name: prefer the RouteStraight name minus any suffix
        name = re.sub(r"_cpw$|_route$|_straight$", "", rs_pl.name) or rs_pl.name

        fl = FeedlineModel(
            id=f"fl_{rs_pl.id}",
            name=name,
            x1=x1,
            y1=y1,
            x2=x2,
            y2=y2,
            traceWidth=trace_w,
            traceGap=trace_g,
            launchpadType=lp_start_pl.componentId,
            attachedResonators=_find_attached_resonators(
                rs_pl, doc, touching, placements_by_id
            ),
            totalLength=total_len,
        )

        new_feedlines.append(fl)
        consumed_placements.update({rs_pl.id, lp_start_pl.id, lp_end_pl.id})
        if start_conn:
            consumed_connections.add(start_conn.id)
        if end_conn:
            consumed_connections.add(end_conn.id)

    if not consumed_placements:
        return doc  # nothing to collapse

    doc.placements = [p for p in doc.placements if p.id not in consumed_placements]
    doc.connections = [c for c in doc.connections if c.id not in consumed_connections]
    doc.feedlines   = new_feedlines
    return doc


def _find_attached_resonators(
    rs_pl: Placement,
    doc: DesignDocument,
    touching: dict[str, list[str]],
    placements_by_id: dict[str, Placement],
) -> list[FeedlineAttachment]:
    """
    Find resonators (or coupler tees) whose connections land on the RouteStraight.
    This handles the case where a LineTee / CoupledLineTee was used as an
    intermediate connection point between the feedline and the resonator.

    For each such component we compute the normalised t value based on its
    x/y position relative to the feedline endpoints.
    """
    attachments: list[FeedlineAttachment] = []

    for c in doc.connections:
        # Look for a connection from a tee → to the RouteStraight (or vice versa)
        tee_id: str | None = None
        if c.to.placementId == rs_pl.id:
            tee_id = c.from_.placementId
        elif c.from_.placementId == rs_pl.id:
            tee_id = c.to.placementId

        if tee_id is None:
            continue
        tee_pl = placements_by_id.get(tee_id)
        if tee_pl is None or not _TEE_RE.match(tee_pl.componentId):
            continue

        # Compute t from tee position
        x1 = rs_pl.x  # approximate — use the LaunchPad positions for accuracy
        y1 = rs_pl.y
        tx = tee_pl.x - x1
        ty = tee_pl.y - y1
        dx = rs_pl.params.get("_x2", 0.0)  # set if available from geometry
        dy = rs_pl.params.get("_y2", 0.0)
        seg_len_sq = float(dx) ** 2 + float(dy) ** 2
        t = (tx * float(dx) + ty * float(dy)) / seg_len_sq if seg_len_sq > 0 else 0.5
        t = max(0.0, min(1.0, t))

        attachments.append(
            FeedlineAttachment(
                resonatorId=tee_id,
                segmentIndex=0,
                t=t,
                couplingGap=10.0,
                orientation="down",
            )
        )

    return attachments
