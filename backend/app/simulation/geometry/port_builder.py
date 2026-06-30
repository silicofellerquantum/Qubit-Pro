"""Port builder and validator for the simulation geometry builder."""

from __future__ import annotations

import math
from app.simulation.geometry.exceptions import InvalidPortError
from app.simulation.geometry.geometry_models import LogicalPort


class PortBuilder:
    """Constructs and validates logical ports for electromagnetic simulations."""

    @staticmethod
    def build_port(
        port_id: str,
        x_mm: float,
        y_mm: float,
        orientation_deg: float,
        reference_layer: str,
        associated_component_id: str,
    ) -> LogicalPort:
        """Create a validated LogicalPort instance.

        Args:
            port_id: Unique port identifier.
            x_mm: Global X coordinate of the port.
            y_mm: Global Y coordinate of the port.
            orientation_deg: Port orientation angle.
            reference_layer: Fabrication layer the port is defined on.
            associated_component_id: Component ID that owns this port.

        Returns:
            A populated, schema-validated LogicalPort model.

        Raises:
            InvalidPortError: If port parameters are physically invalid.
        """
        # Validate ID
        p_id_clean = port_id.strip()
        if not p_id_clean:
            raise InvalidPortError("Port identifier cannot be empty.")

        # Validate coordinates (check for NaN or Infinities)
        if not math.isfinite(x_mm) or not math.isfinite(y_mm):
            raise InvalidPortError(f"Port '{port_id}' coordinates must be finite: ({x_mm}, {y_mm})")

        # Validate orientation
        if not math.isfinite(orientation_deg):
            raise InvalidPortError(f"Port '{port_id}' orientation must be finite: {orientation_deg}")

        # Normalize orientation to [0, 360)
        norm_orientation = float(orientation_deg % 360.0)

        # Validate associated component
        c_id_clean = associated_component_id.strip()
        if not c_id_clean:
            raise InvalidPortError(f"Port '{port_id}' must be associated with a valid component ID.")

        return LogicalPort(
            id=p_id_clean,
            x_mm=float(x_mm),
            y_mm=float(y_mm),
            orientation_deg=norm_orientation,
            reference_layer=reference_layer.strip().lower(),
            associated_component_id=c_id_clean,
        )
