"""Palace configuration generator.

Generates Palace-compatible JSON configuration structures based on solver
types and normalized chip geometries.
"""

from __future__ import annotations

import logging
from typing import Any, Dict
from app.services.palace.exceptions import ConfigGeneratorError
from app.services.palace.models import EMGeometry, PalaceSolverType, GeometryElementKind

logger = logging.getLogger(__name__)


class ConfigGenerator:
    """Generator for Palace JSON configuration files."""

    @staticmethod
    def generate_config(
        geometry: EMGeometry,
        solver_type: PalaceSolverType,
        mesh_file: str = "mesh.msh",
        output_dir: str = "out",
        **kwargs: Any
    ) -> Dict[str, Any]:
        """Generate a Palace configuration dictionary.

        Args:
            geometry: The normalized EMGeometry of the chip.
            solver_type: The Palace solver formulation to use.
            mesh_file: Name/path of the mesh file inside the job directory.
            output_dir: Output subdirectory name.

        Returns:
            A dictionary matching the Palace JSON schema.

        Raises:
            ConfigGeneratorError: If configuration generation fails.
        """
        logger.info(
            "Generating Palace config: design_id=%s, solver_type=%s, mesh_file=%s, output_dir=%s",
            geometry.design_id, solver_type.value, mesh_file, output_dir
        )
        try:
            # Map solver type to Palace-compliant titlecase string
            solver_str = {
                PalaceSolverType.EIGENMODE: "Eigenmode",
                PalaceSolverType.ELECTROSTATIC: "Electrostatic",
                PalaceSolverType.DRIVEN: "Driven",
                PalaceSolverType.MAGNETOSTATIC: "Magnetostatic",
            }[solver_type]

            # 1. Problem block
            problem = {
                "Type": solver_str,
                "Verbose": kwargs.get("verbose", 1),
                "Output": output_dir,
                "OutputFormats": {
                    "Paraview": True,
                }
            }

            # 2. Model block
            model = {
                "Mesh": mesh_file,
                "L0": 1e-3,  # Coordinates are in millimeters
            }

            # 3. Domains block
            # Assign attribute 1 to vacuum (air box) and attribute 2 to dielectric substrate
            permittivity = 11.7  # Default silicon
            if geometry.substrate.lower() == "sapphire":
                permittivity = 9.8
            elif geometry.substrate.lower() == "silicon_nitride":
                permittivity = 7.5

            domains = {
                "Materials": [
                    {
                        "Attributes": [1],  # Air / vacuum
                        "Permittivity": 1.0,
                    },
                    {
                        "Attributes": [2],  # Substrate
                        "Permittivity": permittivity,
                    },
                ]
            }

            # 4. Boundaries block
            # Default PEC (Perfect Electric Conductor) representing ground plane is attribute 3
            pec_attrs = [3]
            boundaries: Dict[str, Any] = {
                "PEC": {
                    "Attributes": pec_attrs,
                }
            }

            # Map terminals / ports based on solver type
            if solver_type == PalaceSolverType.ELECTROSTATIC:
                # Electrostatic simulation requires "Terminal" boundaries
                terminals = []
                # Find all terminals (qubit islands and resonators)
                # Assign attributes starting from 10 onwards
                curr_attr = 10
                for el in geometry.elements:
                    if el.kind in (GeometryElementKind.QUBIT, GeometryElementKind.RESONATOR):
                        terminals.append({
                            "Index": len(terminals) + 1,
                            "Attributes": [curr_attr],
                        })
                        curr_attr += 1
                if not terminals:
                    raise ConfigGeneratorError(
                        "No terminals (qubit islands or resonators) found in design geometry. "
                        "Electrostatic simulation requires at least one terminal boundary."
                    )
                boundaries["Terminal"] = terminals

            elif solver_type == PalaceSolverType.MAGNETOSTATIC:
                # Magnetostatic simulation uses "LumpedPort" boundaries to calculate the inductance matrix
                lumped_ports = []
                curr_attr = 10
                for el in geometry.elements:
                    if el.kind in (GeometryElementKind.QUBIT, GeometryElementKind.RESONATOR):
                        lumped_ports.append({
                            "Index": len(lumped_ports) + 1,
                            "Attributes": [curr_attr],
                            "R": 1.0,
                            "L": 0.0,
                            "Direction": "+X",
                        })
                        curr_attr += 1
                if not lumped_ports:
                    raise ConfigGeneratorError(
                        "No terminals (qubit islands or resonators) found in design geometry. "
                        "Magnetostatic simulation requires at least one port boundary."
                    )
                boundaries["LumpedPort"] = lumped_ports

            elif solver_type == PalaceSolverType.EIGENMODE:
                # Eigenmode simulation requires "LumpedPort" boundaries for EPR analysis
                lumped_ports = []
                curr_attr = 100
                for qubit in geometry.qubits:
                    # Josephson junctions are represented as lumped ports with inductance/resistance/capacitance
                    lumped_ports.append({
                        "Index": len(lumped_ports) + 1,
                        "R": 0.0,
                        "L": float(qubit.params.get("L_nH", 10.0)),  # Junction inductance
                        "Attributes": [curr_attr],
                        "Direction": "+X",  # Default direction
                    })
                    curr_attr += 1
                boundaries["LumpedPort"] = lumped_ports

            # 5. Solver block
            solver: Dict[str, Any] = {
                "Order": kwargs.get("order", 1),
                "Linear": {
                    "Type": "Default",
                    "Tol": kwargs.get("tol", 1e-8),
                    "MaxIts": kwargs.get("max_its", 100),
                }
            }

            if solver_type == PalaceSolverType.EIGENMODE:
                # Target average frequency of qubits or default to 5.0 GHz
                freqs = [q.params.get("frequency_ghz", 5.0) for q in geometry.qubits]
                target_freq = sum(freqs) / len(freqs) if freqs else 5.0
                n_modes = len(geometry.qubits) + len(geometry.resonators) + 2
                solver["Eigenmode"] = {
                    "N": n_modes,  # Search modes
                    "Target": target_freq * 1.0e9,  # Convert GHz to Hz
                    "Save": n_modes,  # Save all computed modes for 3D visualization
                }
            elif solver_type == PalaceSolverType.ELECTROSTATIC:
                solver["Electrostatic"] = {
                    "Save": 1,
                }
            elif solver_type == PalaceSolverType.MAGNETOSTATIC:
                solver["Magnetostatic"] = {
                    "Save": 1,
                }
            elif solver_type == PalaceSolverType.DRIVEN:
                solver["Driven"] = {
                    "MinFreq": kwargs.get("min_freq", 1.0) * 1.0e9,
                    "MaxFreq": kwargs.get("max_freq", 10.0) * 1.0e9,
                    "FreqStep": kwargs.get("freq_step", 0.1) * 1.0e9,
                }

            config = {
                "Problem": problem,
                "Model": model,
                "Domains": domains,
                "Boundaries": boundaries,
                "Solver": solver,
            }
            logger.info("Palace config generated successfully. solver=%s", problem["Type"])
            return config

        except Exception as e:
            logger.exception("Failed to generate Palace configuration.")
            raise ConfigGeneratorError(f"Failed to generate Palace config: {e}") from e
