"""
Adapters Module

Integration glue between layout system and design pipeline:
- DesignGraph ↔ LayoutEngine adapters
- Legacy placement_dict format conversion
- Coordinate write-back to graph nodes
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
        'qubits': [{'id': str, 'name': str, 'x': float, 'y': float, 'x_mm': float, 'y_mm': float}, ...],
        'edges': [{'qubit_a': str, 'pin_a': str, 'qubit_b': str, 'pin_b': str, 'label': str}, ...],
        'topology': str,
        'pitch_mm': float,
        'overall_score': float
    }
    
    Args:
        layout_candidate: LayoutCandidate from layout engine
        
    Returns:
        Dict with keys: solver, qubits[], edges[]
    """
    solver = layout_candidate.metadata.get("solver", "cpsat")
    
    # Extract qubits from placements
    qubit_ids = layout_candidate.metadata.get("qubit_ids", [])
    if not qubit_ids:
        # Fallback: look for keys starting with 'q' or 'Q' (case-insensitive)
        qubit_ids = [nid for nid in layout_candidate.placements if nid.lower().startswith('q')]
        
    qubits_data = []
    orientations = layout_candidate.metadata.get("orientations", {})
    for qid in qubit_ids:
        if qid in layout_candidate.placements:
            x, y = layout_candidate.placements[qid]
            orient = orientations.get(qid, 0)
            qubits_data.append({
                "id": qid,
                "name": qid,
                "x": x,
                "y": y,
                "x_mm": x,
                "y_mm": y,
                "orientation_deg": orient,
            })
            
    # Extract edges from metadata
    edges_meta = layout_candidate.metadata.get("edges", [])
    edges_data = []
    for e in edges_meta:
        edges_data.append({
            "qubit_a": e.get("qubit_a", ""),
            "pin_a": e.get("pin_a", ""),
            "qubit_b": e.get("qubit_b", ""),
            "pin_b": e.get("pin_b", ""),
            "label": e.get("label", ""),
        })
        
    return {
        "solver": solver,
        "qubits": qubits_data,
        "edges": edges_data,
        "topology": layout_candidate.template_name,
        "pitch_mm": layout_candidate.metadata.get("pitch_mm", 1.0),
        "overall_score": layout_candidate.score.overall_score if layout_candidate.score else 0.0,
    }


def apply_to_graph(layout_candidate: "LayoutCandidate", design_graph: "DesignGraph") -> None:
    """
    Write layout coordinates back to DesignGraph nodes.
    
    Modifies design_graph in-place by setting x_mm, y_mm, orientation_deg,
    and die size bounds.
    
    Args:
        layout_candidate: LayoutCandidate with placements
        design_graph: Target DesignGraph to modify
    """
    orientations = layout_candidate.metadata.get("orientations", {})
    
    for node_id, (x, y) in layout_candidate.placements.items():
        if design_graph.has_node(node_id):
            node = design_graph.get_node(node_id)
            node.x_mm = x
            node.y_mm = y
            if node_id in orientations:
                node.orientation_deg = orientations[node_id]
                
    if "chip_width_mm" in layout_candidate.metadata:
        design_graph.chip_width_mm = layout_candidate.metadata["chip_width_mm"]
    if "chip_height_mm" in layout_candidate.metadata:
        design_graph.chip_height_mm = layout_candidate.metadata["chip_height_mm"]


def from_design_graph(design_graph: "DesignGraph") -> Dict[str, Tuple[float, float]]:
    """
    Extract current placements from DesignGraph.
    
    Args:
        design_graph: DesignGraph instance
        
    Returns:
        Dict[node_id, (x_mm, y_mm)]
    """
    placements = {}
    for node in design_graph.nodes:
        if node.x_mm is not None and node.y_mm is not None:
            placements[node.id] = (node.x_mm, node.y_mm)
    return placements
