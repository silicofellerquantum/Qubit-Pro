from __future__ import annotations
import logging
from typing import Any, Dict, Optional
from app.services.palace.models import ChipGeometry, SolverType
from app.services.palace.exceptions import ConfigGenerationError

logger = logging.getLogger(__name__)


class PalaceConfigGenerator:
    """Generates Palace-compatible JSON configurations from a normalized ChipGeometry."""

    def __init__(self, geometry: ChipGeometry) -> None:
        self.geometry = geometry

    def generate(
        self,
        solver_type: SolverType = SolverType.EIGENMODE,
        config_override: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Generate Palace configuration dictionary.

        Args:
            solver_type: The Palace simulation type (eigenmode, electrostatic, driven).
            config_override: Optional dictionary of user configurations to overwrite defaults.

        Returns:
            A dictionary conforming to the Palace config schema.
        """
        try:
            if solver_type == SolverType.EIGENMODE:
                config = self._generate_eigenmode()
            elif solver_type == SolverType.ELECTROSTATIC:
                config = self._generate_electrostatic()
            elif solver_type == SolverType.DRIVEN:
                config = self._generate_driven()
            else:
                raise ConfigGenerationError(f"Unsupported solver type: {solver_type}")

            if config_override:
                self._deep_update(config, config_override)

            return config
        except Exception as e:
            if not isinstance(e, ConfigGenerationError):
                raise ConfigGenerationError(f"Failed to generate config: {e}") from e
            raise

    def _generate_eigenmode(self) -> Dict[str, Any]:
        # Substrate permittivity
        eps_substrate = 11.7 if self.geometry.substrate.lower() == "silicon" else 10.0

        # Build boundaries and lumped ports for qubits (Josephson junctions)
        lumped_ports = []
        for i, qubit in enumerate(self.geometry.qubits, start=1):
            # Calculate Josephson inductance: L_J = 163.46 / E_J (in GHz) -> result in nH
            # In Henries: 1.6346e-7 / E_J
            ej = qubit.ej_ghz if qubit.ej_ghz > 0 else 13.0
            l_j_henries = 1.6346e-7 / ej

            # In Palace, a junction is mapped to a lumped port for EPR postprocessing
            lumped_ports.append(
                {
                    "ID": i,
                    "Name": f"JJ_{qubit.id}",
                    "R": 0.0,
                    "L": l_j_henries,
                    "C": 0.0,
                    "Attributes": [100 + i],  # Unique attribute id for junction mesh boundary
                }
            )

        return {
            "Problem": {
                "Type": "Eigenmode",
                "Verbose": 1,
            },
            "Model": {
                "Mesh": "mesh.msh",
                "Lunit": "mm",
            },
            "Domains": {
                "Materials": [
                    {
                        "Attributes": [1],  # substrate domain
                        "Permittivity": eps_substrate,
                    },
                    {
                        "Attributes": [2],  # vacuum / air domain
                        "Permittivity": 1.0,
                    },
                ],
            },
            "Boundaries": {
                "PEC": {
                    "Attributes": [10],  # ground plane mesh boundary
                },
                "LumpedPort": lumped_ports,
            },
            "Solver": {
                "Order": 1,
                "Eigenmode": {
                    "Num": len(self.geometry.qubits) * 2,
                    "Target": 5.0,  # Target frequency in GHz
                    "Tol": 1e-6,
                },
                "Linear": {
                    "Type": "Default",
                    "Tol": 1e-8,
                    "MaxIt": 100,
                },
            },
        }

    def _generate_electrostatic(self) -> Dict[str, Any]:
        eps_substrate = 11.7 if self.geometry.substrate.lower() == "silicon" else 10.0

        # Terminals for capacitance extraction
        terminals = []
        # Qubits are terminals
        for i, qubit in enumerate(self.geometry.qubits, start=1):
            terminals.append(
                {
                    "Name": f"{qubit.id}_island",
                    "Attributes": [100 + i],
                }
            )
        # Resonators are terminals
        for i, resonator in enumerate(self.geometry.resonators, start=1):
            terminals.append(
                {
                    "Name": resonator.id,
                    "Attributes": [200 + i],
                }
            )

        return {
            "Problem": {
                "Type": "Electrostatic",
                "Verbose": 1,
            },
            "Model": {
                "Mesh": "mesh.msh",
                "Lunit": "mm",
            },
            "Domains": {
                "Materials": [
                    {
                        "Attributes": [1],
                        "Permittivity": eps_substrate,
                    },
                    {
                        "Attributes": [2],
                        "Permittivity": 1.0,
                    },
                ],
            },
            "Boundaries": {
                "PEC": {
                    "Attributes": [10],
                },
                "Terminal": terminals,
            },
            "Solver": {
                "Order": 1,
                "Electrostatic": {
                    "Save": len(terminals),
                },
                "Linear": {
                    "Type": "Default",
                    "Tol": 1e-8,
                    "MaxIt": 100,
                },
            },
        }

    def _generate_driven(self) -> Dict[str, Any]:
        eps_substrate = 11.7 if self.geometry.substrate.lower() == "silicon" else 10.0

        # Driven simulation maps lumped ports with excitations
        lumped_ports = []
        for i, resonator in enumerate(self.geometry.resonators, start=1):
            lumped_ports.append(
                {
                    "ID": i,
                    "Name": f"Port_{resonator.id}",
                    "R": 50.0,  # 50 Ohm port
                    "L": 0.0,
                    "C": 0.0,
                    "Attributes": [200 + i],
                    "Excitation": True if i == 1 else False,  # Excite the first resonator port
                }
            )

        return {
            "Problem": {
                "Type": "Driven",
                "Verbose": 1,
            },
            "Model": {
                "Mesh": "mesh.msh",
                "Lunit": "mm",
            },
            "Domains": {
                "Materials": [
                    {
                        "Attributes": [1],
                        "Permittivity": eps_substrate,
                    },
                    {
                        "Attributes": [2],
                        "Permittivity": 1.0,
                    },
                ],
            },
            "Boundaries": {
                "PEC": {
                    "Attributes": [10],
                },
                "LumpedPort": lumped_ports,
            },
            "Solver": {
                "Order": 1,
                "Driven": {
                    "MinFreq": 4.0,
                    "MaxFreq": 8.0,
                    "FreqStep": 0.01,
                },
                "Linear": {
                    "Type": "Default",
                    "Tol": 1e-8,
                    "MaxIt": 100,
                },
            },
        }

    def _deep_update(self, d: Dict[str, Any], u: Dict[str, Any]) -> Dict[str, Any]:
        for k, v in u.items():
            if isinstance(v, dict):
                d[k] = self._deep_update(d.get(k, {}), v)
            else:
                d[k] = v
        return d
