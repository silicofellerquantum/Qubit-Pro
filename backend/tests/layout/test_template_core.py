"""
LAYOUT-004: Template Engine Core Tests

Tests for Template ABC, registry, and selection logic.
"""

import pytest
from typing import List, Any

from app.layout.templates.base import (
    Template,
    TEMPLATE_REGISTRY,
    register_template,
    get_template,
    list_templates,
    select_template,
    TOPOLOGY_MAP,
)
from app.layout.models import Site, Corridor, Shell, Slot, Channel


# Mock template implementations for testing

class MockSquareTemplate(Template):
    """Mock square lattice template."""
    
    @property
    def name(self) -> str:
        return "square"
    
    @property
    def description(self) -> str:
        return "Mock square lattice template"
    
    @property
    def supported_topologies(self) -> List[str]:
        return ['square', 'grid', 'lattice']
    
    def sites(self, n: int, pitch: float) -> List[Site]:
        # Generate mock sites in a grid
        sites = []
        for i in range(n):
            sites.append(Site(
                site_id=f"site_{i}",
                x_mm=float(i * pitch),
                y_mm=0.0
            ))
        return sites
    
    def corridors(self, sites: List[Site], topology: Any) -> List[Corridor]:
        return []
    
    def shells(self, sites: List[Site]) -> List[Shell]:
        return []
    
    def slots(self, n_launchpads: int) -> List[Slot]:
        return []
    
    def channels(self, shells: List[Shell]) -> List[Channel]:
        return []


class MockRingTemplate(Template):
    """Mock ring template."""
    
    @property
    def name(self) -> str:
        return "ring"
    
    @property
    def description(self) -> str:
        return "Mock ring template"
    
    @property
    def supported_topologies(self) -> List[str]:
        return ['ring', 'circular']
    
    def sites(self, n: int, pitch: float) -> List[Site]:
        return []
    
    def corridors(self, sites: List[Site], topology: Any) -> List[Corridor]:
        return []
    
    def shells(self, sites: List[Site]) -> List[Shell]:
        return []
    
    def slots(self, n_launchpads: int) -> List[Slot]:
        return []
    
    def channels(self, shells: List[Shell]) -> List[Channel]:
        return []


class MockHeavyHexTemplate(Template):
    """Mock heavy-hex template."""
    
    @property
    def name(self) -> str:
        return "heavyhex"
    
    @property
    def description(self) -> str:
        return "Mock heavy-hex template"
    
    @property
    def supported_topologies(self) -> List[str]:
        return ['heavy-hex', 'heavyhex', 'ibm']
    
    def sites(self, n: int, pitch: float) -> List[Site]:
        return []
    
    def corridors(self, sites: List[Site], topology: Any) -> List[Corridor]:
        return []
    
    def shells(self, sites: List[Site]) -> List[Shell]:
        return []
    
    def slots(self, n_launchpads: int) -> List[Slot]:
        return []
    
    def channels(self, shells: List[Shell]) -> List[Channel]:
        return []


class MockVIOTemplate(Template):
    """Mock VIO template."""
    
    @property
    def name(self) -> str:
        return "vio"
    
    @property
    def description(self) -> str:
        return "Mock VIO template"
    
    @property
    def supported_topologies(self) -> List[str]:
        return ['vio', 'vertical-io', 'flip-chip']
    
    def sites(self, n: int, pitch: float) -> List[Site]:
        return []
    
    def corridors(self, sites: List[Site], topology: Any) -> List[Corridor]:
        return []
    
    def shells(self, sites: List[Site]) -> List[Shell]:
        return []
    
    def slots(self, n_launchpads: int) -> List[Slot]:
        return []
    
    def channels(self, shells: List[Shell]) -> List[Channel]:
        return []


# Fixtures

@pytest.fixture(autouse=True)
def clean_registry():
    """Clear registry before and after each test."""
    TEMPLATE_REGISTRY.clear()
    yield
    TEMPLATE_REGISTRY.clear()


# Template ABC Tests

def test_template_is_abstract():
    """Cannot instantiate Template directly."""
    with pytest.raises(TypeError, match="Can't instantiate abstract class"):
        Template()


def test_template_requires_all_methods():
    """Subclass must implement all abstract methods."""
    
    class IncompleteTemplate(Template):
        @property
        def name(self):
            return "incomplete"
        
        @property
        def description(self):
            return "Missing methods"
        
        @property
        def supported_topologies(self):
            return []
        
        def sites(self, n, pitch):
            return []
        # Missing: corridors, shells, slots, channels
    
    with pytest.raises(TypeError, match="Can't instantiate abstract class"):
        IncompleteTemplate()


def test_template_properties():
    """Template has required properties."""
    template = MockSquareTemplate()
    
    assert template.name == "square"
    assert template.description == "Mock square lattice template"
    assert template.supported_topologies == ['square', 'grid', 'lattice']


def test_template_methods():
    """Template has required methods."""
    template = MockSquareTemplate()
    
    # sites()
    sites = template.sites(4, 0.5)
    assert len(sites) == 4
    assert all(isinstance(s, Site) for s in sites)
    
    # corridors()
    corridors = template.corridors(sites, None)
    assert isinstance(corridors, list)
    
    # shells()
    shells = template.shells(sites)
    assert isinstance(shells, list)
    
    # slots()
    slots = template.slots(4)
    assert isinstance(slots, list)
    
    # channels()
    channels = template.channels([])
    assert isinstance(channels, list)


# Registry Tests

def test_register_template():
    """Can register a template."""
    register_template('square', MockSquareTemplate)
    
    assert 'square' in TEMPLATE_REGISTRY
    assert TEMPLATE_REGISTRY['square'] == MockSquareTemplate


def test_register_multiple_templates():
    """Can register multiple templates."""
    register_template('square', MockSquareTemplate)
    register_template('ring', MockRingTemplate)
    
    assert len(TEMPLATE_REGISTRY) == 2
    assert 'square' in TEMPLATE_REGISTRY
    assert 'ring' in TEMPLATE_REGISTRY


def test_register_duplicate_fails():
    """Cannot register same name twice."""
    register_template('square', MockSquareTemplate)
    
    with pytest.raises(ValueError, match="already registered"):
        register_template('square', MockRingTemplate)


def test_register_non_template_fails():
    """Must inherit from Template."""
    
    class NotATemplate:
        pass
    
    with pytest.raises(TypeError, match="must inherit from Template"):
        register_template('invalid', NotATemplate)


def test_get_template():
    """Can retrieve registered template."""
    register_template('square', MockSquareTemplate)
    
    template_class = get_template('square')
    assert template_class == MockSquareTemplate


def test_get_template_not_found():
    """Raises KeyError if template not found."""
    with pytest.raises(KeyError, match="not found in registry"):
        get_template('nonexistent')


def test_list_templates():
    """Can list all registered templates."""
    assert list_templates() == []
    
    register_template('square', MockSquareTemplate)
    assert list_templates() == ['square']
    
    register_template('ring', MockRingTemplate)
    assert set(list_templates()) == {'square', 'ring'}


# Selection Tests

def test_select_by_topology_exact():
    """Topology 'square' selects SquareTemplate."""
    register_template('square', MockSquareTemplate)
    
    template = select_template('square', 9, [], 0)
    assert isinstance(template, MockSquareTemplate)


def test_select_by_topology_heavy_hex():
    """Topology 'heavy-hex' selects HeavyHexTemplate."""
    register_template('heavyhex', MockHeavyHexTemplate)
    
    template = select_template('heavy-hex', 25, [], 0)
    assert isinstance(template, MockHeavyHexTemplate)


def test_select_by_topology_ring():
    """Topology 'ring' selects RingTemplate."""
    register_template('ring', MockRingTemplate)
    
    template = select_template('ring', 8, [], 0)
    assert isinstance(template, MockRingTemplate)


def test_select_by_topology_case_insensitive():
    """Topology matching is case-insensitive."""
    register_template('square', MockSquareTemplate)
    
    template = select_template('SQUARE', 9, [], 0)
    assert isinstance(template, MockSquareTemplate)


def test_select_by_keyword_vio():
    """Keyword 'vio' selects VIOTemplate."""
    register_template('vio', MockVIOTemplate)
    register_template('square', MockSquareTemplate)
    
    template = select_template('square', 16, ['vio'], 0)
    assert isinstance(template, MockVIOTemplate)


def test_select_by_keyword_flip_chip():
    """Keyword 'flip-chip' selects VIOTemplate."""
    register_template('vio', MockVIOTemplate)
    register_template('square', MockSquareTemplate)
    
    template = select_template('square', 16, ['flip-chip'], 0)
    assert isinstance(template, MockVIOTemplate)


def test_select_by_keyword_ring():
    """Keyword 'circular' selects RingTemplate."""
    register_template('ring', MockRingTemplate)
    register_template('square', MockSquareTemplate)
    
    template = select_template('unknown', 8, ['circular'], 0)
    assert isinstance(template, MockRingTemplate)


def test_select_by_io_budget():
    """High I/O budget selects VIOTemplate."""
    register_template('vio', MockVIOTemplate)
    register_template('square', MockSquareTemplate)
    
    # io_budget = 10, n = 16 → 62.5% > 50% threshold
    template = select_template('unknown', 16, [], 10)
    assert isinstance(template, MockVIOTemplate)


def test_select_fallback_to_square():
    """Unknown topology falls back to square."""
    register_template('square', MockSquareTemplate)
    
    template = select_template('unknown', 9, [], 0)
    assert isinstance(template, MockSquareTemplate)


def test_select_empty_registry_fails():
    """Raises error if no templates registered."""
    with pytest.raises(ValueError, match="No suitable template"):
        select_template('square', 9, [], 0)


def test_select_with_none_keywords():
    """Handles None keywords gracefully."""
    register_template('square', MockSquareTemplate)
    
    template = select_template('square', 9, None, 0)
    assert isinstance(template, MockSquareTemplate)


def test_select_priority_keyword_overrides_topology():
    """Keywords can override topology when explicitly specified."""
    register_template('heavyhex', MockHeavyHexTemplate)
    register_template('vio', MockVIOTemplate)
    
    # With 'vio' keyword, VIO wins even with 'heavy-hex' topology
    # This is correct: explicit keyword intent overrides topology inference
    template = select_template('heavy-hex', 25, ['vio'], 0)
    assert isinstance(template, MockVIOTemplate)


def test_select_priority_keyword_over_io_budget():
    """Keyword match has priority over I/O budget."""
    register_template('ring', MockRingTemplate)
    register_template('vio', MockVIOTemplate)
    
    # Even with high I/O budget, 'ring' keyword wins
    template = select_template('unknown', 16, ['ring'], 10)
    assert isinstance(template, MockRingTemplate)


# Topology Map Tests

def test_topology_map_completeness():
    """TOPOLOGY_MAP covers expected topologies."""
    expected_topologies = [
        'heavy-hex', 'heavy_hex', 'heavyhex', 'ibm',
        'ring', 'circular', 'cyclic',
        'square', 'grid', 'lattice', 'line',
        'vio', 'vertical-io', 'flip-chip',
    ]
    
    for topo in expected_topologies:
        assert topo in TOPOLOGY_MAP, f"Missing topology: {topo}"


def test_topology_map_targets():
    """TOPOLOGY_MAP maps to correct template names."""
    assert TOPOLOGY_MAP['heavy-hex'] == 'heavyhex'
    assert TOPOLOGY_MAP['ring'] == 'ring'
    assert TOPOLOGY_MAP['square'] == 'square'
    assert TOPOLOGY_MAP['vio'] == 'vio'


# Integration Tests

def test_full_workflow():
    """Complete workflow: register, list, select, instantiate."""
    # Register all templates
    register_template('square', MockSquareTemplate)
    register_template('ring', MockRingTemplate)
    register_template('heavyhex', MockHeavyHexTemplate)
    register_template('vio', MockVIOTemplate)
    
    # List templates
    templates = list_templates()
    assert len(templates) == 4
    
    # Select by topology
    t1 = select_template('square', 9, [], 0)
    assert isinstance(t1, MockSquareTemplate)
    
    # Select by keyword
    t2 = select_template('unknown', 16, ['vio'], 0)
    assert isinstance(t2, MockVIOTemplate)
    
    # Use template
    sites = t1.sites(9, 0.5)
    assert len(sites) == 9


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
