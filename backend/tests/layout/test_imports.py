"""
LAYOUT-001: Scaffold Import Tests

Verifies all layout modules can be imported without errors.
This test suite ensures the package structure is correct and all
module stubs are properly defined.
"""

import pytest


def test_main_package_imports():
    """Test main layout package imports."""
    from app.layout import LayoutEngine, generate_layout, __version__, __phase__
    
    assert LayoutEngine is not None
    assert generate_layout is not None
    assert __version__ == "1.0.0-alpha"
    assert __phase__ == "Phase 1: Foundation Scaffold"


def test_module_imports():
    """Test all module imports."""
    # These should import without errors even though they're stubs
    from app.layout import engine
    from app.layout import floorplanner
    from app.layout import legalizer
    from app.layout import overlap_resolver
    from app.layout import scorer
    from app.layout import footprints
    from app.layout import models
    from app.layout import adapters
    from app.layout import cpsat_model
    from app.layout import constants
    
    # Verify constants are defined
    assert constants.CPSAT_MAX_COMPONENTS == 120
    assert constants.CPSAT_TIMEOUT_SECONDS == 2.0
    assert constants.CPSAT_NUM_WORKERS == 8
    assert constants.CPSAT_RANDOM_SEED == 42


def test_template_imports():
    """Test template module imports."""
    from app.layout.templates import base
    from app.layout.templates import square
    from app.layout.templates import ring
    from app.layout.templates import heavyhex
    from app.layout.templates import vio
    
    # Verify base classes exist
    assert hasattr(base, 'Template')
    assert hasattr(base, 'TEMPLATE_REGISTRY')
    assert hasattr(base, 'select_template')


def test_constants_values():
    """Test that all required constants are defined."""
    from app.layout import constants
    
    # Performance targets
    assert constants.PERF_TARGET_TINY == 0.5
    assert constants.PERF_TARGET_SMALL == 1.5
    assert constants.PERF_TARGET_MEDIUM == 3.0
    assert constants.PERF_TARGET_LARGE == 2.0
    
    # Geometric defaults
    assert constants.DEFAULT_PITCH_MM == 0.5
    assert constants.DEFAULT_CLEARANCE_MM == 0.05
    assert constants.DEFAULT_DIE_MARGIN_MM == 0.3
    
    # Scoring weights
    assert 'spacing' in constants.SCORE_WEIGHTS
    assert 'symmetry' in constants.SCORE_WEIGHTS
    assert 'compactness' in constants.SCORE_WEIGHTS
    
    # Template priority
    assert isinstance(constants.TEMPLATE_PRIORITY, list)
    assert 'square' in constants.TEMPLATE_PRIORITY


def test_feature_flag_exists():
    """Test layout_engine_v2 feature flag exists in config."""
    from app.config import settings
    
    # Feature flag should exist
    assert hasattr(settings, 'layout_engine_v2')
    
    # Should be a boolean
    assert isinstance(settings.layout_engine_v2, bool)
    
    # Default must be False for safe rollout
    assert settings.layout_engine_v2 is False


def test_not_implemented_errors():
    """Test that stub functions raise NotImplementedError."""
    from app.layout import LayoutEngine, generate_layout
    
    # LayoutEngine init should raise
    with pytest.raises(NotImplementedError) as exc_info:
        engine = LayoutEngine()
    assert "LAYOUT-014" in str(exc_info.value)
    
    # generate_layout should raise
    with pytest.raises(NotImplementedError) as exc_info:
        generate_layout(None)
    assert "LAYOUT-014" in str(exc_info.value)


def test_engine_module_stubs():
    """Test engine module stubs raise NotImplementedError."""
    from app.layout.engine import LayoutEngineImpl
    
    with pytest.raises(NotImplementedError) as exc_info:
        impl = LayoutEngineImpl()
    assert "LAYOUT-014" in str(exc_info.value)


def test_floorplanner_stubs():
    """LAYOUT-009: Floorplanner is implemented — verify it requires graph + constraints."""
    from app.layout.floorplanner import Floorplanner
    from app.core.design_graph.graph import DesignGraph
    from app.constraints.constraints import DesignConstraints
    from app.core.design_graph.node import QubitNode

    # Floorplanner is fully implemented; calling with no args raises TypeError (not NIE)
    with pytest.raises(TypeError):
        fp = Floorplanner()

    # Calling with proper args should succeed and return a FloorplanResult
    g = DesignGraph()
    for i in range(4):
        g.add_node(QubitNode(id=f"q{i}"))
    fp = Floorplanner(g, DesignConstraints(qubit_count=4))
    result = fp.plan()
    assert result is not None
    assert result.spec.pitch_mm > 0


def test_legalizer_stubs():
    """Test legalizer module stubs."""
    from app.layout.legalizer import PlacementLegalizer, LegalizationInfeasible
    
    # Exception class should exist
    assert issubclass(LegalizationInfeasible, Exception)
    
    # Legalizer should raise
    with pytest.raises(NotImplementedError) as exc_info:
        leg = PlacementLegalizer()
    assert "LAYOUT-011" in str(exc_info.value)
    
    # Static method should work
    from app.layout.constants import CPSAT_MAX_COMPONENTS
    assert PlacementLegalizer.is_applicable(50) is True
    assert PlacementLegalizer.is_applicable(CPSAT_MAX_COMPONENTS) is True
    assert PlacementLegalizer.is_applicable(CPSAT_MAX_COMPONENTS + 1) is False


def test_overlap_resolver_stubs():
    """Test overlap resolver module stubs."""
    from app.layout.overlap_resolver import OverlapResolver
    
    with pytest.raises(NotImplementedError) as exc_info:
        resolver = OverlapResolver()
    assert "LAYOUT-012" in str(exc_info.value)


def test_scorer_stubs():
    """Test scorer module stubs."""
    from app.layout.scorer import LayoutScorer
    
    with pytest.raises(NotImplementedError) as exc_info:
        scorer = LayoutScorer()
    assert "LAYOUT-013" in str(exc_info.value)


def test_footprints_implemented():
    """LAYOUT-003: FootprintGenerator and ObstacleMap are now implemented."""
    from app.layout.footprints import FootprintGenerator, ObstacleMap

    # Both classes should be instantiable (no longer stubs)
    gen = FootprintGenerator()
    assert gen is not None

    obs_map = ObstacleMap()
    assert obs_map is not None
    assert len(obs_map) == 0


def test_adapters_stubs():
    """Test adapters module stubs."""
    from app.layout.adapters import to_placement_dict, apply_to_graph, from_design_graph
    
    with pytest.raises(NotImplementedError) as exc_info:
        to_placement_dict(None)
    assert "LAYOUT-014" in str(exc_info.value)
    
    with pytest.raises(NotImplementedError) as exc_info:
        apply_to_graph(None, None)
    assert "LAYOUT-014" in str(exc_info.value)
    
    with pytest.raises(NotImplementedError) as exc_info:
        from_design_graph(None)
    assert "LAYOUT-014" in str(exc_info.value)


def test_cpsat_model_stubs():
    """Test CP-SAT model module stubs."""
    from app.layout.cpsat_model import build_cpsat_model, decode_solution
    
    with pytest.raises(NotImplementedError) as exc_info:
        build_cpsat_model([], [], [])
    assert "LAYOUT-010" in str(exc_info.value)
    
    with pytest.raises(NotImplementedError) as exc_info:
        decode_solution(None, {})
    assert "LAYOUT-010" in str(exc_info.value)


def test_template_base_stubs():
    """Test template base module is implemented."""
    from app.layout.templates.base import Template, select_template, register_template, TEMPLATE_REGISTRY
    
    # Registry should be a dict (may be empty or populated)
    assert isinstance(TEMPLATE_REGISTRY, dict)
    
    # select_template with empty registry should raise ValueError
    TEMPLATE_REGISTRY.clear()  # Ensure empty for test
    with pytest.raises(ValueError) as exc_info:
        select_template('square', 9, [], 4)
    assert "No suitable template found" in str(exc_info.value)
    
    # register_template should raise ValueError for duplicate or invalid templates
    # (Tested more thoroughly in test_template_core.py)


def test_template_class_stubs():
    """LAYOUT-005..008: All four template classes are implemented — verify instantiation works."""
    from app.layout.templates.square import SquareLatticeTemplate
    from app.layout.templates.ring import RingTemplate
    from app.layout.templates.heavyhex import HeavyHexTemplate
    from app.layout.templates.vio import QuantwareVIOTemplate

    # All templates are implemented and should instantiate without error
    sq = SquareLatticeTemplate()
    assert sq.name == "square"
    assert len(sq.sites(9, 1.0)) == 9

    rng = RingTemplate()
    assert rng.name == "ring"
    assert len(rng.sites(8, 1.0)) == 8

    hh = HeavyHexTemplate()
    assert hh.name == "heavyhex"
    assert len(hh.sites(25, 1.0)) == 25

    vio = QuantwareVIOTemplate()
    assert vio.name == "vio"
    assert len(vio.sites(16, 1.0)) == 16


def test_all_exports():
    """Test that __all__ is properly defined."""
    from app.layout import __all__
    
    assert 'LayoutEngine' in __all__
    assert 'generate_layout' in __all__
    for model in [
        'Footprint', 'Obstacle', 'PlacementConstraint', 'ScoreBreakdown',
        'LayoutCandidate', 'Site', 'Corridor', 'Shell', 'Slot', 'Channel', 'Floorplan'
    ]:
        assert model in __all__
    assert len(__all__) == 13


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
