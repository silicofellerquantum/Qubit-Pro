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
    # These should import without errors even though some are stubs
    from app.layout import engine
    from app.layout import floorplanner
    from app.layout import legalizer
    from app.layout import overlap_resolver
    from app.layout import scorer
    from app.layout import footprints
    from app.layout import models
    from app.layout import adapters
    from app.layout import constants
    
    # Verify constants are defined
    assert constants.CPSAT_MAX_COMPONENTS == 120
    assert constants.CPSAT_TIMEOUT_SECONDS == 2.0
    assert constants.CPSAT_NUM_WORKERS == 8
    assert constants.CPSAT_RANDOM_SEED == 42


def test_cpsat_module_imports():
    """Test cpsat_model imports — ortools optional, import succeeds regardless."""
    from app.layout import cpsat_model
    assert callable(cpsat_model.build_cpsat_model)
    assert callable(cpsat_model.decode_solution)


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


try:
    import pydantic_settings  # noqa: F401
    _PYDANTIC_SETTINGS = True
except ModuleNotFoundError:
    _PYDANTIC_SETTINGS = False


@pytest.mark.skipif(
    not _PYDANTIC_SETTINGS,
    reason="pydantic_settings not installed in this test environment",
)
def test_feature_flag_exists():
    """Test layout_engine_v2 feature flag exists in config."""
    from app.config import settings
    
    # Feature flag should exist
    assert hasattr(settings, 'layout_engine_v2')
    
    # Should be a boolean
    assert isinstance(settings.layout_engine_v2, bool)
    
    # Default must be False for safe rollout
    assert settings.layout_engine_v2 is False


def test_main_package_implemented():
    """Verify LayoutEngine and generate_layout can be instantiated/called."""
    from app.layout import LayoutEngine, generate_layout
    
    engine = LayoutEngine()
    assert engine is not None
    
    with pytest.raises((AttributeError, TypeError)):
        generate_layout(None)


def test_engine_module_implemented():
    """Verify LayoutEngineImpl can be instantiated."""
    from app.layout.engine import LayoutEngineImpl
    
    impl = LayoutEngineImpl()
    assert impl is not None


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
    
    # Legalizer should instantiate successfully
    leg = PlacementLegalizer()
    assert leg is not None
    
    # Static method should work
    from app.layout.constants import CPSAT_MAX_COMPONENTS
    assert PlacementLegalizer.is_applicable(50) is True
    assert PlacementLegalizer.is_applicable(CPSAT_MAX_COMPONENTS) is True
    assert PlacementLegalizer.is_applicable(CPSAT_MAX_COMPONENTS + 1) is False


def test_overlap_resolver_stubs():
    """Test overlap resolver module — OverlapResolver is implemented (LAYOUT-012)."""
    from app.layout.overlap_resolver import OverlapResolver

    # OverlapResolver is implemented and should instantiate fine
    resolver = OverlapResolver()
    assert resolver is not None
    assert resolver.max_iters == 100


def test_scorer_stubs():
    """LAYOUT-013: LayoutScorer is now implemented — verify it instantiates."""
    from app.layout.scorer import LayoutScorer

    scorer = LayoutScorer()
    assert scorer is not None


def test_footprints_implemented():
    """LAYOUT-003: FootprintGenerator and ObstacleMap are now implemented."""
    from app.layout.footprints import FootprintGenerator, ObstacleMap

    # Both classes should be instantiable (no longer stubs)
    gen = FootprintGenerator()
    assert gen is not None

    obs_map = ObstacleMap()
    assert obs_map is not None
    assert len(obs_map) == 0


def test_adapters_implemented():
    """Verify adapters are implemented and raise standard errors on invalid inputs."""
    from app.layout.adapters import to_placement_dict, apply_to_graph, from_design_graph
    
    with pytest.raises((AttributeError, TypeError)):
        to_placement_dict(None)
    
    with pytest.raises((AttributeError, TypeError)):
        apply_to_graph(None, None)
    
    with pytest.raises((AttributeError, TypeError)):
        from_design_graph(None)


def test_cpsat_model_implemented():
    """LAYOUT-010: CP-SAT model module is importable and exposes expected callables."""
    from app.layout.cpsat_model import build_cpsat_model, decode_solution

    assert callable(build_cpsat_model)
    assert callable(decode_solution)


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
