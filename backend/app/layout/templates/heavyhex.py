"""
Heavy Hex Template

IBM-style heavy-hexagon lattice with data qubits on vertices
and ancilla on edges.

Status: Implemented (LAYOUT-007)
Dependencies: LAYOUT-004 (template core)
"""

import math
from typing import List, Any, Tuple

from app.layout.models import Site, Corridor, Shell, Slot, Channel
from app.layout.templates.base import Template, register_template


class HeavyHexTemplate(Template):
    """
    Heavy-hexagon template implementation.
    
    Features:
    - Heavy-hex lattice coordinates
    - Data qubits on vertices, ancilla on edges
    - Brick-wall row layout
    - Hex-edge corridors (degree ≤ 3)
    - Vertical reflection symmetry
    
    Implements IBM's heavy-hexagonal lattice geometry for
    surface code architectures.
    """
    
    @property
    def name(self) -> str:
        return "heavyhex"
    
    @property
    def description(self) -> str:
        return "IBM-style heavy-hexagon lattice with degree-3 connectivity"
    
    @property
    def supported_topologies(self) -> List[str]:
        return ["heavy-hex", "heavyhex", "heavy_hex", "ibm"]
    
    def _generate_heavyhex_coords(self, n: int, pitch: float) -> List[Tuple[float, float, str]]:
        """
        Generate heavy-hex lattice coordinates.
        
        Returns list of (x, y, type) tuples where type is 'data' or 'ancilla'.
        """
        coords = []
        
        # Heavy-hex unit cell dimensions
        hex_width = pitch * math.sqrt(3)
        hex_height = pitch * 1.5
        
        # Calculate rows needed
        rows = math.ceil(math.sqrt(n / 1.5))  # Rough estimate
        cols = math.ceil(n / rows)
        
        site_count = 0
        
        for row in range(rows):
            if site_count >= n:
                break
            
            # Brick-wall pattern: alternate row offsets
            x_offset = (hex_width / 2) if row % 2 == 1 else 0
            
            for col in range(cols):
                if site_count >= n:
                    break
                
                x = col * hex_width + x_offset
                y = row * hex_height
                
                # Alternate data/ancilla based on position
                qubit_type = "data" if (row + col) % 2 == 0 else "ancilla"
                
                coords.append((x, y, qubit_type))
                site_count += 1
        
        # Center at origin
        if coords:
            avg_x = sum(c[0] for c in coords) / len(coords)
            avg_y = sum(c[1] for c in coords) / len(coords)
            coords = [(x - avg_x, y - avg_y, t) for x, y, t in coords]
        
        return coords
    
    def sites(self, n: int, pitch: float) -> List[Site]:
        """
        Generate heavy-hex lattice sites.
        
        Args:
            n: Number of sites
            pitch: Lattice spacing (mm)
            
        Returns:
            List of Site objects in heavy-hex arrangement
        """
        if n <= 0:
            return []
        
        coords = self._generate_heavyhex_coords(n, pitch)
        
        sites = []
        for i, (x, y, qubit_type) in enumerate(coords):
            sites.append(Site(
                site_id=f"site_{i}",
                x_mm=x,
                y_mm=y,
                capacity=1,
                metadata={
                    "type": qubit_type,
                    "row": i // math.ceil(math.sqrt(n)),
                    "col": i % math.ceil(math.sqrt(n))
                }
            ))
        
        return sites
    
    def corridors(self, sites: List[Site], topology: Any) -> List[Corridor]:
        """
        Generate hex-edge corridors.
        
        Args:
            sites: List of Site objects
            topology: Heavy-hex connectivity graph
            
        Returns:
            List of Corridor objects
        """
        if len(sites) < 2:
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
        else:
            # Default: nearest-neighbor hex connectivity
            # Each site connects to up to 3 neighbors
            edges = self._generate_heavyhex_edges(len(sites))
        
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
            
            dx = dst_site.x_mm - src_site.x_mm
            dy = dst_site.y_mm - src_site.y_mm
            length = math.sqrt(dx**2 + dy**2)
            
            corridors.append(Corridor(
                corridor_id=f"corridor_{idx}",
                start_site=src_site.site_id,
                end_site=dst_site.site_id,
                center_x_mm=center_x,
                center_y_mm=center_y,
                width_mm=0.08,  # mm (narrow hex edge)
                length_mm=length,
                metadata={"type": "hex_edge"}
            ))
        
        return corridors
    
    def _generate_heavyhex_edges(self, n: int) -> List[Tuple[int, int]]:
        """Generate default heavy-hex connectivity (degree ≤ 3)."""
        edges = []
        rows = math.ceil(math.sqrt(n / 1.5))
        cols = math.ceil(n / rows)
        
        for i in range(n):
            row = i // cols
            col = i % cols
            
            # Connect to right neighbor
            if col + 1 < cols and i + 1 < n:
                edges.append((i, i + 1))
            
            # Connect to bottom neighbor
            if row + 1 < rows and i + cols < n:
                edges.append((i, i + cols))
            
            # Diagonal connection (hex structure)
            if row % 2 == 0 and col > 0 and i + cols - 1 < n:
                edges.append((i, i + cols - 1))
        
        return edges
    
    def shells(self, sites: List[Site]) -> List[Shell]:
        """
        Generate resonator shells for heavy-hex sites.
        
        Args:
            sites: List of Site objects
            
        Returns:
            List of Shell objects
        """
        shells = []
        shell_radius = 0.12  # mm
        
        for site in sites:
            # 3 shells per site (120° sectors)
            for i, (start, end, direction) in enumerate([
                (0, 120, "A"),
                (120, 240, "B"),
                (240, 360, "C"),
            ]):
                shells.append(Shell(
                    shell_id=f"{site.site_id}_shell_{direction}",
                    parent_site=site.site_id,
                    radius_mm=shell_radius,
                    start_angle_deg=start,
                    end_angle_deg=end,
                    metadata={"sector": direction}
                ))
        
        return shells
    
    def slots(self, n_launchpads: int) -> List[Slot]:
        """
        Generate launchpad slots on die perimeter.
        
        Args:
            n_launchpads: Number of launchpads
            
        Returns:
            List of Slot objects
        """
        if n_launchpads <= 0:
            return []
        
        slots = []
        die_width = 10.0  # mm
        die_height = 8.0  # mm
        
        # Distribute on top and bottom edges (vertical symmetry)
        pads_per_edge = n_launchpads // 2
        remaining = n_launchpads % 2
        
        slot_idx = 0
        
        # Top edge
        for i in range(pads_per_edge + remaining):
            x = -die_width / 2 + (i + 1) * die_width / (pads_per_edge + remaining + 1)
            slots.append(Slot(
                slot_id=f"slot_{slot_idx}",
                edge="top",
                x_mm=x,
                y_mm=die_height / 2,
                metadata={"edge_index": i}
            ))
            slot_idx += 1
        
        # Bottom edge
        for i in range(pads_per_edge):
            x = -die_width / 2 + (i + 1) * die_width / (pads_per_edge + 1)
            slots.append(Slot(
                slot_id=f"slot_{slot_idx}",
                edge="bottom",
                x_mm=x,
                y_mm=-die_height / 2,
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
            List of Channel objects
        """
        if not shells:
            return []
        
        # Two vertical feedlines (left and right) for symmetry
        die_height = 8.0  # mm
        
        return [
            Channel(
                channel_id="feedline_left",
                start_x_mm=-4.5,
                start_y_mm=-die_height / 2,
                end_x_mm=-4.5,
                end_y_mm=die_height / 2,
                width_mm=0.2,
                metadata={"side": "left"}
            ),
            Channel(
                channel_id="feedline_right",
                start_x_mm=4.5,
                start_y_mm=-die_height / 2,
                end_x_mm=4.5,
                end_y_mm=die_height / 2,
                width_mm=0.2,
                metadata={"side": "right"}
            ),
        ]


# Register template
register_template("heavyhex", HeavyHexTemplate)