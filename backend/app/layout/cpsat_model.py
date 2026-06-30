"""
CP-SAT Constraint Model Module

OR-tools CP-SAT model construction:
- Integer-µm coordinate variables
- Interval variables for NoOverlap2D
- Attachment constraints (resonator → qubit)
- Corridor constraints (coupler centering)
- Perimeter constraints (launchpad → edge)
- Feedline constraints (resonator → feedline)
- Linear objective function

Status: Implemented (LAYOUT-010)
Dependencies: LAYOUT-003 (footprints)
"""

from typing import Dict, List, Tuple, Any, Optional

try:
    from ortools.sat.python.cp_model import (
        CpModel, CpSolver, OPTIMAL, FEASIBLE, INFEASIBLE, UNKNOWN, MODEL_INVALID,
    )
    _ORTOOLS_AVAILABLE = True
except ModuleNotFoundError:  # pragma: no cover
    _ORTOOLS_AVAILABLE = False
    CpModel = None  # type: ignore[assignment,misc]
    CpSolver = None  # type: ignore[assignment,misc]
    OPTIMAL = FEASIBLE = INFEASIBLE = UNKNOWN = MODEL_INVALID = None  # type: ignore[assignment]

from app.layout.models import Footprint, Obstacle

try:
    from app.layout.floorplanner import ConstraintKind
except ImportError:
    # Fallback definition if import fails to avoid circularity/ordering issues
    class ConstraintKind:
        QUBIT_SITE = "qubit_site"
        RESONATOR_SHELL = "resonator_shell"
        COUPLER_CORRIDOR = "coupler_corridor"
        LAUNCHPAD_SLOT = "launchpad_slot"
        FEEDLINE_CHANNEL = "feedline_channel"


class LegalizationInfeasible(Exception):
    """Raised when CP-SAT solver cannot find a feasible placement solution."""
    pass


def build_cpsat_model(
    components: List[Footprint],
    constraints: List[Any],
    obstacles: List[Obstacle],
    die_bounds: Optional[Tuple[float, float]] = None
) -> Tuple[Any, Dict[str, Dict[str, Any]]]:
    """
    Build CP-SAT model for placement.
    
    Creates OR-tools CpModel with:
    - Integer variables for component coordinates (µm precision)
    - Interval variables for NoOverlap2D constraints
    - Attachment constraints (secondary → primary components)
    - Corridor centering constraints
    - Perimeter/edge constraints
    - Linear objective minimizing total constraint violation
    
    Args:
        components: List of Footprint objects
        constraints: Placement constraints from floorplanner
        obstacles: Existing obstacles/keepouts
        die_bounds: Optional (width_mm, height_mm) limits
        
    Returns:
        Tuple of (model, variable_map) where:
            - model: CpModel instance
            - variable_map: Dict mapping node_id to {"x": x_var, "y": y_var}

    Raises:
        LegalizationInfeasible: If ortools is not installed.
    """
    if not _ORTOOLS_AVAILABLE:
        raise LegalizationInfeasible(
            "ortools is not installed. Install with: pip install ortools"
        )

    model = CpModel()

    # Determine die bounds (in mm)
    if die_bounds is None:
        max_x = 10.0
        max_y = 10.0
        for c in constraints:
            if hasattr(c, 'x_mm') and c.x_mm is not None:
                max_x = max(max_x, c.x_mm + 2.0)
            if hasattr(c, 'y_mm') and c.y_mm is not None:
                max_y = max(max_y, c.y_mm + 2.0)
        die_bounds = (max_x, max_y)

    die_width_mm, die_height_mm = die_bounds
    die_width_um = int(round(die_width_mm * 1000))
    die_height_um = int(round(die_height_mm * 1000))

    # Maps for variable lookups
    variable_map = {}

    # Step 1: Create coordinate variables for each component
    for fp in components:
        node_id = fp.node_id
        
        # Center x, y variables in µm
        x_center = model.NewIntVar(0, die_width_um, f"x_{node_id}")
        y_center = model.NewIntVar(0, die_height_um, f"y_{node_id}")

        variable_map[node_id] = {
            "x": x_center,
            "y": y_center
        }

    # Step 2: Build interval variables and NoOverlap2D
    x_intervals = []
    y_intervals = []

    for fp in components:
        node_id = fp.node_id
        x_center = variable_map[node_id]["x"]
        y_center = variable_map[node_id]["y"]

        # Override dimensions for resonators and feedlines
        # During placement, we model the resonator's coupling shell area (0.3x0.2mm)
        # and feedline channel width to avoid massive unrouted overlaps.
        if fp.component_type == "resonator":
            w_mm = 0.3
            h_mm = 0.2
        elif fp.component_type == "feedline":
            w_mm = die_width_mm
            h_mm = 0.4
        else:
            w_mm = fp.width_mm
            h_mm = fp.height_mm

        # Swap dimensions based on rotation
        rot = int(round(fp.rotation_deg)) % 180
        if rot == 90:
            w_mm, h_mm = h_mm, w_mm

        # Convert to µm including keepout clearance
        w_um = int(round(w_mm * 1000))
        h_um = int(round(h_mm * 1000))
        
        clearance_um = int(round(fp.keepout_mm * 1000))
        w_keepout_um = w_um + clearance_um
        h_keepout_um = h_um + clearance_um

        # Lower-left corner of the keepout box
        x_min = model.NewIntVar(-die_width_um * 2, die_width_um * 2, f"x_min_{node_id}")
        y_min = model.NewIntVar(-die_height_um * 2, die_height_um * 2, f"y_min_{node_id}")
        
        model.Add(x_min == x_center - w_keepout_um // 2)
        model.Add(y_min == y_center - h_keepout_um // 2)

        # Interval variables
        x_interval = model.NewFixedSizeIntervalVar(
            x_min, w_keepout_um, f"x_interval_{node_id}"
        )
        y_interval = model.NewFixedSizeIntervalVar(
            y_min, h_keepout_um, f"y_interval_{node_id}"
        )

        # Exclude feedlines from NoOverlap2D to avoid blocking the entire Y-span of the chip
        if fp.component_type != "feedline":
            x_intervals.append(x_interval)
            y_intervals.append(y_interval)

        # Die boundary constraints for tight physical box (only qubits, couplers, resonators, feedlines)
        if fp.component_type != "launchpad":
            model.Add(x_center - w_um // 2 >= 0)
            model.Add(x_center + w_um // 2 <= die_width_um)
            model.Add(y_center - h_um // 2 >= 0)
            model.Add(y_center + h_um // 2 <= die_height_um)
        else:
            # Launchpad center constraints: allowed to sit on perimeter
            model.Add(x_center >= 0)
            model.Add(x_center <= die_width_um)
            model.Add(y_center >= 0)
            model.Add(y_center <= die_height_um)

    # Add NoOverlap2D constraint over all keepout boxes
    if x_intervals and y_intervals:
        model.AddNoOverlap2D(x_intervals, y_intervals)

    # Step 3: Obstacle avoidance via disjunctive constraints
    for obs in obstacles:
        # Get obstacle bounding box in µm
        min_x, min_y, max_x, max_y = obs.polygon.bounds
        obs_min_x_um = int(round(min_x * 1000))
        obs_max_x_um = int(round(max_x * 1000))
        obs_min_y_um = int(round(min_y * 1000))
        obs_max_y_um = int(round(max_y * 1000))

        for fp in components:
            node_id = fp.node_id
            x_center = variable_map[node_id]["x"]
            y_center = variable_map[node_id]["y"]
            
            # Swapped bounds of the component's keepout box
            if fp.component_type == "resonator":
                w_mm = 0.3
                h_mm = 0.2
            elif fp.component_type == "feedline":
                w_mm = die_width_mm
                h_mm = 0.4
            else:
                w_mm = fp.width_mm
                h_mm = fp.height_mm

            rot = int(round(fp.rotation_deg)) % 180
            if rot == 90:
                w_mm, h_mm = h_mm, w_mm
            
            w_keepout_um = int(round((w_mm + fp.keepout_mm) * 1000))
            h_keepout_um = int(round((h_mm + fp.keepout_mm) * 1000))

            comp_min_x = x_center - w_keepout_um // 2
            comp_min_y = y_center - h_keepout_um // 2

            # Boolean variables for disjunction
            b_left = model.NewBoolVar(f"left_{node_id}_{obs.obstacle_id}")
            b_right = model.NewBoolVar(f"right_{node_id}_{obs.obstacle_id}")
            b_below = model.NewBoolVar(f"below_{node_id}_{obs.obstacle_id}")
            b_above = model.NewBoolVar(f"above_{node_id}_{obs.obstacle_id}")

            model.Add(comp_min_x + w_keepout_um <= obs_min_x_um).OnlyEnforceIf(b_left)
            model.Add(comp_min_x >= obs_max_x_um).OnlyEnforceIf(b_right)
            model.Add(comp_min_y + h_keepout_um <= obs_min_y_um).OnlyEnforceIf(b_below)
            model.Add(comp_min_y >= obs_max_y_um).OnlyEnforceIf(b_above)

            model.AddBoolOr([b_left, b_right, b_below, b_above])

    # Step 4: Apply constraints from Floorplanner
    cost_terms = []
    
    # Find feedline horizontal centerlines (if any) to help readout resonator alignment
    feedline_y_um_list = []
    for c in constraints:
        kind = getattr(c, "kind", None)
        if kind == "feedline_channel" or kind == ConstraintKind.FEEDLINE_CHANNEL:
            feedline_y_um_list.append(int(round(c.y_mm * 1000)))
    
    default_feedline_y_um = feedline_y_um_list[0] if feedline_y_um_list else int(round(die_height_mm * 0.1 * 1000))

    for c in constraints:
        node_id = c.node_id
        if node_id not in variable_map:
            continue
            
        x_center = variable_map[node_id]["x"]
        y_center = variable_map[node_id]["y"]
        target_x_um = int(round(c.x_mm * 1000))
        target_y_um = int(round(c.y_mm * 1000))
        kind = getattr(c, "kind", None)

        if kind == "qubit_site" or kind == ConstraintKind.QUBIT_SITE:
            # Qubits must snap to site exactly
            model.Add(x_center == target_x_um)
            model.Add(y_center == target_y_um)

        elif kind == "resonator_shell" or kind == ConstraintKind.RESONATOR_SHELL:
            # Resonators stay near qubit shell target (tolerance: 800 µm)
            dev_x = model.NewIntVar(0, die_width_um, f"res_dev_x_{node_id}")
            dev_y = model.NewIntVar(0, die_height_um, f"res_dev_y_{node_id}")
            diff_x = model.NewIntVar(-die_width_um, die_width_um, f"res_diff_x_{node_id}")
            diff_y = model.NewIntVar(-die_height_um, die_height_um, f"res_diff_y_{node_id}")
            model.Add(diff_x == x_center - target_x_um)
            model.Add(diff_y == y_center - target_y_um)
            model.AddAbsEquality(dev_x, diff_x)
            model.AddAbsEquality(dev_y, diff_y)
            model.Add(dev_x <= 800)
            model.Add(dev_y <= 800)
            
            cost_terms.append(dev_x * 10)
            cost_terms.append(dev_y * 10)

            # Attachment to qubit
            target_qubit = c.meta.get("target_qubit") if hasattr(c, "meta") and c.meta else None
            if target_qubit and target_qubit in variable_map:
                qx_var = variable_map[target_qubit]["x"]
                qy_var = variable_map[target_qubit]["y"]
                
                # Resonator distance to qubit <= 1200 µm
                q_dev_x = model.NewIntVar(0, die_width_um, f"res_q_dev_x_{node_id}")
                q_dev_y = model.NewIntVar(0, die_height_um, f"res_q_dev_y_{node_id}")
                q_diff_x = model.NewIntVar(-die_width_um, die_width_um, f"res_q_diff_x_{node_id}")
                q_diff_y = model.NewIntVar(-die_height_um, die_height_um, f"res_q_diff_y_{node_id}")
                model.Add(q_diff_x == x_center - qx_var)
                model.Add(q_diff_y == y_center - qy_var)
                model.AddAbsEquality(q_dev_x, q_diff_x)
                model.AddAbsEquality(q_dev_y, q_diff_y)
                model.Add(q_dev_x <= 1200)
                model.Add(q_dev_y <= 1200)
                
                cost_terms.append(q_dev_x * 15)
                cost_terms.append(q_dev_y * 15)

                # Feedline-facing constraint
                q_y_val = int(round(c.meta.get("qubit_y_mm", 0.0) * 1000))
                f_y = default_feedline_y_um
                
                if q_y_val >= f_y:
                    model.Add(y_center < qy_var)
                else:
                    model.Add(y_center > qy_var)

        elif kind == "coupler_corridor" or kind == ConstraintKind.COUPLER_CORRIDOR:
            # Couplers stay centered in corridor (tolerance: 200 µm)
            dev_x = model.NewIntVar(0, die_width_um, f"cpl_dev_x_{node_id}")
            dev_y = model.NewIntVar(0, die_height_um, f"cpl_dev_y_{node_id}")
            diff_x = model.NewIntVar(-die_width_um, die_width_um, f"cpl_diff_x_{node_id}")
            diff_y = model.NewIntVar(-die_height_um, die_height_um, f"cpl_diff_y_{node_id}")
            model.Add(diff_x == x_center - target_x_um)
            model.Add(diff_y == y_center - target_y_um)
            model.AddAbsEquality(dev_x, diff_x)
            model.AddAbsEquality(dev_y, diff_y)
            model.Add(dev_x <= 200)
            model.Add(dev_y <= 200)
            
            cost_terms.append(dev_x * 5)
            cost_terms.append(dev_y * 5)

        elif kind == "launchpad_slot" or kind == ConstraintKind.LAUNCHPAD_SLOT:
            # Launchpads stay close to perimeter slot (tolerance: 500 µm)
            dev_x = model.NewIntVar(0, die_width_um, f"lp_dev_x_{node_id}")
            dev_y = model.NewIntVar(0, die_height_um, f"lp_dev_y_{node_id}")
            diff_x = model.NewIntVar(-die_width_um, die_width_um, f"lp_diff_x_{node_id}")
            diff_y = model.NewIntVar(-die_height_um, die_height_um, f"lp_diff_y_{node_id}")
            model.Add(diff_x == x_center - target_x_um)
            model.Add(diff_y == y_center - target_y_um)
            model.AddAbsEquality(dev_x, diff_x)
            model.AddAbsEquality(dev_y, diff_y)
            model.Add(dev_x <= 500)
            model.Add(dev_y <= 500)
            
            cost_terms.append(dev_x * 1)
            cost_terms.append(dev_y * 1)

        elif kind == "feedline_channel" or kind == ConstraintKind.FEEDLINE_CHANNEL:
            # Feedlines snapped to routing channel exactly
            model.Add(x_center == target_x_um)
            model.Add(y_center == target_y_um)

    # Set objective function
    if cost_terms:
        model.Minimize(sum(cost_terms))

    return model, variable_map


def decode_solution(
    solver: CpSolver,
    variable_map: Dict[str, Dict[str, Any]]
) -> Dict[str, Tuple[float, float]]:
    """
    Decode CP-SAT solution to placement coordinates in mm.
    
    Args:
        solver: Solved CpSolver instance
        variable_map: Dict mapping node_id to {"x": x_var, "y": y_var}
        
    Returns:
        Dict[node_id, (x_mm, y_mm)]
    """
    placements = {}
    for node_id, vars_dict in variable_map.items():
        x_um = solver.Value(vars_dict["x"])
        y_um = solver.Value(vars_dict["y"])
        placements[node_id] = (x_um / 1000.0, y_um / 1000.0)
    return placements


def solve_model(
    model: CpModel,
    variable_map: Dict[str, Dict[str, Any]],
    timeout_s: float = 2.0
) -> Dict[str, Tuple[float, float]]:
    """
    Solve CP-SAT model and return node coordinates in mm.
    
    Args:
        model: CpModel instance
        variable_map: Dict mapping node_id to {"x": x_var, "y": y_var}
        timeout_s: Maximum solver execution time in seconds
        
    Returns:
        Dict[node_id, (x_mm, y_mm)]
        
    Raises:
        LegalizationInfeasible: If solver fails to find a solution or ortools unavailable.
    """
    if not _ORTOOLS_AVAILABLE:
        raise LegalizationInfeasible(
            "ortools is not installed. Install with: pip install ortools"
        )

    solver = CpSolver()
    solver.parameters.max_time_in_seconds = timeout_s
    solver.parameters.num_search_workers = 8
    solver.parameters.random_seed = 42
    
    try:
        solver.parameters.randomize_search = False
    except AttributeError:
        pass

    status = solver.Solve(model)

    if status in (FEASIBLE, OPTIMAL):
        return decode_solution(solver, variable_map)
    else:
        raise LegalizationInfeasible(f"CP-SAT solver failed with status {status}")
