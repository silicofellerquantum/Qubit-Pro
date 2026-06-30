"""Component Factory for instantiating quantum layout components and their ports."""

from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Tuple

from app.simulation.geometry.constants import LAYER_JUNCTION, LAYER_METAL
from app.simulation.geometry.exceptions import GeometryValidationError, UnsupportedComponentError
from app.simulation.geometry.geometry_models import GeometryComponent, GeometryComponentKind, LogicalPort
from app.simulation.geometry.port_builder import PortBuilder


class ComponentFactory:
    """Factory to instantiate physical layout components and generate their logical ports."""

    @staticmethod
    def create_component(
        component_id: str,
        kind: str | GeometryComponentKind,
        x_mm: float,
        y_mm: float,
        orientation_deg: float = 0.0,
        layer: str = LAYER_METAL,
        material: str = "aluminum",
        params: Optional[Dict[str, Any]] = None,
    ) -> Tuple[GeometryComponent, List[LogicalPort]]:
        """Instantiate a component and generate its associated logical ports.

        Args:
            component_id: Unique identifier.
            kind: The kind of component (e.g. 'qubit', 'resonator').
            x_mm: Center X coordinate.
            y_mm: Center Y coordinate.
            orientation_deg: Orientation in degrees.
            layer: Fabrication layer.
            material: Material name.
            params: Dictionary of physical parameters.

        Returns:
            A tuple of (GeometryComponent, List[LogicalPort]).

        Raises:
            UnsupportedComponentError: If the kind is not recognized.
            GeometryValidationError: If parameters are invalid.
        """
        c_id_clean = component_id.strip()
        if not c_id_clean:
            raise GeometryValidationError("Component ID cannot be empty.")

        # Convert kind to enum
        try:
            c_kind = GeometryComponentKind(kind)
        except ValueError:
            raise UnsupportedComponentError(
                f"Unsupported component kind: '{kind}'. "
                f"Allowed: {[k.value for k in GeometryComponentKind]}"
            )

        p = params or {}
        local_ports: List[LogicalPort] = []
        local_bbox: Tuple[float, float, float, float] = (0.0, 0.0, 0.0, 0.0)

        # Helper to parse dimensions safely
        def get_param(keys: List[str], default_val: float) -> float:
            for k in keys:
                if k in p and p[k] is not None:
                    try:
                        return float(p[k])
                    except (ValueError, TypeError):
                        pass
            return default_val

        # Generate component-specific geometry and ports
        if c_kind == GeometryComponentKind.QUBIT:
            # Transmon Qubit
            pad_width = get_param(["cross_width", "pad_width_um", "pad_width"], 455.0)
            pad_height = get_param(["cross_length", "pad_height_um", "pad_height"], 90.0)
            pad_gap = get_param(["cross_gap", "pad_gap_um", "pad_gap"], 30.0)
            pocket_width = get_param(["pocket_width_um", "pocket_width"], 650.0)
            pocket_height = get_param(["pocket_height_um", "pocket_height"], 650.0)

            # Pocket dimensions must contain pads and gaps
            min_pocket_w = pad_width * 1.1
            min_pocket_h = (pad_height * 2 + pad_gap) * 1.1
            if pocket_width < min_pocket_w or pocket_height < min_pocket_h:
                raise GeometryValidationError(
                    f"Qubit '{c_id_clean}' pocket ({pocket_width}x{pocket_height} um) is too small "
                    f"for its pads and gap."
                )

            # Local bounding box is the outer pocket size (converted to mm)
            w_mm = pocket_width / 1000.0
            h_mm = pocket_height / 1000.0
            local_bbox = (-w_mm / 2.0, -h_mm / 2.0, w_mm / 2.0, h_mm / 2.0)

            # Josephson junction port: centered in the gap at (0,0) locally
            port_id = f"port_{c_id_clean}"
            port = PortBuilder.build_port(
                port_id=port_id,
                x_mm=x_mm,
                y_mm=y_mm,
                orientation_deg=orientation_deg,
                reference_layer=LAYER_JUNCTION,
                associated_component_id=c_id_clean,
            )
            local_ports.append(port)

        elif c_kind in (GeometryComponentKind.RESONATOR, GeometryComponentKind.COUPLER, GeometryComponentKind.FEEDLINE):
            # Resonator, coupler, or feedline line structures
            length_um = get_param(["length_um", "length"], 2000.0)
            if "length_mm" in p and p["length_mm"] is not None:
                try:
                    length_um = float(p["length_mm"]) * 1000.0
                except (ValueError, TypeError):
                    pass

            width_um = get_param(["cpw_width_um", "cpw_width", "line_width", "trace_width"], 10.0)
            gap_um = get_param(["cpw_gap_um", "cpw_gap", "gap", "trace_gap"], 5.0)

            if length_um <= 0.0 or width_um <= 0.0 or gap_um < 0.0:
                raise GeometryValidationError(
                    f"Component '{c_id_clean}' has invalid dimensions: "
                    f"length={length_um} um, width={width_um} um, gap={gap_um} um"
                )

            # Bounding box width is length, height is CPW channel width (width + 2*gap)
            l_mm = length_um / 1000.0
            h_mm = (width_um + 2.0 * gap_um) / 1000.0
            local_bbox = (-l_mm / 2.0, -h_mm / 2.0, l_mm / 2.0, h_mm / 2.0)

            # Resonators/lines have logical ports at their input/output ends
            angle_rad = math.radians(orientation_deg)
            dx = (l_mm / 2.0) * math.cos(angle_rad)
            dy = (l_mm / 2.0) * math.sin(angle_rad)

            port_in = PortBuilder.build_port(
                port_id=f"port_{c_id_clean}_in",
                x_mm=x_mm - dx,
                y_mm=y_mm - dy,
                orientation_deg=orientation_deg,
                reference_layer=layer,
                associated_component_id=c_id_clean,
            )
            port_out = PortBuilder.build_port(
                port_id=f"port_{c_id_clean}_out",
                x_mm=x_mm + dx,
                y_mm=y_mm + dy,
                orientation_deg=(orientation_deg + 180.0) % 360.0,
                reference_layer=layer,
                associated_component_id=c_id_clean,
            )
            local_ports.extend([port_in, port_out])

        elif c_kind == GeometryComponentKind.LAUNCHPAD:
            # Launchpad
            pad_w = get_param(["pad_width_um", "pad_width"], 250.0)
            pad_l = get_param(["pad_length_um", "pad_length", "length"], 300.0)
            pad_g = get_param(["pad_gap_um", "pad_gap"], 100.0)

            w_mm = (pad_w + 2.0 * pad_g) / 1000.0
            l_mm = pad_l / 1000.0
            local_bbox = (-l_mm / 2.0, -w_mm / 2.0, l_mm / 2.0, w_mm / 2.0)

            # Port at launchpad excitation center
            port = PortBuilder.build_port(
                port_id=f"port_{c_id_clean}",
                x_mm=x_mm,
                y_mm=y_mm,
                orientation_deg=orientation_deg,
                reference_layer=layer,
                associated_component_id=c_id_clean,
            )
            local_ports.append(port)

        elif c_kind == GeometryComponentKind.GROUND_PLANE:
            # Chip-wide ground plane
            w_mm = get_param(["width_mm", "width"], 10.0)
            h_mm = get_param(["height_mm", "height"], 10.0)
            local_bbox = (-w_mm / 2.0, -h_mm / 2.0, w_mm / 2.0, h_mm / 2.0)

        else:
            # Fallback local bounding box
            local_bbox = (-0.1, -0.1, 0.1, 0.1)

        # Compute global bounding box using coordinate transform helper
        # Import dynamically to avoid circular dependencies
        from app.simulation.geometry.coordinate_transform import transform_bounding_box
        global_bbox = transform_bounding_box(local_bbox, x_mm, y_mm, orientation_deg)

        component = GeometryComponent(
            id=c_id_clean,
            kind=c_kind,
            x_mm=x_mm,
            y_mm=y_mm,
            orientation_deg=orientation_deg,
            layer=layer,
            material=material,
            params=p,
            bounding_box=global_bbox,
        )

        return component, local_ports
