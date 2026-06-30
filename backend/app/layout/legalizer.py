from typing import Dict, List, Tuple, Any, Optional
from app.layout.models import Footprint, Obstacle


class LegalizationInfeasible(Exception):
    """Raised when CP-SAT solver cannot find feasible solution."""
    pass


class PlacementLegalizer:
    """
    CP-SAT-based placement legalization.
    """
    
    def __init__(self) -> None:
        """Initialize PlacementLegalizer."""
        pass
    
    def legalize(
        self,
        components: List[Footprint],
        constraints: List[Any],
        obstacles: List[Obstacle],
        die_bounds: Optional[Tuple[float, float]] = None
    ) -> Dict[str, Tuple[float, float]]:
        """
        Solve placement using CP-SAT.
        
        Args:
            components: List of components to place
            constraints: Placement constraints
            obstacles: Existing obstacles/keepouts
            die_bounds: Optional (width_mm, height_mm) limits
            
        Returns:
            Dict[node_id, (x_mm, y_mm)]
        
        Raises:
            LegalizationInfeasible: If UNSAT or timeout
        """
        if not self.is_applicable(len(components)):
            from app.layout.constants import CPSAT_MAX_COMPONENTS
            raise LegalizationInfeasible(
                f"Component count {len(components)} exceeds maximum limit of {CPSAT_MAX_COMPONENTS}"
            )
            
        from app.layout.cpsat_model import build_cpsat_model, solve_model
        from app.layout.cpsat_model import LegalizationInfeasible as ModelInfeasible
        from app.layout.constants import CPSAT_TIMEOUT_SECONDS
        
        try:
            model, variable_map = build_cpsat_model(
                components, constraints, obstacles, die_bounds=die_bounds
            )
            return solve_model(model, variable_map, timeout_s=CPSAT_TIMEOUT_SECONDS)
        except ModelInfeasible as e:
            raise LegalizationInfeasible(str(e)) from e
    
    @staticmethod
    def is_applicable(num_components: int) -> bool:
        """
        Check if CP-SAT is applicable for given component count.
        
        Args:
            num_components: Number of components to place
            
        Returns:
            bool: True if within CP-SAT limits
        """
        from app.layout.constants import CPSAT_MAX_COMPONENTS
        return num_components <= CPSAT_MAX_COMPONENTS
