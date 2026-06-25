"""EM adapter module.

Converts Palace parsed simulation outputs into the structure compatible with
the downstream Physics Analysis Pipeline (EMResults). Also generates a
DesignSpec object from the design payload.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, Dict

# Automatically register physics_analysis/src in Python path for package lookup
physics_src_path = str(Path(__file__).resolve().parents[3] / "physics_analysis" / "src")
if physics_src_path not in sys.path:
    sys.path.insert(0, physics_src_path)

from physics_engine.models.em_results import (
    CapacitanceMatrix,
    EigenmodeResult,
    EigenmodeSuite,
    ElectrostaticResults,
    EMResults,
    MagnetostaticResults,
    InductanceEntry,
)
from physics_engine.models.design_spec import (
    CouplerSpec,
    DesignSpec,
    GlobalConstraints,
    JunctionParams,
    NoiseEnvironment,
    QubitSpec,
    QubitTargets,
    ResonatorSpec,
)
from physics_engine.models.enums import CouplerType, QubitType, ResonatorType

from app.core.design_graph.graph import DesignGraph
from app.core.design_graph.serializer import dict_to_graph
from app.services.palace.exceptions import AdapterError
from app.services.palace.models import PalaceSimulationOutput


class EMAdapter:
    """Translation layer between Palace solver outputs and downstream physics pipeline."""

    @staticmethod
    def to_em_results(palace_out: PalaceSimulationOutput) -> EMResults:
        """Translate Palace parsed simulation output to the standard EMResults model."""
        try:
            electrostatic = None
            if palace_out.electrostatic:
                electrostatic = ElectrostaticResults(
                    capacitance_matrix=CapacitanceMatrix(
                        units=palace_out.electrostatic.units,
                        terminal_ids=palace_out.electrostatic.terminal_ids,
                        matrix=palace_out.electrostatic.matrix,
                    )
                )

            magnetostatic = None
            if palace_out.magnetostatic:
                inductances = []
                for entry in palace_out.magnetostatic.inductance_data:
                    inductances.append(
                        InductanceEntry(
                            element_id=entry.element_id,
                            inductance_nH=entry.inductance_nH
                        )
                    )
                magnetostatic = MagnetostaticResults(inductance_data=inductances)

            eigenmode = None
            if palace_out.eigenmode:
                modes = []
                for m in palace_out.eigenmode.modes:
                    modes.append(
                        EigenmodeResult(
                            mode_index=m.mode_index,
                            frequency_ghz=m.frequency_ghz,
                            quality_factor=m.quality_factor,
                            epr=m.epr,
                        )
                    )
                eigenmode = EigenmodeSuite(modes=modes)

            return EMResults(
                simulation_id=palace_out.simulation_id,
                timestamp=palace_out.timestamp,
                design_id=palace_out.design_id,
                electrostatic=electrostatic,
                magnetostatic=magnetostatic,
                eigenmode=eigenmode,
            )
        except Exception as e:
            raise AdapterError(f"Failed to map Palace results to EMResults: {e}") from e

    @staticmethod
    def build_design_spec_from_payload(payload: Dict[str, Any]) -> DesignSpec:
        """Build a DesignSpec from the design payload.

        Extracts specifications from the V2 DesignGraph first, falling back to legacy flat parameters.
        """
        try:
            v2_data = payload.get("v2", {})
            graph_dict = v2_data.get("graph")

            if graph_dict:
                graph = dict_to_graph(graph_dict)
                return EMAdapter.from_design_graph(graph, payload)

            return EMAdapter.from_legacy_payload(payload)
        except Exception as e:
            raise AdapterError(f"Failed to build DesignSpec from design payload: {e}") from e

    @staticmethod
    def from_design_graph(graph: DesignGraph, payload: Dict[str, Any]) -> DesignSpec:
        """Create a DesignSpec object from a DesignGraph."""
        qubits_spec = []
        for q in graph.qubits:
            # Map QubitType
            try:
                q_type_str = q.qubit_type.value if hasattr(q.qubit_type, "value") else str(q.qubit_type)
                q_type = QubitType(q_type_str.lower())
            except (ValueError, AttributeError):
                q_type = QubitType.TRANSMON

            qubits_spec.append(
                QubitSpec(
                    qubit_id=q.id,
                    type=q_type,
                    junction_params=JunctionParams(
                        EJ_ghz=float(q.ej_ghz) if q.ej_ghz is not None else 20.0,
                        junction_area_um2=0.1,
                    ),
                    # Use q.id directly — Palace names terminals as `terminal_<q.id>` in the mesh,
                    # then the CSV output uses `<q.id>` as the terminal name.
                    # The fuzzy matching in CapacitanceMatrix._resolve_terminal_idx handles
                    # both long IDs (comp_pl_Q0_1781759587922) and short IDs (Q0_island).
                    capacitance_terminal_id=f"{q.id}_island",
                    junction_id=f"JJ_{q.id}",
                    targets=QubitTargets(
                        frequency_ghz=float(q.frequency_ghz) if q.frequency_ghz is not None else 5.0,
                        frequency_tolerance_ghz=0.15,
                        anharmonicity_mhz=float(q.anharmonicity_ghz * 1000) if q.anharmonicity_ghz is not None else -250.0,
                        anharmonicity_tolerance_mhz=30.0,
                        T1_min_us=80.0,
                        T2_min_us=40.0,
                    ),
                )
            )

        resonators_spec = []
        for r in graph.resonators:
            # Map ResonatorType
            try:
                r_type_str = r.resonator_type.value if hasattr(r.resonator_type, "value") else str(r.resonator_type)
                r_type = ResonatorType(r_type_str.lower())
            except (ValueError, AttributeError):
                r_type = ResonatorType.READOUT

            resonators_spec.append(
                ResonatorSpec(
                    resonator_id=r.id,
                    type=r_type,
                    coupled_to=r.target_qubit_id or "",
                    capacitance_terminal_id=f"comp_{r.id}",
                    target_frequency_ghz=float(r.frequency_ghz) if r.frequency_ghz is not None else 7.0,
                    target_kappa_khz=500.0,
                )
            )

        couplers_spec = []
        for c in graph.couplers:
            # Map CouplerType
            try:
                c_type_str = c.coupler_type.value if hasattr(c.coupler_type, "value") else str(c.coupler_type)
                c_type = CouplerType(c_type_str.lower())
            except (ValueError, AttributeError):
                c_type = CouplerType.CAPACITIVE

            couplers_spec.append(
                CouplerSpec(
                    coupler_id=c.id,
                    type=c_type,
                    connects=[c.qubit_a_id, c.qubit_b_id],
                    target_coupling_mhz=float(c.strength_mhz) if c.strength_mhz is not None else 5.0,
                    max_zz_khz=50.0,
                )
            )

        return DesignSpec(
            design_id=graph.chip_name or "design_v2",
            project_name=payload.get("project_name", "V2 Project"),
            qubits=qubits_spec,
            resonators=resonators_spec,
            couplers=couplers_spec,
            global_constraints=GlobalConstraints(),
            noise_environment=NoiseEnvironment(),
        )

    @staticmethod
    def from_legacy_payload(payload: Dict[str, Any]) -> DesignSpec:
        """Create a DesignSpec object from a legacy flat layout payload."""
        design = payload.get("design", {})
        placements = design.get("placements", [])

        qubits_spec = []
        resonators_spec = []
        couplers_spec = []

        for p in placements:
            inst_id = p.get("instanceId") or p.get("instance_id") or p.get("id") or p.get("name") or ""
            inst_upper = inst_id.upper()
            comp_lower = str(p.get("componentId", "")).lower()
            
            if inst_upper.startswith("Q") or "qubit" in inst_upper or "qubit" in comp_lower:
                qubits_spec.append(
                    QubitSpec(
                        qubit_id=inst_id,
                        type=QubitType.TRANSMON,
                        junction_params=JunctionParams(EJ_ghz=20.0),
                        capacitance_terminal_id=f"{inst_id}_island",
                        junction_id=f"JJ_{inst_id}",
                        targets=QubitTargets(
                            frequency_ghz=5.0,
                            anharmonicity_mhz=-250.0,
                        ),
                    )
                )
            elif inst_upper.startswith("R") or "RES" in inst_upper or "resonator" in comp_lower:
                coupled_qubit = qubits_spec[0].qubit_id if qubits_spec else "Q1"
                resonators_spec.append(
                    ResonatorSpec(
                        resonator_id=inst_id,
                        type=ResonatorType.READOUT,
                        coupled_to=coupled_qubit,
                        capacitance_terminal_id=inst_id,
                        target_frequency_ghz=7.0,
                    )
                )
            elif inst_upper.startswith("C") or "COUPLER" in inst_upper or "coupler" in comp_lower:
                couplers_spec.append(
                    CouplerSpec(
                        coupler_id=inst_id,
                        type=CouplerType.CAPACITIVE,
                        connects=["Q1", "Q2"],
                        target_coupling_mhz=5.0,
                    )
                )

        if not qubits_spec:
            qubits_spec.append(
                QubitSpec(
                    qubit_id="Q1",
                    type=QubitType.TRANSMON,
                    junction_params=JunctionParams(EJ_ghz=20.0),
                    targets=QubitTargets(
                        frequency_ghz=5.0,
                        anharmonicity_mhz=-250.0,
                    ),
                )
            )

        return DesignSpec(
            design_id=str(payload.get("id", "legacy_design")),
            project_name="Legacy Project",
            qubits=qubits_spec,
            resonators=resonators_spec,
            couplers=couplers_spec,
            global_constraints=GlobalConstraints(),
            noise_environment=NoiseEnvironment(),
        )
