from __future__ import annotations
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Union

# Robust sys.path injection to import physics_engine models
try:
    current_file = Path(__file__).resolve()
    # Path is: backend/app/services/palace/em_adapter.py
    # parents[3] is: backend/
    backend_dir = current_file.parents[3]
except Exception:
    backend_dir = Path("c:/Users/ASUS/Desktop/Qubit-Pro/backend").resolve()

physics_src = backend_dir / "physics_analysis" / "src"
if physics_src.exists() and str(physics_src) not in sys.path:
    sys.path.insert(0, str(physics_src))

from physics_engine.models.design_spec import (
    DesignSpec,
    QubitSpec,
    ResonatorSpec,
    CouplerSpec,
    JunctionParams,
    QubitTargets,
    GlobalConstraints,
    NoiseEnvironment,
)
from physics_engine.models.em_results import (
    EMResults,
    ElectrostaticResults,
    CapacitanceMatrix,
    EigenmodeSuite,
    EigenmodeResult,
)
from physics_engine.models.enums import CouplerType, QubitType, ResonatorType
from app.core.design_graph.graph import DesignGraph
from app.core.design_graph.serializer import dict_to_graph
from app.core.design_graph.node import NodeKind
from app.services.palace.result_parser import PalaceSimulationOutputs

logger = logging.getLogger(__name__)


def build_em_results(
    simulation_id: str,
    design_id: str,
    parsed: PalaceSimulationOutputs,
) -> EMResults:
    """Build EMResults from parsed Palace simulation outputs."""
    # Convert electrostatic / capacitance matrix
    electrostatic = None
    if parsed.capacitance:
        cap_matrix = CapacitanceMatrix(
            units="fF",
            terminal_ids=parsed.capacitance.terminal_ids,
            matrix=parsed.capacitance.matrix,
        )
        electrostatic = ElectrostaticResults(capacitance_matrix=cap_matrix)

    # Convert eigenmodes
    eigenmode = None
    if parsed.eigenmodes:
        modes = []
        for em in parsed.eigenmodes:
            modes.append(
                EigenmodeResult(
                    mode_index=em.mode_index,
                    frequency_ghz=em.frequency_ghz,
                    quality_factor=em.quality_factor,
                    epr=em.epr,
                )
            )
        eigenmode = EigenmodeSuite(modes=modes)

    return EMResults(
        simulation_id=simulation_id,
        timestamp=datetime.now(timezone.utc).isoformat(),
        design_id=design_id,
        electrostatic=electrostatic,
        magnetostatic=None,
        eigenmode=eigenmode,
    )


def build_design_spec(
    design_id: str,
    project_name: str,
    payload_or_graph: Union[dict, DesignGraph],
) -> DesignSpec:
    """Build DesignSpec matching the given payload or DesignGraph."""
    if isinstance(payload_or_graph, DesignGraph):
        graph = payload_or_graph
    elif isinstance(payload_or_graph, dict):
        payload = payload_or_graph
        graph_dict = None
        if "v2" in payload and "graph" in payload["v2"]:
            graph_dict = payload["v2"]["graph"]
        elif "graph" in payload:
            graph_dict = payload["graph"]

        if graph_dict:
            graph = dict_to_graph(graph_dict)
        else:
            # Reconstruct dummy graph from payload fields (frequency plan, etc.)
            from app.services.palace.geometry_builder import build_geometry
            geom = build_geometry(payload)
            # Make a design graph from geometry
            graph = DesignGraph(
                chip_name=project_name or geom.chip_name,
                substrate=geom.substrate,
                metal=geom.metal,
            )
            # Recreate nodes
            for qg in geom.qubits:
                from app.core.design_graph.node import QubitNode
                qn = QubitNode(
                    id=qg.id,
                    frequency_ghz=qg.frequency_ghz,
                    anharmonicity_ghz=qg.anharmonicity_ghz,
                    ej_ghz=qg.ej_ghz,
                    ec_ghz=qg.ec_ghz,
                )
                graph.add_node(qn)
            for rg in geom.resonators:
                from app.core.design_graph.node import ResonatorNode
                rn = ResonatorNode(
                    id=rg.id,
                    frequency_ghz=rg.frequency_ghz,
                    length_mm=rg.length_mm,
                    detuning_ghz=rg.detuning_ghz,
                    target_qubit_id=rg.target_qubit_id,
                )
                graph.add_node(rn)
            for cg in geom.couplers:
                from app.core.design_graph.node import CouplerNode
                cn = CouplerNode(
                    id=cg.id,
                    qubit_a_id=cg.qubit_a_id,
                    qubit_b_id=cg.qubit_b_id,
                    strength_mhz=cg.strength_mhz,
                )
                graph.add_node(cn)
    else:
        raise TypeError(f"Unsupported payload or graph type: {type(payload_or_graph)}")

    qubits = []
    resonators = []
    couplers = []

    # Map design graph nodes to spec elements
    for node in graph.nodes:
        kind = node.kind.value if hasattr(node.kind, "value") else str(node.kind)

        if kind == NodeKind.QUBIT.value:
            # Map qubit type string to enums
            q_type = QubitType.TRANSMON
            node_type_str = node.qubit_type.value if hasattr(node.qubit_type, "value") else str(node.qubit_type)
            if node_type_str == "fluxonium":
                q_type = QubitType.FLUXONIUM
            elif node_type_str == "flux_qubit":
                q_type = QubitType.FLUX_QUBIT

            qubits.append(
                QubitSpec(
                    qubit_id=node.id,
                    type=q_type,
                    junction_params=JunctionParams(
                        EJ_ghz=node.ej_ghz,
                        critical_current_nA=30.0,
                    ),
                    capacitance_terminal_id=f"{node.id}_island",
                    junction_id=f"JJ_{node.id}",
                    targets=QubitTargets(
                        frequency_ghz=node.frequency_ghz,
                        anharmonicity_mhz=node.anharmonicity_ghz * 1000.0,
                        T1_min_us=node.t1_us if getattr(node, "t1_us", 0.0) > 0.0 else 50.0,
                        T2_min_us=node.t2_us if getattr(node, "t2_us", 0.0) > 0.0 else 30.0,
                    ),
                )
            )

        elif kind == NodeKind.RESONATOR.value:
            res_type = ResonatorType.READOUT
            node_res_str = node.resonator_type.value if hasattr(node.resonator_type, "value") else str(node.resonator_type)
            if node_res_str == "bus":
                res_type = ResonatorType.BUS

            resonators.append(
                ResonatorSpec(
                    resonator_id=node.id,
                    type=res_type,
                    coupled_to=node.target_qubit_id,
                    capacitance_terminal_id=node.id,
                    target_frequency_ghz=node.frequency_ghz,
                    target_kappa_khz=500.0,
                )
            )

        elif kind == NodeKind.COUPLER.value:
            c_type = CouplerType.CAPACITIVE
            node_c_str = node.coupler_type.value if hasattr(node.coupler_type, "value") else str(node.coupler_type)
            if node_c_str == "tunable":
                c_type = CouplerType.TUNABLE
            elif node_c_str == "bus":
                c_type = CouplerType.BUS

            # Connects requires a list of qubits
            connects_list = []
            if node.qubit_a_id:
                connects_list.append(node.qubit_a_id)
            if node.qubit_b_id:
                connects_list.append(node.qubit_b_id)
            # Ensure connects has exactly 2 elements
            while len(connects_list) < 2:
                connects_list.append(f"DummyQubit_{len(connects_list)}")

            couplers.append(
                CouplerSpec(
                    coupler_id=node.id,
                    type=c_type,
                    connects=connects_list[:2],
                    target_coupling_mhz=node.strength_mhz if getattr(node, "strength_mhz", 0.0) > 0.0 else 10.0,
                    max_zz_khz=50.0,
                )
            )

    # Reconstruct design spec
    return DesignSpec(
        design_id=design_id,
        project_name=project_name or graph.chip_name,
        qubits=qubits,
        resonators=resonators,
        couplers=couplers,
        global_constraints=GlobalConstraints(),
        noise_environment=NoiseEnvironment(),
    )
