"""
Template Base Classes

Abstract base class and registry for layout templates.

Implemented in LAYOUT-004.
"""

from abc import ABC, abstractmethod
from typing import List, Type, Dict, Any

from app.layout.models import Site, Corridor, Shell, Slot, Channel


class Template(ABC):
    """
    Abstract base class for layout templates.
    
    All templates must implement methods to generate:
        - sites: Qubit placement sites
        - corridors: Coupler corridors between sites
        - shells: Resonator shells around sites
        - slots: Launchpad slots on die perimeter
        - channels: Feedline routing channels
    
    Each template also provides metadata:
        - name: Template identifier
        - description: Human-readable description
        - supported_topologies: List of topology types this template handles
    
    Implemented in LAYOUT-004.
    """
    
    @property
    @abstractmethod
    def name(self) -> str:
        """
        Template identifier (e.g., 'square', 'ring', 'heavyhex', 'vio').
        
        Returns:
            Template name string
        """
        pass
    
    @property
    @abstractmethod
    def description(self) -> str:
        """
        Human-readable description of the template.
        
        Returns:
            Description string
        """
        pass
    
    @property
    @abstractmethod
    def supported_topologies(self) -> List[str]:
        """
        List of topology types this template handles.
        
        Examples: ['square', 'grid'], ['ring', 'circular'], ['heavy-hex']
        
        Returns:
            List of supported topology strings
        """
        pass
    
    @abstractmethod
    def sites(self, n: int, pitch: float) -> List[Site]:
        """
        Generate n qubit sites with given pitch.
        
        Args:
            n: Number of sites to generate
            pitch: Minimum spacing between sites (mm)
            
        Returns:
            List of Site dataclasses with positions
        """
        pass
    
    @abstractmethod
    def corridors(self, sites: List[Site], topology: Any) -> List[Corridor]:
        """
        Generate coupler corridors based on topology.
        
        Args:
            sites: List of Site dataclasses
            topology: Graph topology defining qubit connectivity
            
        Returns:
            List of Corridor dataclasses
        """
        pass
    
    @abstractmethod
    def shells(self, sites: List[Site]) -> List[Shell]:
        """
        Generate resonator shells around sites.
        
        Args:
            sites: List of Site dataclasses
            
        Returns:
            List of Shell dataclasses defining resonator regions
        """
        pass
    
    @abstractmethod
    def slots(self, n_launchpads: int) -> List[Slot]:
        """
        Generate launchpad slots on die perimeter.
        
        Args:
            n_launchpads: Number of launchpads to place
            
        Returns:
            List of Slot dataclasses on die edges
        """
        pass
    
    @abstractmethod
    def channels(self, shells: List[Shell]) -> List[Channel]:
        """
        Generate feedline channels.
        
        Args:
            shells: List of Shell dataclasses
            
        Returns:
            List of Channel dataclasses for feedline routing
        """
        pass


# Template registry: maps template name → template class
TEMPLATE_REGISTRY: Dict[str, Type[Template]] = {}


def register_template(name: str, template_class: Type[Template]) -> None:
    """
    Register a template in the global registry.
    
    Args:
        name: Template name (e.g., 'square', 'ring')
        template_class: Template class (must inherit from Template)
        
    Raises:
        TypeError: If template_class doesn't inherit from Template
        ValueError: If name already registered
        
    Example:
        >>> register_template('square', SquareLatticeTemplate)
    """
    # Validation: must inherit from Template
    if not issubclass(template_class, Template):
        raise TypeError(
            f"Template class {template_class.__name__} must inherit from Template"
        )
    
    # Validation: no duplicates
    if name in TEMPLATE_REGISTRY:
        raise ValueError(
            f"Template '{name}' is already registered "
            f"(class: {TEMPLATE_REGISTRY[name].__name__})"
        )
    
    # Register
    TEMPLATE_REGISTRY[name] = template_class


def get_template(name: str) -> Type[Template]:
    """
    Get template class by name.
    
    Args:
        name: Template name
        
    Returns:
        Template class
        
    Raises:
        KeyError: If template not found
    """
    if name not in TEMPLATE_REGISTRY:
        available = list_templates()
        raise KeyError(
            f"Template '{name}' not found in registry. "
            f"Available templates: {available}"
        )
    return TEMPLATE_REGISTRY[name]


def list_templates() -> List[str]:
    """
    List all registered template names.
    
    Returns:
        List of template name strings
    """
    return list(TEMPLATE_REGISTRY.keys())


# Topology to template name mapping
TOPOLOGY_MAP: Dict[str, str] = {
    # Heavy-hex variants
    'heavy-hex': 'heavyhex',
    'heavy_hex': 'heavyhex',
    'heavyhex': 'heavyhex',
    'ibm': 'heavyhex',
    # Ring variants
    'ring': 'ring',
    'circular': 'ring',
    'cyclic': 'ring',
    # Square/grid variants
    'square': 'square',
    'grid': 'square',
    'lattice': 'square',
    'line': 'square',  # 1D line uses square with 1 row
    # VIO variants
    'vio': 'vio',
    'vertical-io': 'vio',
    'flip-chip': 'vio',
}


def select_template(
    topology: str,
    n: int,
    keywords: List[str] = None,
    io_budget: int = 0
) -> Template:
    """
    Select best template for given parameters.
    
    Selection algorithm (priority order):
    1. Exact topology match (e.g., 'heavy-hex' → HeavyHexTemplate)
    2. Keyword match (e.g., 'vio' keyword → VIOTemplate)  
    3. I/O budget heuristic (high I/O → VIOTemplate)
    4. Fallback chain using TEMPLATE_PRIORITY from constants
    5. Ultimate fallback to 'square' if available
    
    Args:
        topology: Topology type (e.g., 'line', 'square', 'heavy-hex', 'ring')
        n: Number of qubits
        keywords: Intent keywords from design (default: [])
        io_budget: Number of I/O connections needed (default: 0)
        
    Returns:
        Instantiated Template object
        
    Raises:
        ValueError: If no suitable template found (registry empty)
        
    Example:
        >>> template = select_template('heavy-hex', 25, [], 8)
        >>> isinstance(template, HeavyHexTemplate)
        True
    """
    if keywords is None:
        keywords = []
    
    topology_lower = topology.lower().strip()
    keywords_lower = [k.lower().strip() for k in keywords]
    
    # Step 1: Check if topology has an exact match AND no overriding keywords
    # Only use topology match if no strong keyword signals present
    has_keyword_override = False
    
    # Check for keyword overrides before topology match
    vio_keywords = {'vio', 'vertical-io', 'flip-chip', 'flipchip', 'vertical_io'}
    if any(kw in vio_keywords for kw in keywords_lower):
        has_keyword_override = True
    
    ring_keywords = {'ring', 'circular', 'cyclic'}
    if any(kw in ring_keywords for kw in keywords_lower):
        has_keyword_override = True
    
    heavyhex_keywords = {'heavy-hex', 'heavyhex', 'heavy_hex', 'ibm'}
    if any(kw in heavyhex_keywords for kw in keywords_lower):
        has_keyword_override = True
    
    # Apply topology-based selection only if no keyword override
    if not has_keyword_override and topology_lower in TOPOLOGY_MAP:
        template_name = TOPOLOGY_MAP[topology_lower]
        if template_name in TEMPLATE_REGISTRY:
            return TEMPLATE_REGISTRY[template_name]()
    
    # Step 2: Keyword-based selection
    
    # VIO/flip-chip keywords
    if any(kw in vio_keywords for kw in keywords_lower):
        if 'vio' in TEMPLATE_REGISTRY:
            return TEMPLATE_REGISTRY['vio']()
    
    # Ring keywords
    if any(kw in ring_keywords for kw in keywords_lower):
        if 'ring' in TEMPLATE_REGISTRY:
            return TEMPLATE_REGISTRY['ring']()
    
    # Heavy-hex keywords
    if any(kw in heavyhex_keywords for kw in keywords_lower):
        if 'heavyhex' in TEMPLATE_REGISTRY:
            return TEMPLATE_REGISTRY['heavyhex']()
    
    # Step 3: I/O budget heuristic
    # High I/O budget (>50% of qubits) suggests VIO perimeter design
    if n > 0 and io_budget > n * 0.5:
        if 'vio' in TEMPLATE_REGISTRY:
            return TEMPLATE_REGISTRY['vio']()
    
    # Step 4: Fallback chain using priority from constants
    try:
        from app.layout.constants import TEMPLATE_PRIORITY
        for template_name in TEMPLATE_PRIORITY:
            if template_name in TEMPLATE_REGISTRY:
                return TEMPLATE_REGISTRY[template_name]()
    except ImportError:
        pass  # Constants not available, continue to ultimate fallback
    
    # Step 5: Ultimate fallback to square
    if 'square' in TEMPLATE_REGISTRY:
        return TEMPLATE_REGISTRY['square']()
    
    # No templates available
    raise ValueError(
        f"No suitable template found for topology='{topology}', n={n}. "
        f"Registry is empty or no fallback available. "
        f"Available templates: {list_templates()}"
    )
