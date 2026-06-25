from __future__ import annotations
import logging
from typing import Any, Dict, Union

from app.core.design_graph.graph import DesignGraph
from app.core.design_graph.serializer import dict_to_graph
from app.core.design_graph.node import NodeKind
from app.services.palace.exceptions import GeometryExtractionError
from app.services.palace.models import (
    ChipGeometry,
    QubitGeom,
    ResonatorGeom,
    CouplerGeom,
    FeedlineGeom,
    LaunchpadGeom,
)

logger = logging.getLogger(__name__)


def build_geometry(payload_or_graph: Union[dict, DesignGraph]) -> ChipGeometry:
    """Build normalized electromagnetic geometry from a design payload dictionary or a DesignGraph.

    Uses actual project fields such as payload["frequency_plan"], payload["design"],
    and payload["v2"]["graph"].
    """
    if isinstance(payload_or_graph, DesignGraph):
        graph = payload_or_graph
        chip_name = graph.chip_name
        width_mm = graph.chip_width_mm
        height_mm = graph.chip_height_mm
        substrate = graph.substrate
        metal = graph.metal
    elif isinstance(payload_or_graph, dict):
        payload = payload_or_graph
        # Try to deserialize the graph from v2
        graph_dict = None
        if "v2" in payload and "graph" in payload["v2"]:
            graph_dict = payload["v2"]["graph"]
        elif "graph" in payload:
            graph_dict = payload["graph"]

        if graph_dict:
            try:
                graph = dict_to_graph(graph_dict)
                chip_name = graph.chip_name
                width_mm = graph.chip_width_mm
                height_mm = graph.chip_height_mm
                substrate = graph.substrate
                metal = graph.metal
            except Exception as e:
                raise GeometryExtractionError(f"Failed to deserialize DesignGraph from payload: {e}") from e
        else:
            # Fallback to manual extraction from payload structures if graph is missing
            fp = payload.get("frequency_plan", {})
            material = payload.get("material", {})
            substrate = material.get("substrate", fp.get("substrate", "silicon"))
            metal = material.get("metal", fp.get("metal", "aluminum"))
            chip_name = payload.get("label", "QuantumChip")
            width_mm = 10.0
            height_mm = 10.0
            
            # Create a dummy DesignGraph to populate nodes manually
            graph = DesignGraph(
                chip_name=chip_name,
                chip_width_mm=width_mm,
                chip_height_mm=height_mm,
                substrate=substrate,
                metal=metal,
            )
            # Try to populate qubits from frequency_plan
            q_freqs = fp.get("qubit_frequencies_GHz", {})
            ej_map = fp.get("EJ_GHz", {})
            ec_map = fp.get("EC_GHz", {})
            for q_id, q_freq in q_freqs.items():
                from app.core.design_graph.node import QubitNode
                qn = QubitNode(
                    id=q_id,
                    frequency_ghz=q_freq,
                    ej_ghz=ej_map.get(q_id, 0.0),
                    ec_ghz=ec_map.get(q_id, 0.0),
                )
                graph.add_node(qn)
                
            # Try to populate resonators from frequency_plan
            r_freqs = fp.get("resonator_frequencies_GHz", {})
            r_lens = fp.get("resonator_lengths_mm", {})
            r_detunings = fp.get("detunings_GHz", {})
            for r_id, r_freq in r_freqs.items():
                from app.core.design_graph.node import ResonatorNode
                rn = ResonatorNode(
                    id=r_id,
                    frequency_ghz=r_freq,
                    length_mm=r_lens.get(r_id, 7.5),
                    detuning_ghz=r_detunings.get(r_id, 1.5),
                    target_qubit_id=f"Q{r_id[1:]}"  # E.g., R0 -> Q0
                )
                graph.add_node(rn)

            # Try to overlay placements if they exist in payload["placement"]
            placement = payload.get("placement", {})
            if placement:
                for q_place in placement.get("qubits", []):
                    qn_id = q_place.get("name")
                    if graph.has_node(qn_id):
                        qn_node = graph.get_node(qn_id)
                        qn_node.x_mm = q_place.get("x")
                        qn_node.y_mm = q_place.get("y")
    else:
        raise GeometryExtractionError(f"Unsupported payload or graph type: {type(payload_or_graph)}")

    qubits = []
    resonators = []
    couplers = []
    feedlines = []
    launchpads = []

    for node in graph.nodes:
        kind = node.kind.value if hasattr(node.kind, "value") else str(node.kind)
        x = node.x_mm if node.x_mm is not None else 0.0
        y = node.y_mm if node.y_mm is not None else 0.0

        if kind == NodeKind.QUBIT.value:
            qubits.append(
                QubitGeom(
                    id=node.id,
                    x_mm=x,
                    y_mm=y,
                    type=node.qubit_type.value if hasattr(node.qubit_type, "value") else str(node.qubit_type),
                    design_options=node.design_options or {},
                    frequency_ghz=node.frequency_ghz,
                    anharmonicity_ghz=node.anharmonicity_ghz,
                    ej_ghz=node.ej_ghz,
                    ec_ghz=node.ec_ghz,
                )
            )
        elif kind == NodeKind.RESONATOR.value:
            resonators.append(
                ResonatorGeom(
                    id=node.id,
                    x_mm=x,
                    y_mm=y,
                    type=node.resonator_type.value if hasattr(node.resonator_type, "value") else str(node.resonator_type),
                    length_mm=node.length_mm,
                    detuning_ghz=node.detuning_ghz,
                    frequency_ghz=node.frequency_ghz,
                    target_qubit_id=node.target_qubit_id,
                    design_options=node.design_options or {},
                )
            )
        elif kind == NodeKind.COUPLER.value:
            couplers.append(
                CouplerGeom(
                    id=node.id,
                    x_mm=x,
                    y_mm=y,
                    type=node.coupler_type.value if hasattr(node.coupler_type, "value") else str(node.coupler_type),
                    qubit_a_id=node.qubit_a_id,
                    qubit_b_id=node.qubit_b_id,
                    strength_mhz=node.strength_mhz,
                    design_options=node.design_options or {},
                )
            )
        elif kind == NodeKind.FEEDLINE.value:
            feedlines.append(
                FeedlineGeom(
                    id=node.id,
                    x_mm=x,
                    y_mm=y,
                    length_mm=node.length_mm,
                    design_options=node.design_options or {},
                )
            )
        elif kind == NodeKind.LAUNCHPAD.value:
            launchpads.append(
                LaunchpadGeom(
                    id=node.id,
                    x_mm=x,
                    y_mm=y,
                    style=node.style.value if hasattr(node.style, "value") else str(node.style),
                    design_options=node.design_options or {},
                )
            )

    return ChipGeometry(
        chip_name=chip_name,
        width_mm=width_mm,
        height_mm=height_mm,
        substrate=substrate,
        metal=metal,
        qubits=qubits,
        resonators=resonators,
        couplers=couplers,
        feedlines=feedlines,
        launchpads=launchpads,
    )
