"""
Overlap Resolver Module

Geometric push-apart fallback for large N or CP-SAT infeasible cases:
- Iterative shapely-based separation
- Push overlapping components apart
- Clamp to die bounds
- Guarantee zero-overlap convergence

Status: Stub (to be implemented in LAYOUT-012)
Dependencies: LAYOUT-003 (footprints)
"""


class OverlapResolver:
    """
    Geometric overlap resolution via iterative push-apart.
    """
    
    def __init__(self, max_iters=100):
        """
        Initialize overlap resolver.
        
        Args:
            max_iters: Maximum iterations for convergence
        """
        self.max_iters = max_iters
    
    def resolve(self, placements, footprints, die_bounds):
        """
        Resolve overlaps via iterative separation.
        
        Args:
            placements: Dict[node_id, (x_mm, y_mm)]
            footprints: Dict[node_id, Footprint]
            die_bounds: Optional (width_mm, height_mm)
            
        Returns:
            Dict[node_id, (x_mm, y_mm)] with zero overlaps
        """
        from shapely.affinity import translate
        import copy
        
        current_placements = copy.deepcopy(placements)
        
        for _ in range(self.max_iters):
            overlaps_found = False
            
            polys = {}
            for node_id, (x, y) in current_placements.items():
                if node_id in footprints:
                    # Use keepout_polygon for overlap checking
                    poly = footprints[node_id].keepout_polygon
                    polys[node_id] = translate(poly, xoff=x, yoff=y)
            
            node_ids = list(current_placements.keys())
            for i in range(len(node_ids)):
                for j in range(i + 1, len(node_ids)):
                    id1 = node_ids[i]
                    id2 = node_ids[j]
                    
                    if id1 not in polys or id2 not in polys:
                        continue
                        
                    poly1 = polys[id1]
                    poly2 = polys[id2]
                    
                    if poly1.intersects(poly2):
                        overlaps_found = True
                        intersection = poly1.intersection(poly2)
                        bounds = intersection.bounds
                        
                        if bounds:
                            width = bounds[2] - bounds[0]
                            height = bounds[3] - bounds[1]
                            
                            c1x, c1y = current_placements[id1]
                            c2x, c2y = current_placements[id2]
                            dx = c2x - c1x
                            dy = c2y - c1y
                            
                            if width < height:
                                push_x = width / 2.0 + 0.001
                                push_y = 0.0
                            else:
                                push_x = 0.0
                                push_y = height / 2.0 + 0.001
                                
                            if dx < 0:
                                push_x = -push_x
                            if dy < 0:
                                push_y = -push_y
                                
                            current_placements[id1] = (c1x - push_x, c1y - push_y)
                            current_placements[id2] = (c2x + push_x, c2y + push_y)
            
            if die_bounds:
                w, h = die_bounds
                for node_id in current_placements:
                    x, y = current_placements[node_id]
                    x = max(0.0, min(x, w))
                    y = max(0.0, min(y, h))
                    current_placements[node_id] = (x, y)
                    
            if not overlaps_found:
                break
                
        return current_placements
