"""
Placement Legalizer Module

CP-SAT-based constraint solver for secondary component placement:
- Builds OR-tools CP-SAT model
- Integer-µm coordinate variables
- NoOverlap2D constraints
- Attachment, corridor, perimeter, feedline constraints
- Linear objective (minimize attachment distance + corridor centering)

Status: Stub (to be implemented in LAYOUT-011)
Dependencies: LAYOUT-010 (CP-SAT model)
"""


class LegalizationInfeasible(Exception):
    """Raised when CP-SAT solver cannot find feasible solution."""
    pass


class PlacementLegalizer:
    """
    CP-SAT-based placement legalization.
    
    Status: Stub (to be implemented in LAYOUT-011)
    """
    
    def __init__(self):
        raise NotImplementedError("Pending LAYOUT-011")
    
    def legalize(self, components, constraints, obstacles):
        """
        Solve placement using CP-SAT.
        
        Args:
            components: List of components to place
            constraints: Placement constraints
            obstacles: Existing obstacles/keepouts
            
        Returns:
            Dict[node_id, (x_mm, y_mm)]
        
        Raises:
            LegalizationInfeasible: If UNSAT or timeout
            NotImplementedError: Implementation pending LAYOUT-011
        """
        raise NotImplementedError("Pending LAYOUT-011")
    
    @staticmethod
    def is_applicable(num_components):
        """
        Check if CP-SAT is applicable for given component count.
        
        Args:
            num_components: Number of components to place
            
        Returns:
            bool: True if within CP-SAT limits
        """
        from app.layout.constants import CPSAT_MAX_COMPONENTS
        return num_components <= CPSAT_MAX_COMPONENTS
