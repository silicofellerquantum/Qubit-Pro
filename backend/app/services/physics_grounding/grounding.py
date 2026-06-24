"""
grounding.py — Physics Grounding stage.

Two entry points, matching the approved (reordered) architecture:

  * ``ground_intent(constraints) -> PhysicsPlan``
        Intent-level grounding. Runs **before** DesignGraph construction. Derives
        per-qubit target Hamiltonian vectors (analytic frequency planner in
        Increment 1; SQuADDS snap-to-realizable in Increment 2) and family-level
        grounded geometry. Always enabled; falls back analytic -> catalog.

  * ``resolve_geometry(graph, plan) -> None``
        Node-level grounding. Runs **after** DesignGraph construction and
        validation. For each node it resolves concrete ``design_options`` via the
        GeometryOracle and writes ``design_options`` + ``geometry_source`` back
        onto the node.
"""
from __future__ import annotations

import logging
from typing import Any

from app.services.physics_grounding.oracle import GeometryOracle
from app.services.physics_grounding.targets import (
    GroundedGeometry,
    PhysicsPlan,
    RoleTargets,
    TargetVector,
)

log = logging.getLogger(__name__)

# Default qubit-resonator coupling target when none is requested (MHz).
_DEFAULT_G_MHZ = 70.0


def ground_intent(constraints: Any) -> PhysicsPlan:
    """Intent-level grounding: constraints -> grounded targets + geometry."""
    from app.services.design_synth import ontology

    n        = max(1, int(getattr(constraints, "qubit_count", 1)))
    topology = str(getattr(constraints, "topology", "grid"))
    substrate = str(getattr(constraints, "substrate", "silicon"))

    role_targets: dict[str, RoleTargets] = {}
    warnings: list[str] = []
    epsilon_eff = 0.0

    try:
        from app.services.physics.frequency_planner import FrequencyPlanner
        try:
            from app.services.materials import get_physics_substrate
            sub = get_physics_substrate(substrate)
        except Exception:
            sub = None

        fp = FrequencyPlanner(n=n, substrate=sub, topology=topology).plan()
        epsilon_eff = fp.epsilon_eff
        warnings = [w.message for w in fp.warnings]

        res_by_qubit = {r.qubit: r for r in fp.resonators}
        for q in fp.qubits:
            r = res_by_qubit.get(q.name)
            role_targets[q.name] = RoleTargets(
                qubit_id=q.name,
                group=q.group,
                target=TargetVector(
                    f_q_ghz=q.freq_GHz,
                    alpha_mhz=round(q.anharmonicity_GHz * 1000.0, 2),
                    f_r_ghz=(r.freq_GHz if r else None),
                    kappa_khz=None,
                    g_mhz=_DEFAULT_G_MHZ,
                ),
            )
    except Exception as exc:  # pragma: no cover - defensive
        log.warning("Intent grounding (analytic planner) failed: %s", exc)
        warnings.append(f"grounding: analytic planner failed ({exc})")

    # Family-level geometry (representative target) for quick reference / UI.
    oracle = GeometryOracle()
    geometry_by_role: dict[str, GroundedGeometry] = {}
    rep = next(iter(role_targets.values())).target if role_targets else TargetVector()
    qfam = ontology.grounded_default(ontology.QUBIT_ROLE) or "TransmonCross"
    geometry_by_role[ontology.QUBIT_ROLE] = oracle.resolve(ontology.QUBIT_ROLE, qfam, rep)

    provenance = geometry_by_role[ontology.QUBIT_ROLE].source

    return PhysicsPlan(
        constraints=constraints,
        role_targets=role_targets,
        geometry_by_role=geometry_by_role,
        provenance=provenance,
        warnings=warnings,
        epsilon_eff=epsilon_eff,
    )


# Map design-graph NodeKind -> ontology role.
def _role_for_kind(kind_value: str) -> str:
    from app.services.design_synth import ontology
    return {
        "qubit":     ontology.QUBIT_ROLE,
        "coupler":   ontology.COUPLER_ROLE,
        "resonator": ontology.RESONATOR_ROLE,
        "feedline":  ontology.FEEDLINE_ROLE,
        "launchpad": ontology.LAUNCHPAD_ROLE,
    }.get(kind_value, ontology.QUBIT_ROLE)


def resolve_geometry(graph: Any, plan: PhysicsPlan) -> None:
    """Node-level grounding: write design_options + geometry_source onto nodes."""
    from app.services.design_synth import ontology

    oracle = GeometryOracle()
    for node in graph.nodes:
        kind_value = node.kind.value if hasattr(node.kind, "value") else str(node.kind)
        role = _role_for_kind(kind_value)
        family = getattr(node, "component_id", None) or ontology.grounded_default(role)
        if not family:
            continue

        target = plan.target_for(node.id) or TargetVector()
        try:
            geometry = oracle.resolve(role, family, target)
        except Exception as exc:  # pragma: no cover - defensive
            log.warning("Geometry resolve failed for node %s (%s): %s", node.id, family, exc)
            continue

        node.component_id = family
        node.design_options = geometry.design_options
        node.geometry_source = geometry.source
