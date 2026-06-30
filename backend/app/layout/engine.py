"""
Layout Engine Assembly Module

Orchestrates the complete layout pipeline:
1. Template selection and floorplan generation
2. Primary component site assignment
3. Secondary component legalization (CP-SAT or overlap resolver)
4. Layout quality scoring
5. Result serialization
"""

import time
import logging
import copy
from typing import Dict, Tuple, Any, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from app.core.design_graph.graph import DesignGraph

from app.layout.models import LayoutCandidate
from app.layout.floorplanner import Floorplanner
from app.layout.legalizer import PlacementLegalizer, LegalizationInfeasible
from app.layout.overlap_resolver import OverlapResolver
from app.layout.scorer import LayoutScorer
from app.layout.footprints import FootprintGenerator
from app.layout.adapters import apply_to_graph
from app.layout.constants import CPSAT_MAX_COMPONENTS


def _get_solver_footprints(graph, clearance_mm: float, pitch: float, die_w: float) -> Dict[str, Any]:
    """
    Generate footprints for layout engine solver, overlap resolver, and scorer.
    
    Overrides straight-line extents of resonators and feedlines with their meander
    bounding boxes, and shrinks launchpads so their perimeter centers do not violate
    die boundary compliance.
    """
    from app.layout.footprints import _make_rect_polygon, _qubit_extent, _coupler_extent
    from app.layout.models import Footprint
    from app.core.design_graph.node import NodeKind
    
    footprints = {}
    for node in graph.nodes:
        cx = node.x_mm if node.x_mm is not None else 0.0
        cy = node.y_mm if node.y_mm is not None else 0.0
        angle = getattr(node, "orientation_deg", 0) or 0
        kind = node.kind
        
        if kind == NodeKind.QUBIT:
            w_mm, h_mm = _qubit_extent(node)
            comp_type = "qubit"
        elif kind == NodeKind.COUPLER:
            w_mm, h_mm = _coupler_extent(node, pitch / 2.0)
            comp_type = "coupler"
        elif kind == NodeKind.RESONATOR:
            # Resonators are meandered; model their coupling/routing box area
            w_mm, h_mm = 0.3, 0.2
            comp_type = "resonator"
        elif kind == NodeKind.FEEDLINE:
            # Feedline channel horizontal band width inside margin
            w_mm, h_mm = die_w, 0.4
            comp_type = "feedline"
        elif kind == NodeKind.LAUNCHPAD:
            # Launchpads sit on boundary; make zero-size so they stay inside die limits for scorer and legalizer
            w_mm, h_mm = 0.0, 0.0
            comp_type = "launchpad"
        else:
            w_mm, h_mm = 0.1, 0.1
            comp_type = "other"
            
        polygon = _make_rect_polygon(cx, cy, w_mm, h_mm, angle)
        keepout_polygon = polygon.buffer(clearance_mm / 2.0)
        
        footprints[node.id] = Footprint(
            node_id=node.id,
            component_type=comp_type,
            width_mm=w_mm,
            height_mm=h_mm,
            keepout_mm=clearance_mm,
            polygon=polygon,
            keepout_polygon=keepout_polygon,
            rotation_deg=float(angle),
            metadata={"x_mm": cx, "y_mm": cy}
        )
    return footprints


class LayoutEngineImpl:
    """
    Implementation of the main layout orchestrator.
    
    Coordinates:
        - Floorplanner (template-driven site generation)
        - PlacementLegalizer (CP-SAT solver)
        - OverlapResolver (geometric fallback)
        - LayoutScorer (quality assessment)
    """
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        """
        Initialize layout engine with configuration.
        
        Args:
            config: Optional configuration overrides
        """
        self.config = config or {}

    def generate(
        self, 
        design_graph: "DesignGraph", 
        constraints: Optional[Any] = None
    ) -> "LayoutCandidate":
        """
        Generate a layout candidate from a DesignGraph.
        
        Args:
            design_graph: DesignGraph instance with nodes and edges
            constraints: Optional placement constraints (dict or DesignConstraints)
            
        Returns:
            LayoutCandidate with placement coordinates and quality scores
        """
        start_time = time.perf_counter()
        
        # 1. Analyze design / parse constraints
        from app.constraints.constraints import DesignConstraints
        if constraints is None:
            constraints_obj = DesignConstraints(
                qubit_count=len(design_graph.qubits),
                topology=design_graph.topology,
                substrate=design_graph.substrate,
                metal=design_graph.metal,
            )
        elif isinstance(constraints, dict):
            constraints_obj = DesignConstraints.from_dict(constraints)
        else:
            constraints_obj = constraints
            
        # Ensure qubit_count matches graph qubits count
        constraints_obj.qubit_count = len(design_graph.qubits)
        
        # 2. Make copy of design graph to prevent side effects during generate
        temp_graph = copy.deepcopy(design_graph)
        
        # 3. Generate Floorplan
        floorplanner = Floorplanner(temp_graph, constraints_obj)
        floorplan_result = floorplanner.plan()
        
        die_w = floorplan_result.spec.chip_width_mm
        die_h = floorplan_result.spec.chip_height_mm
        pitch = floorplan_result.spec.pitch_mm
        
        # 4. Generate footprints using solver-aware sizing
        # Use DEFAULT_CLEARANCE_MM (0.05mm) as the keepout buffer for NoOverlap2D.
        # min_qubit_spacing_mm is already baked into floorplan site positions;
        # using it here as an additional buffer makes the model INFEASIBLE.
        from app.layout.constants import DEFAULT_CLEARANCE_MM
        clearance_mm = DEFAULT_CLEARANCE_MM
        footprints_pos = _get_solver_footprints(temp_graph, clearance_mm, pitch, die_w)
        
        # 5. Run Legalization (CP-SAT solver)
        num_components = len(footprints_pos)
        solver_name = "cpsat"
        placements = {}
        
        try:
            if num_components > CPSAT_MAX_COMPONENTS:
                raise LegalizationInfeasible(
                    f"Component count {num_components} exceeds maximum limit of {CPSAT_MAX_COMPONENTS}"
                )
            
            legalizer = PlacementLegalizer()
            placements = legalizer.legalize(
                components=list(footprints_pos.values()),
                constraints=floorplan_result.constraints,
                obstacles=[],
                die_bounds=(die_w, die_h)
            )
        except LegalizationInfeasible as exc:
            logging.warning("Placement legalization failed or skipped: %s. Using OverlapResolver fallback.", exc)
            solver_name = "overlap_resolver"
            
            # Filter out feedlines from overlap resolver inputs to prevent pushing components away from feedline channels
            initial_placements = {node.id: (node.x_mm, node.y_mm) for node in temp_graph.nodes}
            
            # Generate footprints centered at (0, 0) so OverlapResolver translate works correctly
            zero_graph = copy.deepcopy(temp_graph)
            for node in zero_graph.nodes:
                node.x_mm = 0.0
                node.y_mm = 0.0
            footprints_zero = _get_solver_footprints(zero_graph, clearance_mm, pitch, die_w)
            
            resolver_footprints = {k: v for k, v in footprints_zero.items() if v.component_type != "feedline"}
            resolver_placements = {k: v for k, v in initial_placements.items() if k in resolver_footprints}
            
            resolver = OverlapResolver()
            resolved = resolver.resolve(
                placements=resolver_placements,
                footprints=resolver_footprints,
                die_bounds=(die_w, die_h)
            )
            # Re-add feedline placements
            placements = {}
            for node_id, (x, y) in initial_placements.items():
                if node_id in resolved:
                    placements[node_id] = resolved[node_id]
                else:
                    placements[node_id] = (x, y)
            
        # 6. Centering coordinates
        centered_placements = {
            node_id: (x - die_w / 2.0, y - die_h / 2.0)
            for node_id, (x, y) in placements.items()
        }
        
        # Build centered graph to generate centered footprint polygons for the scorer
        centered_graph = copy.deepcopy(temp_graph)
        for node in centered_graph.nodes:
            if node.id in centered_placements:
                node.x_mm, node.y_mm = centered_placements[node.id]
                
        scorer_clearance_mm = DEFAULT_CLEARANCE_MM - 1e-4
        centered_footprints = _get_solver_footprints(centered_graph, scorer_clearance_mm, pitch, die_w)
        
        # Filter out feedlines for scorer to prevent false-positive overlap failures
        scorer_footprints = {k: v for k, v in centered_footprints.items() if v.component_type != "feedline"}
        scorer_placements = {k: v for k, v in centered_placements.items() if k in scorer_footprints}
        
        # 7. Quality Scoring
        scorer = LayoutScorer(min_spacing_mm=constraints_obj.fab.min_qubit_spacing_mm)
        score_breakdown = scorer.score(
            placements=scorer_placements,
            footprints=scorer_footprints,
            die_bounds=(die_w, die_h)
        )
        
        # LAYOUT-016: DRC Alignment Check (non-blocking validation)
        from app.layout.drc_alignment import log_alignment_check
        log_alignment_check(
            placements=scorer_placements,
            footprints=scorer_footprints,
            die_bounds=(die_w, die_h),
            constraints=constraints_obj
        )
        
        # 8. Create LayoutCandidate
        generation_time = time.perf_counter() - start_time
        orientations = {node.id: node.orientation_deg for node in centered_graph.nodes}
        
        # Legacy edges list for to_placement_dict compatibility
        edges_meta = []
        for coupler in design_graph.couplers:
            edges_meta.append({
                "qubit_a": coupler.qubit_a_id,
                "pin_a": "a",
                "pin_b": "b",
                "qubit_b": coupler.qubit_b_id,
                "label": coupler.id,
            })
            
        metadata = {
            "solver": solver_name,
            "chip_width_mm": die_w,
            "chip_height_mm": die_h,
            "pitch_mm": pitch,
            "qubit_ids": [q.id for q in design_graph.qubits],
            "orientations": orientations,
            "edges": edges_meta,
        }
        
        candidate = LayoutCandidate(
            placements=centered_placements,
            score=score_breakdown,
            template_name=floorplan_result.spec.topology,
            generation_time_sec=generation_time,
            metadata=metadata,
        )
        
        return candidate

    def apply(self, candidate: "LayoutCandidate", design_graph: "DesignGraph") -> None:
        """
        Apply layout candidate coordinates to DesignGraph nodes.
        
        Args:
            candidate: LayoutCandidate from generate()
            design_graph: Target DesignGraph to modify
        """
        apply_to_graph(candidate, design_graph)
