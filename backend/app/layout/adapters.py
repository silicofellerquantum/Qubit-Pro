"""
Adapters Module

Integration glue between layout system and design pipeline:
- DesignGraph ↔ LayoutEngine adapters
- Legacy placement_dict format conversion
- Coordinate write-back to graph nodes

Status: Stub (to be implemented in LAYOUT-014)
Dependencies: LAYOUT-002 (models)
"""

from typing import Dict, Tuple, Any, TYPE_CHECKING

if TYPE_CHECKING:
    from app.core.design_graph.graph import DesignGraph
    from app.layout.models import LayoutCandidate


def to_placement_dict(layout_candidate: "LayoutCandidate") -> Dict[str, Any]:
    """
    Convert LayoutCandidate to legacy placement_dict format.
    
    Legacy format expected by routing and visualization:
    {
        'solver': str,
        'qubits': [{'id': str, 'x': float, 'y': float}, ...],
        'edges': [{'id': str, 'x': float, 'y': float}, ...],
        ...
    }
    
    Args:
        layout_candidate: LayoutCandidate from layout engine
        
    Returns:
        Dict with keys: solver, qubits[], edges[]
        
    Raises:
        NotImplementedError: Implementation pending LAYOUT-014
    """
    raise NotImplementedError("Pending LAYOUT-014")


def apply_to_graph(layout_candidate: "LayoutCandidate", design_graph: "DesignGraph") -> None:
    """
    Write layout coordinates back to DesignGraph nodes.
    
    Modifies design_graph in-place by setting x_mm, y_mm on each node.
    
    Args:
        layout_candidate: LayoutCandidate with placements
        design_graph: Target DesignGraph to modify
        
    Raises:
        NotImplementedError: Implementation pending LAYOUT-014
    """
    raise NotImplementedError("Pending LAYOUT-014")


def from_design_graph(design_graph: "DesignGraph") -> Dict[str, Tuple[float, float]]:
    """
    Extract current placements from DesignGraph.
    
    Args:
        design_graph: DesignGraph instance
        
    Returns:
        Dict[node_id, (x_mm, y_mm)]
        
    Raises:
        NotImplementedError: Implementation pending LAYOUT-014
    """
    raise NotImplementedError("Pending LAYOUT-014")
