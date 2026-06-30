import pytest
import math
from app.layout.models import Footprint
from app.layout.legalizer import PlacementLegalizer, LegalizationInfeasible

try:
    import ortools  # noqa: F401
    _ORTOOLS = True
except ModuleNotFoundError:
    _ORTOOLS = False

_skip_no_ortools = pytest.mark.skipif(
    not _ORTOOLS,
    reason="ortools not installed — install with: pip install ortools",
)


class MockConstraint:
    def __init__(self, node_id, kind, x_mm, y_mm, meta=None):
        self.node_id = node_id
        self.kind = kind
        self.x_mm = x_mm
        self.y_mm = y_mm
        self.meta = meta or {}


@_skip_no_ortools
def test_legalizer_success():
    """Verify PlacementLegalizer solves a feasible placement problem."""
    leg = PlacementLegalizer()
    q0 = Footprint(
        node_id="q0",
        component_type="qubit",
        width_mm=0.6,
        height_mm=0.6,
        keepout_mm=0.1,
        polygon=None,
        keepout_polygon=None
    )
    q1 = Footprint(
        node_id="q1",
        component_type="qubit",
        width_mm=0.6,
        height_mm=0.6,
        keepout_mm=0.1,
        polygon=None,
        keepout_polygon=None
    )

    c0 = MockConstraint("q0", "qubit_site", 2.0, 2.0)
    c1 = MockConstraint("q1", "coupler_corridor", 2.8, 2.0)

    placements = leg.legalize([q0, q1], [c0, c1], [], die_bounds=(5.0, 5.0))
    
    assert "q0" in placements
    assert "q1" in placements
    assert placements["q0"] == (2.0, 2.0)
    
    x0, y0 = placements["q0"]
    x1, y1 = placements["q1"]
    dist = math.hypot(x1 - x0, y1 - y0)
    assert dist >= 0.7


@_skip_no_ortools
def test_legalizer_infeasible():
    """Verify PlacementLegalizer raises LegalizationInfeasible for UNSAT problems."""
    leg = PlacementLegalizer()
    q0 = Footprint(
        node_id="q0",
        component_type="qubit",
        width_mm=0.6,
        height_mm=0.6,
        keepout_mm=0.1,
        polygon=None,
        keepout_polygon=None
    )
    q1 = Footprint(
        node_id="q1",
        component_type="qubit",
        width_mm=0.6,
        height_mm=0.6,
        keepout_mm=0.1,
        polygon=None,
        keepout_polygon=None
    )

    # Force overlap of qubit sites (hard constraints)
    c0 = MockConstraint("q0", "qubit_site", 2.0, 2.0)
    c1 = MockConstraint("q1", "qubit_site", 2.0, 2.0)

    with pytest.raises(LegalizationInfeasible):
        leg.legalize([q0, q1], [c0, c1], [], die_bounds=(5.0, 5.0))


def test_legalizer_max_components():
    """Verify PlacementLegalizer raises LegalizationInfeasible if too many components."""
    leg = PlacementLegalizer()
    from app.layout.constants import CPSAT_MAX_COMPONENTS
    
    components = [
        Footprint(
            node_id=f"q{i}",
            component_type="qubit",
            width_mm=0.6,
            height_mm=0.6,
            keepout_mm=0.1,
            polygon=None,
            keepout_polygon=None
        )
        for i in range(CPSAT_MAX_COMPONENTS + 1)
    ]
    
    with pytest.raises(LegalizationInfeasible) as exc_info:
        leg.legalize(components, [], [])
        
    assert "exceeds maximum limit" in str(exc_info.value)


def test_is_applicable():
    """Verify PlacementLegalizer.is_applicable behaves correctly."""
    from app.layout.constants import CPSAT_MAX_COMPONENTS
    assert PlacementLegalizer.is_applicable(5) is True
    assert PlacementLegalizer.is_applicable(CPSAT_MAX_COMPONENTS) is True
    assert PlacementLegalizer.is_applicable(CPSAT_MAX_COMPONENTS + 1) is False
