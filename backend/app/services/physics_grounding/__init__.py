"""
physics_grounding — the Physics Grounding stage of the design pipeline.

Inserts physics knowledge between DesignIntent and the DesignGraph/compiler:

    DesignIntent
      -> ground_intent()        # intent-level: targets + grounded constraints
      -> DesignGraph
      -> resolve_geometry()     # node-level: design_options via GeometryOracle

Increment 1 ships analytic providers only (behavior-preserving). SQuADDS / ML
providers (Increment 2 / V2) drop into the same GeometryOracle chain.
"""
from app.services.physics_grounding.grounding import ground_intent, resolve_geometry
from app.services.physics_grounding.oracle import GeometryOracle, default_providers
from app.services.physics_grounding.targets import (
    GroundedGeometry,
    PhysicsPlan,
    RoleTargets,
    TargetVector,
)
from app.services.physics_grounding.verifier import PhysicsVerifier, physics_verifier

__all__ = [
    "ground_intent",
    "resolve_geometry",
    "GeometryOracle",
    "default_providers",
    "PhysicsPlan",
    "RoleTargets",
    "TargetVector",
    "GroundedGeometry",
    "PhysicsVerifier",
    "physics_verifier",
]
