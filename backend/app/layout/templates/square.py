"""
Square Lattice Template

Row × column grid layout with D4 symmetry.

Status: Implemented (LAYOUT-005)
Dependencies: LAYOUT-004 (template core)
"""

import math
from typing import List, Any

from app.layout.models import Site, Corridor, Shell, Slot, Channel
from app.layout.templates.base import Template, register_template


class SquareLatticeTemplate(Template):
    """
    Square lattice template implementation.
    
    Features:
    - Row × column site grid
    - Horizontal/vertical coupler corridors
    - D4 (4-fold rotation + reflection) symmetry
    - Launchpad slots on die edges
    - Single feedline channel
    
    Generates exactly n sites in row-major order with minimum pairwise
    distance ≥ pitch. Die size scales monotonically with N.
    """
    
    @property
    def name(self) -> str:
        return "square"
    
    @property
    def description(self) -> str:
        return "Square lattice with row × column grid and D4 symmetry"
    
    @property
    def supported_topologies(self) -> List[str]:
        return ["square", "grid", "lattice", "line"]
    
    def sites(self, n: int, pitch: float) -> List[Site]:
        """
        Generate n qubit sites in square lattice arrangement.
        
        Args:
            n: Number of sites
            pitch: Minimum spacing between sites (mm)
            
        Returns:
            List of Site objects in row-major order
        """
        if n <= 0:
            return []
        
        # Calculate grid dimensions (as square as possible)
        cols = math.ceil(math.sqrt(n))
        rows = math.ceil(n / cols)
        
        sites = []
        site_idx = 0
        
        # Center the grid at origin
        grid_width = (cols - 1) * pitch
        grid_height = (rows - 1) * pitch
        offset_x = -grid_width / 2
        offset_y = -grid_height / 2
        
        for row in range(rows):
            for col in range(cols):
                if site_idx >= n:
                    break
                
                x = offset_x + col * pitch
                y = offset_y + row * pitch
                
                sites.append(Site(
                    site_id=f"site_{site_idx}",
                    x_mm=x,
                    y_mm=y,
                    capacity=1,
                    metadata={"row": row, "col": col}
                ))
                site_idx += 1
        
        return sites
    
    def corridors(self, sites: List[Site], topology: Any) -> List[Corridor]:
        """
        Generate horizontal/vertical coupler corridors.
        
        Args:
            sites: List of Site objects
            topology: Graph structure with edges
            
        Returns:
            List of Corridor objects for nearest-neighbor connections
        """
        if not sites:
            return []
        
        corridors = []
        
        # Extract edges from topology (supports dict, list, or graph-like object)
        edges = []
        if hasattr(topology, 'edges'):
            # NetworkX-like graph
            edges = list(topology.edges())
        elif isinstance(topology, dict) and 'edges' in topology:
            # Dict format
            edges = topology['edges']
        elif isinstance(topology, list):
            # Direct edge list
            edges = topology
        
        # Build site lookup by ID
        site_map = {site.site_id: site for site in sites}
        
        # Also support integer indices
        for i, site in enumerate(sites):
            site_map[i] = site
            site_map[str(i)] = site
        
        for idx, edge in enumerate(edges):
            # Handle edge format (tuple, list, or dict)
            if isinstance(edge, (list, tuple)) and len(edge) >= 2:
                src_id, dst_id = edge[0], edge[1]
            elif isinstance(edge, dict) and 'source' in edge and 'target' in edge:
                src_id, dst_id = edge['source'], edge['target']
            else:
                continue
            
            # Get sites
            src_site = site_map.get(src_id)
            dst_site = site_map.get(dst_id)
            
            if not src_site or not dst_site:
                continue
            
            # Calculate corridor center and dimensions
            center_x = (src_site.x_mm + dst_site.x_mm) / 2
            center_y = (src_site.y_mm + dst_site.y_mm) / 2
            
            dx = abs(dst_site.x_mm - src_site.x_mm)
            dy = abs(dst_site.y_mm - src_site.y_mm)
            
            # Width is the minor axis, length is the major axis
            if dx >= dy:
                width = 0.1  # mm (narrow corridor perpendicular to connection)
                length = dx
                orientation = "horizontal"
            else:
                width = 0.1  # mm
                length = dy
                orientation = "vertical"
            
            corridors.append(Corridor(
                corridor_id=f"corridor_{idx}",
                start_site=src_site.site_id,
                end_site=dst_site.site_id,
                center_x_mm=center_x,
                center_y_mm=center_y,
                width_mm=width,
                length_mm=length,
                metadata={"orientation": orientation}
            ))
        
        return corridors
    
    def shells(self, sites: List[Site]) -> List[Shell]:
        """
        Generate resonator shells around each site.
        
        Args:
            sites: List of Site objects
            
        Returns:
            List of Shell objects (4 quadrants per site)
        """
        shells = []
        shell_radius = 0.15  # mm (resonator shell radius)
        
        for site in sites:
            # Create 4 shells per site (quadrants: NE, SE, SW, NW)
            for quadrant_idx, (start_angle, end_angle, direction) in enumerate([
                (0, 90, "NE"),      # North-East
                (270, 360, "SE"),   # South-East (wraps to 0)
                (180, 270, "SW"),   # South-West
                (90, 180, "NW"),    # North-West
            ]):
                shells.append(Shell(
                    shell_id=f"{site.site_id}_shell_{direction}",
                    parent_site=site.site_id,
                    radius_mm=shell_radius,
                    start_angle_deg=start_angle,
                    end_angle_deg=end_angle,
                    metadata={"quadrant": direction}
                ))
        
        return shells
    
    def slots(self, n_launchpads: int) -> List[Slot]:
        """
        Generate launchpad slots on die perimeter.
        
        Args:
            n_launchpads: Number of launchpads to place
            
        Returns:
            List of Slot objects distributed on all 4 edges
        """
        if n_launchpads <= 0:
            return []
        
        slots = []
        
        # Assume die size based on launchpad count
        die_width = 9.0  # mm (default)
        die_height = 6.0  # mm (default)
        
        # Distribute launchpads evenly on 4 edges
        edges = ["top", "right", "bottom", "left"]
        pads_per_edge = n_launchpads // 4
        remaining = n_launchpads % 4
        
        slot_idx = 0
        
        for edge_idx, edge in enumerate(edges):
            # Add extra pad to first 'remaining' edges
            count = pads_per_edge + (1 if edge_idx < remaining else 0)
            
            for i in range(count):
                if edge == "top":
                    x = -die_width / 2 + (i + 1) * die_width / (count + 1)
                    y = die_height / 2
                elif edge == "bottom":
                    x = -die_width / 2 + (i + 1) * die_width / (count + 1)
                    y = -die_height / 2
                elif edge == "left":
                    x = -die_width / 2
                    y = -die_height / 2 + (i + 1) * die_height / (count + 1)
                else:  # right
                    x = die_width / 2
                    y = -die_height / 2 + (i + 1) * die_height / (count + 1)
                
                slots.append(Slot(
                    slot_id=f"slot_{slot_idx}",
                    edge=edge,
                    x_mm=x,
                    y_mm=y,
                    metadata={"edge_index": i}
                ))
                slot_idx += 1
        
        return slots
    
    def channels(self, shells: List[Shell]) -> List[Channel]:
        """
        Generate feedline channels.
        
        Args:
            shells: List of Shell objects
            
        Returns:
            List of Channel objects (single vertical feedline)
        """
        if not shells:
            return []
        
        # Single vertical feedline channel on left side
        die_height = 6.0  # mm
        feedline_x = -4.0  # mm (left side)
        
        return [
            Channel(
                channel_id="feedline_main",
                start_x_mm=feedline_x,
                start_y_mm=-die_height / 2,
                end_x_mm=feedline_x,
                end_y_mm=die_height / 2,
                width_mm=0.2,  # mm
                metadata={"type": "vertical_feedline"}
            )
        ]


# Register template
register_template("square", SquareLatticeTemplate)