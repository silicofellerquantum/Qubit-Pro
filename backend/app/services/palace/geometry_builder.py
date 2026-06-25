"""Geometry builder for AWS Palace integration.

Converts design graph structures and design payload dictionaries into
normalized electromagnetic geometries.
"""

from __future__ import annotations

import logging
from typing import Any
from app.core.design_graph.serializer import dict_to_graph
from app.core.design_graph.graph import DesignGraph
from app.services.palace.exceptions import GeometryError
from app.services.palace.models import EMGeometry, GeometryElement, GeometryElementKind

logger = logging.getLogger(__name__)


class GeometryBuilder:
    """Builder class for parsing and constructing EMGeometry from design data."""

    @staticmethod
    def build_geometry(payload: dict[str, Any]) -> EMGeometry:
        """Build a normalized EMGeometry from the given design payload.

        Args:
            payload: The design payload dictionary.

        Returns:
            A populated EMGeometry object.

        Raises:
            GeometryError: If the geometry cannot be built from the payload.
        """
        logger.info("Starting geometry builder parsing...")
        if not payload:
            logger.error("Empty design payload provided to GeometryBuilder.")
            raise GeometryError("Empty design payload provided.")

        v2_data = payload.get("v2", {})
        graph_dict = v2_data.get("graph")

        if graph_dict:
            try:
                logger.info("Parsing V2 design graph from payload...")
                graph = dict_to_graph(graph_dict)
                geom = GeometryBuilder.from_design_graph(graph)
                logger.info(
                    "GeometryBuilder successfully parsed DesignGraph: design_id=%s, substrate=%s, metal=%s, elements_count=%d",
                    geom.design_id, geom.substrate, geom.metal, len(geom.elements)
                )
                return geom
            except Exception as e:
                logger.exception("Failed to build geometry from design graph.")
                raise GeometryError(f"Failed to build geometry from design graph: {e}") from e

        # Fallback to legacy payload structure
        logger.info("Falling back to legacy flat payload structure...")
        geom = GeometryBuilder.from_legacy_payload(payload)
        logger.info(
            "GeometryBuilder successfully parsed legacy payload: design_id=%s, substrate=%s, metal=%s, elements_count=%d",
            geom.design_id, geom.substrate, geom.metal, len(geom.elements)
        )
        return geom

    @staticmethod
    def from_design_graph(graph: DesignGraph) -> EMGeometry:
        """Build EMGeometry directly from a V2 DesignGraph object."""
        logger.info(
            "Extracting elements from DesignGraph: qubits=%d, resonators=%d, couplers=%d, feedlines=%d, launchpads=%d",
            len(graph.qubits), len(graph.resonators), len(graph.couplers), len(graph.feedlines), len(graph.launchpads)
        )
        elements = []

        # 1. Extract qubits
        for q in graph.qubits:
            params = {
                "qubit_type": q.qubit_type.value if hasattr(q.qubit_type, "value") else str(q.qubit_type),
                "frequency_ghz": q.frequency_ghz,
                "anharmonicity_ghz": q.anharmonicity_ghz,
                "ej_ghz": q.ej_ghz,
                "ec_ghz": q.ec_ghz,
                "pad_gap_um": getattr(q, "pad_gap_um", 30.0),
                "pad_width_um": getattr(q, "pad_width_um", 455.0),
                "pad_height_um": getattr(q, "pad_height_um", 90.0),
                "pocket_width_um": getattr(q, "pocket_width_um", 650.0),
                "pocket_height_um": getattr(q, "pocket_height_um", 650.0),
            }
            if getattr(q, "design_options", None):
                params.update(q.design_options)
            elements.append(
                GeometryElement(
                    id=q.id,
                    kind=GeometryElementKind.QUBIT,
                    x_mm=q.x_mm if q.x_mm is not None else 0.0,
                    y_mm=q.y_mm if q.y_mm is not None else 0.0,
                    orientation_deg=float(q.orientation_deg),
                    params=params,
                )
            )

        # 2. Extract resonators
        for r in graph.resonators:
            params = {
                "resonator_type": r.resonator_type.value if hasattr(r.resonator_type, "value") else str(r.resonator_type),
                "frequency_ghz": r.frequency_ghz,
                "length_mm": r.length_mm,
                "detuning_ghz": r.detuning_ghz,
                "target_qubit_id": r.target_qubit_id,
            }
            if getattr(r, "design_options", None):
                params.update(r.design_options)
            elements.append(
                GeometryElement(
                    id=r.id,
                    kind=GeometryElementKind.RESONATOR,
                    x_mm=r.x_mm if r.x_mm is not None else 0.0,
                    y_mm=r.y_mm if r.y_mm is not None else 0.0,
                    orientation_deg=float(r.orientation_deg),
                    params=params,
                )
            )

        # 3. Extract couplers
        for c in graph.couplers:
            params = {
                "coupler_type": c.coupler_type.value if hasattr(c.coupler_type, "value") else str(c.coupler_type),
                "strength_mhz": c.strength_mhz,
                "qubit_a_id": c.qubit_a_id,
                "qubit_b_id": c.qubit_b_id,
            }
            if getattr(c, "design_options", None):
                params.update(c.design_options)
            elements.append(
                GeometryElement(
                    id=c.id,
                    kind=GeometryElementKind.COUPLER,
                    x_mm=c.x_mm if c.x_mm is not None else 0.0,
                    y_mm=c.y_mm if c.y_mm is not None else 0.0,
                    orientation_deg=float(c.orientation_deg),
                    params=params,
                )
            )

        # 4. Extract feedlines
        for f in graph.feedlines:
            params = {
                "length_mm": f.length_mm,
                "cpw_width_um": f.cpw_width_um,
                "cpw_gap_um": f.cpw_gap_um,
            }
            if getattr(f, "design_options", None):
                params.update(f.design_options)
            elements.append(
                GeometryElement(
                    id=f.id,
                    kind=GeometryElementKind.FEEDLINE,
                    x_mm=f.x_mm if f.x_mm is not None else 0.0,
                    y_mm=f.y_mm if f.y_mm is not None else 0.0,
                    orientation_deg=float(f.orientation_deg),
                    params=params,
                )
            )

        # 5. Extract launchpads
        for lp in graph.launchpads:
            params = {
                "style": lp.style.value if hasattr(lp.style, "value") else str(lp.style),
                "pad_width_um": lp.pad_width_um,
                "pad_gap_um": getattr(lp, "pad_gap_um", 15.0),
            }
            if getattr(lp, "design_options", None):
                params.update(lp.design_options)
            elements.append(
                GeometryElement(
                    id=lp.id,
                    kind=GeometryElementKind.LAUNCHPAD,
                    x_mm=lp.x_mm if lp.x_mm is not None else 0.0,
                    y_mm=lp.y_mm if lp.y_mm is not None else 0.0,
                    orientation_deg=float(lp.orientation_deg),
                    params=params,
                )
            )

        return EMGeometry(
            design_id=graph.chip_name,
            chip_width_mm=graph.chip_width_mm,
            chip_height_mm=graph.chip_height_mm,
            substrate=graph.substrate,
            metal=graph.metal,
            elements=elements,
        )

    @staticmethod
    def from_legacy_payload(payload: dict[str, Any]) -> EMGeometry:
        """Fallback to build EMGeometry from a legacy flat payload dictionary."""
        elements = []
        design = payload.get("design", {})
        placements = design.get("placements", [])
        logger.info("Extracting elements from legacy payload: placements=%d", len(placements))

        for p in placements:
            # Fallback chain for ID / Name
            inst_id = p.get("instanceId") or p.get("instance_id") or p.get("id") or p.get("name") or ""
            
            # Fallback chain for Coordinates
            loc = p.get("location")
            if isinstance(loc, dict):
                x = float(loc.get("x", 0.0))
                y = float(loc.get("y", 0.0))
            else:
                x = float(p.get("x", 0.0))
                y = float(p.get("y", 0.0))
                
            rot = float(p.get("rotation", 0.0))

            # Determine kind based on naming convention or componentId
            inst_lower = inst_id.lower()
            comp_lower = str(p.get("componentId", "")).lower()
            name_lower = str(p.get("name", "")).lower()
            
            if (
                inst_lower.startswith("q") or 
                inst_lower.startswith("pl_q") or 
                "qubit" in inst_lower or 
                "qubit" in comp_lower or 
                "transmon" in comp_lower or 
                name_lower.startswith("q") or 
                "qubit" in name_lower
            ):
                kind = GeometryElementKind.QUBIT
            elif (
                inst_lower.startswith("r") or 
                inst_lower.startswith("pl_r") or 
                "res" in inst_lower or 
                "resonator" in comp_lower or 
                "meander" in comp_lower or 
                name_lower.startswith("r") or 
                "res" in name_lower or 
                "resonator" in name_lower
            ):
                kind = GeometryElementKind.RESONATOR
            elif (
                inst_lower.startswith("c") or 
                inst_lower.startswith("pl_c") or 
                "coupler" in inst_lower or 
                "coupler" in comp_lower
            ):
                kind = GeometryElementKind.COUPLER
            elif (
                "feed" in inst_lower or 
                "line" in inst_lower or 
                "feedline" in comp_lower or 
                name_lower.startswith("f")
            ):
                kind = GeometryElementKind.FEEDLINE
            else:
                kind = GeometryElementKind.LAUNCHPAD

            elements.append(
                GeometryElement(
                    id=inst_id,
                    kind=kind,
                    x_mm=x,
                    y_mm=y,
                    orientation_deg=rot,
                    params=p.get("params", {}),
                )
            )

        # --- Fallback: synthesize qubit elements from frequency_plan ---
        # If design.placements is empty but frequency_plan has qubit data,
        # generate qubit elements using the grid layout parameters.
        freq_plan = payload.get("frequency_plan", {})
        qubit_freqs = freq_plan.get("qubit_frequencies_GHz", {})
        if not elements and qubit_freqs:
            logger.info(
                "No design.placements found — synthesizing %d qubit elements from frequency_plan + grid layout",
                len(qubit_freqs),
            )
            placement = payload.get("placement", {})
            pitch = float(placement.get("pitch_mm", 1.5))
            cols = int(placement.get("cols", 3))

            ej_map = freq_plan.get("EJ_GHz", {})
            ec_map = freq_plan.get("EC_GHz", {})

            for idx, (qname, freq) in enumerate(qubit_freqs.items()):
                col = idx % cols
                row = idx // cols
                x_mm = (col - (cols - 1) / 2.0) * pitch
                y_mm = (row - (max(1, len(qubit_freqs) // cols) - 1) / 2.0) * (-pitch)

                elements.append(
                    GeometryElement(
                        id=qname,
                        kind=GeometryElementKind.QUBIT,
                        x_mm=round(x_mm, 4),
                        y_mm=round(y_mm, 4),
                        orientation_deg=0.0,
                        params={
                            "frequency_ghz": freq,
                            "ej_ghz": ej_map.get(qname, 10.0),
                            "ec_ghz": ec_map.get(qname, 0.34),
                            "pad_gap_um": 30.0,
                            "pad_width_um": 455.0,
                            "pad_height_um": 90.0,
                            "pocket_width_um": 650.0,
                            "pocket_height_um": 650.0,
                        },
                    )
                )

        return EMGeometry(
            design_id=str(payload.get("id", "legacy_design")),
            chip_width_mm=10.0,
            chip_height_mm=10.0,
            substrate=str(freq_plan.get("substrate", "silicon")),
            metal=str(freq_plan.get("metal", "aluminum")),
            elements=elements,
        )
