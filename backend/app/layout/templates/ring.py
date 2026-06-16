"""
Ring Template

Circular layout with cyclic symmetry.

Status: Implemented (LAYOUT-006)
Dependencies: LAYOUT-004 (template core)
"""

import math
from typing import List, Any

from app.layout.models import Site, Corridor, Shell, Slot, Channel
from app.layout.templates.base import Template, register_template


class RingTemplate(Template):
    """
    Ring template implementation.
    
    Features:
    - N sites equally spaced on circle
    - Tangential orientation
    - Ring corridors for nearest-neighbor coupling
    - Cyclic symmetry
    
    Sites arranged with equal angular spacing: 2πi/n.
    Radius calculated as n·pitch/(2π) to maintain pitch spacing.
    """
    
    @property
    def name(self) -> str:
        return "ring"
    
    @property
    def description(self) -> str:
        return "Circular ring layout with cyclic symmetry"
    
    @property
    def supported_topologies(self) -> List[str]:
        return ["ring", "circular", "cyclic"]
    
    def sites(self, n: int, pitch: float) -> List[Site]:
        """
        Generate n sites equally spaced on a circle.
        
        Args:
            n: Number of sites
            pitch: Target spacing between adjacent sites (mm)
            
        Returns:
            List of Site objects arranged in a ring
        """
        if n <= 0:
            return []
        
        # Calculate radius to achieve desired pitch
        # Arc length between adjacent sites: s = r * θ
        # For equal spacing: θ = 2π/n
        # pitch = r * (2π/n) → r = n * pitch / (2π)
        arc_radius = n * pitch / (2 * math.pi)
        chord_radius = 0.0
        if n > 1:
            chord_radius = pitch / (2 * math.sin(math.pi / n))
        radius = max(arc_radius, chord_radius)
        
        # Minimum radius for practical layout
        radius = max(radius, 0.5)  # mm
        
        sites = []
        
        for i in range(n):
            # Equal angular spacing
            angle = 2 * math.pi * i / n
            
            # Position on circle (start at top, go clockwise)
            x = radius * math.sin(angle)
            y = radius * math.cos(angle)
            
            sites.append(Site(
                site_id=f"site_{i}",
                x_mm=x,
                y_mm=y,
                capacity=1,
                metadata={
                    "angle_deg": math.degrees(angle),
                    "radius_mm": radius
                }
            ))
        
        return sites
    
    def corridors(self, sites: List[Site], topology: Any) -> List[Corridor]:
        """
        Generate ring corridors (nearest-neighbor connections).
        
        Args:
            sites: List of Site objects
            topology: Graph structure (ring assumes cyclic connectivity)
            
        Returns:
            List of Corridor objects
        """
        if len(sites) < 2:
            return []
        
        corridors = []
        n = len(sites)
        
        # Extract edges from topology
        edges = []
        if hasattr(topology, 'edges'):
            edges = list(topology.edges())
        elif isinstance(topology, dict) and 'edges' in topology:
            edges = topology['edges']
        elif isinstance(topology, list):
            edges = topology
        else:
            # Default: cyclic ring connectivity
            edges = [(i, (i + 1) % n) for i in range(n)]
        
        # Build site lookup
        site_map = {site.site_id: site for site in sites}
        for i, site in enumerate(sites):
            site_map[i] = site
            site_map[str(i)] = site
        
        for idx, edge in enumerate(edges):
            # Parse edge
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
            
            # Corridor along arc
            center_x = (src_site.x_mm + dst_site.x_mm) / 2
            center_y = (src_site.y_mm + dst_site.y_mm) / 2
            
            # Arc length as corridor length
            dx = dst_site.x_mm - src_site.x_mm
            dy = dst_site.y_mm - src_site.y_mm
            length = math.sqrt(dx**2 + dy**2)
            
            corridors.append(Corridor(
                corridor_id=f"corridor_{idx}",
                start_site=src_site.site_id,
                end_site=dst_site.site_id,
                center_x_mm=center_x,
                center_y_mm=center_y,
                width_mm=0.1,  # mm
                length_mm=length,
                metadata={"type": "ring_arc"}
            ))
        
        return corridors
    
    def shells(self, sites: List[Site]) -> List[Shell]:
        """
        Generate resonator shells around ring sites.
        
        Args:
            sites: List of Site objects
            
        Returns:
            List of Shell objects (radial shells)
        """
        shells = []
        shell_radius = 0.15  # mm
        
        for site in sites:
            # Inner shell (toward center)
            shells.append(Shell(
                shell_id=f"{site.site_id}_shell_inner",
                parent_site=site.site_id,
                radius_mm=shell_radius,
                start_angle_deg=0,
                end_angle_deg=180,
                metadata={"position": "inner"}
            ))
            
            # Outer shell (away from center)
            shells.append(Shell(
                shell_id=f"{site.site_id}_shell_outer",
                parent_site=site.site_id,
                radius_mm=shell_radius,
                start_angle_deg=180,
                end_angle_deg=360,
                metadata={"position": "outer"}
            ))
        
        return shells
    
    def slots(self, n_launchpads: int) -> List[Slot]:
        """
        Generate launchpad slots on outer perimeter.
        
        Args:
            n_launchpads: Number of launchpads
            
        Returns:
            List of Slot objects on die edges
        """
        if n_launchpads <= 0:
            return []
        
        slots = []
        die_radius = 4.0  # mm (outer perimeter)
        
        for i in range(n_launchpads):
            angle = 2 * math.pi * i / n_launchpads
            x = die_radius * math.cos(angle)
            y = die_radius * math.sin(angle)
            
            # Determine edge
            if abs(x) > abs(y):
                edge = "right" if x > 0 else "left"
            else:
                edge = "top" if y > 0 else "bottom"
            
            slots.append(Slot(
                slot_id=f"slot_{i}",
                edge=edge,
                x_mm=x,
                y_mm=y,
                metadata={"angle_deg": math.degrees(angle)}
            ))
        
        return slots
    
    def channels(self, shells: List[Shell]) -> List[Channel]:
        """
        Generate feedline channels (radial spoke).
        
        Args:
            shells: List of Shell objects
            
        Returns:
            List of Channel objects
        """
        if not shells:
            return []
        
        # Single radial feedline
        return [
            Channel(
                channel_id="feedline_radial",
                start_x_mm=0.0,
                start_y_mm=0.0,
                end_x_mm=0.0,
                end_y_mm=-3.5,  # mm (outward to edge)
                width_mm=0.2,
                metadata={"type": "radial"}
            )
        ]


# Register template
register_template("ring", RingTemplate)
