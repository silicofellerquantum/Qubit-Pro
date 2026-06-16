"""
Heavy Hex Template

IBM-style heavy-hexagon lattice with data qubits on vertices and ancilla on
edges. The default corridor graph is capped at degree 3.
"""

import math
from typing import Any, List, Tuple

from app.layout.models import Channel, Corridor, Shell, Site, Slot
from app.layout.templates.base import Template, register_template


class HeavyHexTemplate(Template):
    """Heavy-hexagon template implementation."""

    @property
    def name(self) -> str:
        return "heavyhex"

    @property
    def description(self) -> str:
        return "IBM-style heavy-hexagon lattice with degree-3 connectivity"

    @property
    def supported_topologies(self) -> List[str]:
        return ["heavy-hex", "heavyhex", "heavy_hex", "ibm"]

    def _generate_heavyhex_coords(
        self,
        n: int,
        pitch: float,
    ) -> List[Tuple[float, float, str]]:
        coords: List[Tuple[float, float, str]] = []
        hex_width = pitch * math.sqrt(3)
        hex_height = pitch * 1.5
        rows = max(1, math.ceil(math.sqrt(n / 1.5)))
        cols = max(1, math.ceil(n / rows))

        for row in range(rows):
            x_offset = hex_width / 2 if row % 2 == 1 else 0.0
            for col in range(cols):
                if len(coords) >= n:
                    break
                qubit_type = "data" if (row + col) % 2 == 0 else "ancilla"
                coords.append((col * hex_width + x_offset, row * hex_height, qubit_type))

        if not coords:
            return []

        avg_x = sum(c[0] for c in coords) / len(coords)
        avg_y = sum(c[1] for c in coords) / len(coords)
        return [(x - avg_x, y - avg_y, kind) for x, y, kind in coords]

    def sites(self, n: int, pitch: float) -> List[Site]:
        if n <= 0:
            return []

        coords = self._generate_heavyhex_coords(n, pitch)
        cols = max(1, math.ceil(math.sqrt(n)))
        return [
            Site(
                site_id=f"site_{i}",
                x_mm=x,
                y_mm=y,
                capacity=1,
                metadata={"type": qubit_type, "row": i // cols, "col": i % cols},
            )
            for i, (x, y, qubit_type) in enumerate(coords)
        ]

    def corridors(self, sites: List[Site], topology: Any) -> List[Corridor]:
        if len(sites) < 2:
            return []

        if hasattr(topology, "edges"):
            edges = list(topology.edges())
        elif isinstance(topology, dict) and "edges" in topology:
            edges = topology["edges"]
        elif isinstance(topology, list):
            edges = topology
        else:
            edges = self._generate_heavyhex_edges(sites)

        site_map: dict[Any, Site] = {site.site_id: site for site in sites}
        for i, site in enumerate(sites):
            site_map[i] = site
            site_map[str(i)] = site

        corridors: List[Corridor] = []
        for idx, edge in enumerate(edges):
            if isinstance(edge, (list, tuple)) and len(edge) >= 2:
                src_id, dst_id = edge[0], edge[1]
            elif isinstance(edge, dict):
                src_id = edge.get("source", edge.get("src"))
                dst_id = edge.get("target", edge.get("dst"))
            else:
                continue

            src_site = site_map.get(src_id)
            dst_site = site_map.get(dst_id)
            if src_site is None or dst_site is None:
                continue

            dx = dst_site.x_mm - src_site.x_mm
            dy = dst_site.y_mm - src_site.y_mm
            corridors.append(
                Corridor(
                    corridor_id=f"corridor_{idx}",
                    start_site=src_site.site_id,
                    end_site=dst_site.site_id,
                    center_x_mm=(src_site.x_mm + dst_site.x_mm) / 2.0,
                    center_y_mm=(src_site.y_mm + dst_site.y_mm) / 2.0,
                    width_mm=0.08,
                    length_mm=math.hypot(dx, dy),
                    metadata={"type": "hex_edge"},
                )
            )

        return corridors

    def _generate_heavyhex_edges(self, sites: List[Site]) -> List[Tuple[int, int]]:
        """Generate deterministic nearest-neighbor connectivity with degree <= 3."""
        candidates: List[Tuple[float, int, int]] = []
        for i, site_a in enumerate(sites):
            for j in range(i + 1, len(sites)):
                site_b = sites[j]
                distance = math.hypot(site_b.x_mm - site_a.x_mm, site_b.y_mm - site_a.y_mm)
                candidates.append((distance, i, j))

        candidates.sort(key=lambda item: (round(item[0], 9), item[1], item[2]))

        degree = [0 for _ in sites]
        edges: List[Tuple[int, int]] = []
        for _, i, j in candidates:
            if degree[i] >= 3 or degree[j] >= 3:
                continue
            edges.append((i, j))
            degree[i] += 1
            degree[j] += 1

        return edges

    def shells(self, sites: List[Site]) -> List[Shell]:
        shells: List[Shell] = []
        for site in sites:
            for start, end, direction in [
                (0, 120, "A"),
                (120, 240, "B"),
                (240, 360, "C"),
            ]:
                shells.append(
                    Shell(
                        shell_id=f"{site.site_id}_shell_{direction}",
                        parent_site=site.site_id,
                        radius_mm=0.12,
                        start_angle_deg=start,
                        end_angle_deg=end,
                        metadata={"sector": direction},
                    )
                )
        return shells

    def slots(self, n_launchpads: int) -> List[Slot]:
        if n_launchpads <= 0:
            return []

        die_width = 10.0
        die_height = 8.0
        top_count = (n_launchpads + 1) // 2
        bottom_count = n_launchpads - top_count
        slots: List[Slot] = []

        for i in range(top_count):
            x = -die_width / 2 + (i + 1) * die_width / (top_count + 1)
            slots.append(
                Slot(
                    slot_id=f"slot_{len(slots)}",
                    edge="top",
                    x_mm=x,
                    y_mm=die_height / 2,
                    metadata={"edge_index": i},
                )
            )

        for i in range(bottom_count):
            x = -die_width / 2 + (i + 1) * die_width / (bottom_count + 1)
            slots.append(
                Slot(
                    slot_id=f"slot_{len(slots)}",
                    edge="bottom",
                    x_mm=x,
                    y_mm=-die_height / 2,
                    metadata={"edge_index": i},
                )
            )

        return slots

    def channels(self, shells: List[Shell]) -> List[Channel]:
        if not shells:
            return []

        die_height = 8.0
        return [
            Channel(
                channel_id="feedline_left",
                start_x_mm=-4.5,
                start_y_mm=-die_height / 2,
                end_x_mm=-4.5,
                end_y_mm=die_height / 2,
                width_mm=0.2,
                metadata={"side": "left"},
            ),
            Channel(
                channel_id="feedline_right",
                start_x_mm=4.5,
                start_y_mm=-die_height / 2,
                end_x_mm=4.5,
                end_y_mm=die_height / 2,
                width_mm=0.2,
                metadata={"side": "right"},
            ),
        ]


register_template("heavyhex", HeavyHexTemplate)
