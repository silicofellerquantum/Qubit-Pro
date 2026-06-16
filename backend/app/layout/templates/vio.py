"""
Quantware VIO Template

Vertical-IO flip-chip design with perimeter launchpads.

Status: Implemented (LAYOUT-008)
Dependencies: LAYOUT-004 (template core)
"""

import math
from typing import List, Any

from app.layout.models import Site, Corridor, Shell, Slot, Channel
from app.layout.templates.base import Template, register_template


class QuantwareVIOTemplate(Template):
    """
    Quantware VIO template implementation.
    
    Features:
    - Central compact qubit array
    - Full-perimeter launchpad ring
    - Flip-chip/vertical-IO optimized
    - D4 symmetry
    - All 4 edges populated
    
    Optimized for flip-chip bonding with vertical I/O bumps
    and high I/O density on die perimeter.
    """
    
    @property
    def name(self) -> str:
        return "vio"
    
    @property
    def description(self) -> str:
        return "Quantware VIO with perimeter launchpads for flip-chip bonding"
    
    @property
    def supported_topologies(self) -> List[str]:
        return ["vio", "vertical-io", "flip-chip", "flipchip"]
    
    def sites(self, n: int, pitch: float) -> List[Site]:
        """
        Generate compact central qubit array.
        
        Args:
            n: Number of sites
            pitch: Minimum spacing (mm)
            
        Returns:
            List of Site objects in central compact grid
        """
        if n <= 0:
            return []
        
        # Compact central array
        cols = math.ceil(math.sqrt(n))
        rows = math.ceil(n / cols)
        
        # Tighter pitch for VIO (20% smaller for compact core)
        effective_pitch = pitch * 0.8
        
        sites = []
        site_idx = 0
        
        # Center the array at origin
        grid_width = (cols - 1) * effective_pitch
        grid_height = (rows - 1) * effective_pitch
        offset_x = -grid_width / 2
        offset_y = -grid_height / 2
        
        for row in range(rows):
            for col in range(cols):
                if site_idx >= n:
                    break
                
                x = offset_x + col * effective_pitch
                y = offset_y + row * effective_pitch
                
                sites.append(Site(
                    site_id=f"site_{site_idx}",
                    x_mm=x,
                    y_mm=y,
                    capacity=1,
                    metadata={
                        "row": row,
                        "col": col,
                        "zone": "core"
                    }
                ))
                site_idx += 1
        
        return sites
    
    def corridors(self, sites: List[Site], topology: Any) -> List[Corridor]:
        """
        Generate compact coupler corridors.
        
        Args:
            sites: List of Site objects
            topology: Connectivity graph
            
        Returns:
            List of Corridor objects
        """
        if not sites:
            return []
        
        corridors = []
        
        # Extract edges
        edges = []
        if hasattr(topology, 'edges'):
            edges = list(topology.edges())
        elif isinstance(topology, dict) and 'edges' in topology:
            edges = topology['edges']
        elif isinstance(topology, list):
            edges = topology
        
        # Build site lookup
        site_map = {site.site_id: site for site in sites}
        for i, site in enumerate(sites):
            site_map[i] = site
            site_map[str(i)] = site
        
        for idx, edge in enumerate(edges):
            if isinstance(edge, (list, tuple)) and len(edge) >= 2:
                src_id, dst_id = edge[0], edge[1]
            elif isinstance(edge, dict):
                src_id = edge.get('source', edge.get('src'))
                dst_id = edge.get('target', edge.get('dst'))
            else:
                continue
            
            src_site = site_map.get(src_id)
            dst_site = site_map.get(dst_id)
            
            if not src_site or not dst_site:
                continue
            
            center_x = (src_site.x_mm + dst_site.x_mm) / 2
            center_y = (src_site.y_mm + dst_site.y_mm) / 2
            
            dx = abs(dst_site.x_mm - src_site.x_mm)
            dy = abs(dst_site.y_mm - src_site.y_mm)
            
            if dx >= dy:
                width = 0.08  # mm (compact VIO design)
                length = dx
                orientation = "horizontal"
            else:
                width = 0.08  # mm
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
                metadata={"orientation": orientation, "type": "vio_compact"}
            ))
        
        return corridors
    
    def shells(self, sites: List[Site]) -> List[Shell]:
        """
        Generate resonator shells (perimeter-facing).
        
        Args:
            sites: List of Site objects
            
        Returns:
            List of Shell objects oriented toward perimeter
        """
        shells = []
        shell_radius = 0.18  # mm (larger shells for VIO routing)
        
        for site in sites:
            # 4 shells per site, oriented toward die edges
            for direction, (start_angle, end_angle) in [
                ("top", (45, 135)),
                ("right", (315, 45)),  # wraps around 0
                ("bottom", (225, 315)),
                ("left", (135, 225)),
            ]:
                shells.append(Shell(
                    shell_id=f"{site.site_id}_shell_{direction}",
                    parent_site=site.site_id,
                    radius_mm=shell_radius,
                    start_angle_deg=start_angle,
                    end_angle_deg=end_angle,
                    metadata={
                        "direction": direction,
                        "perimeter_facing": True
                    }
                ))
        
        return shells
    
    def slots(self, n_launchpads: int) -> List[Slot]:
        """
        Generate full-perimeter launchpad slots.
        
        Args:
            n_launchpads: Number of launchpads
            
        Returns:
            List of Slot objects on all 4 edges (high density)
        """
        if n_launchpads <= 0:
            return []
        
        slots = []
        
        # VIO uses larger die for perimeter I/O
        die_width = 12.0  # mm
        die_height = 9.0  # mm
        
        # Distribute evenly on all 4 edges
        edges = ["top", "right", "bottom", "left"]
        edge_lengths = [die_width, die_height, die_width, die_height]
        total_perimeter = sum(edge_lengths)
        
        slot_idx = 0
        
        for edge, edge_length in zip(edges, edge_lengths):
            # Proportional allocation based on edge length
            count = max(1, round(n_launchpads * edge_length / total_perimeter))
            
            for i in range(count):
                if slot_idx >= n_launchpads:
                    break
                
                # Position along edge
                t = (i + 1) / (count + 1)  # Fraction along edge
                
                if edge == "top":
                    x = -die_width / 2 + t * die_width
                    y = die_height / 2
                elif edge == "bottom":
                    x = -die_width / 2 + t * die_width
                    y = -die_height / 2
                elif edge == "left":
                    x = -die_width / 2
                    y = -die_height / 2 + t * die_height
                else:  # right
                    x = die_width / 2
                    y = -die_height / 2 + t * die_height
                
                slots.append(Slot(
                    slot_id=f"slot_{slot_idx}",
                    edge=edge,
                    x_mm=x,
                    y_mm=y,
                    metadata={
                        "edge_index": i,
                        "vio": True
                    }
                ))
                slot_idx += 1
        
        return slots
    
    def channels(self, shells: List[Shell]) -> List[Channel]:
        """
        Generate feedline channels (perimeter ring).
        
        Args:
            shells: List of Shell objects
            
        Returns:
            List of Channel objects forming perimeter ring
        """
        if not shells:
            return []
        
        # VIO uses perimeter ring feedline
        die_width = 12.0  # mm
        die_height = 9.0  # mm
        inset = 0.8  # mm from edge
        
        # 4 channels forming a rectangle
        return [
            # Top edge
            Channel(
                channel_id="feedline_top",
                start_x_mm=-die_width / 2 + inset,
                start_y_mm=die_height / 2 - inset,
                end_x_mm=die_width / 2 - inset,
                end_y_mm=die_height / 2 - inset,
                width_mm=0.25,  # mm (wider for high I/O)
                metadata={"edge": "top", "type": "perimeter"}
            ),
            # Right edge
            Channel(
                channel_id="feedline_right",
                start_x_mm=die_width / 2 - inset,
                start_y_mm=die_height / 2 - inset,
                end_x_mm=die_width / 2 - inset,
                end_y_mm=-die_height / 2 + inset,
                width_mm=0.25,
                metadata={"edge": "right", "type": "perimeter"}
            ),
            # Bottom edge
            Channel(
                channel_id="feedline_bottom",
                start_x_mm=die_width / 2 - inset,
                start_y_mm=-die_height / 2 + inset,
                end_x_mm=-die_width / 2 + inset,
                end_y_mm=-die_height / 2 + inset,
                width_mm=0.25,
                metadata={"edge": "bottom", "type": "perimeter"}
            ),
            # Left edge
            Channel(
                channel_id="feedline_left",
                start_x_mm=-die_width / 2 + inset,
                start_y_mm=-die_height / 2 + inset,
                end_x_mm=-die_width / 2 + inset,
                end_y_mm=die_height / 2 - inset,
                width_mm=0.25,
                metadata={"edge": "left", "type": "perimeter"}
            ),
        ]


# Register template
register_template("vio", QuantwareVIOTemplate)