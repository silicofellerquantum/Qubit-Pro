import pytest
from app.layout.models import (
    Footprint,
    Obstacle,
    PlacementConstraint,
    ScoreBreakdown,
    LayoutCandidate,
    Site,
    Corridor,
    Shell,
    Slot,
    Channel,
    Floorplan,
)


def test_site_creation():
    site = Site(
        site_id="Q1",
        x_mm=1.0,
        y_mm=2.0
    )

    assert site.site_id == "Q1"
    assert site.x_mm == 1.0
    assert site.y_mm == 2.0
    assert site.capacity == 1
    assert site.metadata == {}


def test_site_is_immutable():
    site = Site(
        site_id="Q1",
        x_mm=1.0,
        y_mm=2.0
    )

    with pytest.raises(Exception):
        site.x_mm = 99


def test_site_serialization():
    site = Site(
        site_id="Q1",
        x_mm=1,
        y_mm=2
    )

    data = site.to_dict()

    assert data["site_id"] == "Q1"
    assert data["x_mm"] == 1
    assert data["y_mm"] == 2
    assert data["capacity"] == 1
    assert data["metadata"] == {}


def test_layout_candidate():
    score = ScoreBreakdown(
        gate_passed=True,
        overlap_score=100.0,
        spacing_score=95.0,
        symmetry_score=90.0,
        compactness_score=85.0,
        edge_compliance_score=95.0,
        aesthetics_score=92.0,
        overall_score=92.8
    )

    candidate = LayoutCandidate(
        placements={"Q1": (0.0, 0.0)},
        score=score,
        template_name="square",
        generation_time_sec=0.5
    )

    assert candidate.template_name == "square"
    assert candidate.placements["Q1"] == (0.0, 0.0)
    assert candidate.score.gate_passed is True
    assert candidate.score.overall_score == 92.8
    assert candidate.generation_time_sec == 0.5
    assert candidate.metadata == {}


def test_floorplan_roundtrip():
    site = Site(
        site_id="Q1",
        x_mm=1.0,
        y_mm=2.0
    )

    floorplan = Floorplan(
        sites=[site],
        corridors=[],
        shells=[],
        slots=[],
        channels=[]
    )

    data = floorplan.to_dict()

    restored = Floorplan(
        sites=[Site(**item) for item in data["sites"]],
        corridors=[],
        shells=[],
        slots=[],
        channels=[]
    )

    assert restored.sites[0].site_id == "Q1"
    assert restored.sites[0].x_mm == 1.0
    assert restored.sites[0].y_mm == 2.0


def test_footprint_creation_and_immutability():
    footprint = Footprint(
        node_id="Q1",
        component_type="transmon",
        width_mm=0.4,
        height_mm=0.4,
        keepout_mm=0.05,
        polygon=None,
        keepout_polygon=None,
        rotation_deg=90.0
    )
    assert footprint.node_id == "Q1"
    assert footprint.rotation_deg == 90.0
    assert footprint.metadata == {}
    
    with pytest.raises(Exception):
        footprint.rotation_deg = 0.0


def test_obstacle_creation_and_immutability():
    obstacle = Obstacle(
        obstacle_id="OBS1",
        polygon=None,
        obstacle_type="keepout"
    )
    assert obstacle.obstacle_id == "OBS1"
    assert obstacle.obstacle_type == "keepout"
    
    with pytest.raises(Exception):
        obstacle.obstacle_type = "other"


def test_placement_constraint_creation():
    constraint = PlacementConstraint(
        node_id="Q1",
        min_x_mm=0.0,
        max_x_mm=5.0
    )
    assert constraint.node_id == "Q1"
    assert constraint.min_x_mm == 0.0
    assert constraint.max_x_mm == 5.0
    assert constraint.min_y_mm is None
    assert constraint.attach_to is None
    
    with pytest.raises(Exception):
        constraint.node_id = "Q2"


def test_corridor_creation():
    corridor = Corridor(
        corridor_id="C1",
        start_site="Q1",
        end_site="Q2",
        center_x_mm=1.5,
        center_y_mm=2.0,
        width_mm=0.1,
        length_mm=1.0
    )
    assert corridor.corridor_id == "C1"
    assert corridor.center_x_mm == 1.5
    
    with pytest.raises(Exception):
        corridor.width_mm = 0.2


def test_shell_creation():
    shell = Shell(
        shell_id="S1",
        parent_site="Q1",
        radius_mm=0.5,
        start_angle_deg=0.0,
        end_angle_deg=180.0
    )
    assert shell.shell_id == "S1"
    assert shell.radius_mm == 0.5
    
    with pytest.raises(Exception):
        shell.radius_mm = 0.6


def test_slot_creation():
    slot = Slot(
        slot_id="SL1",
        edge="top",
        x_mm=0.0,
        y_mm=3.0
    )
    assert slot.slot_id == "SL1"
    assert slot.edge == "top"
    
    with pytest.raises(Exception):
        slot.edge = "bottom"


def test_channel_creation():
    channel = Channel(
        channel_id="CH1",
        start_x_mm=0.0,
        start_y_mm=-1.0,
        end_x_mm=10.0,
        end_y_mm=-1.0,
        width_mm=0.2
    )
    assert channel.channel_id == "CH1"
    assert channel.width_mm == 0.2
    
    with pytest.raises(Exception):
        channel.width_mm = 0.3
