"""
Template System Module

Template-driven site/corridor/shell generation for different topologies.
Importing this package registers the built-in templates.
"""

from .base import (
    Template,
    TEMPLATE_REGISTRY,
    TOPOLOGY_MAP,
    get_template,
    list_templates,
    register_template,
    select_template,
)
from .square import SquareLatticeTemplate
from .ring import RingTemplate
from .heavyhex import HeavyHexTemplate
from .vio import QuantwareVIOTemplate
from .registry import TemplateResult, get_template as get_template_result

__all__ = [
    "Template",
    "TEMPLATE_REGISTRY",
    "TOPOLOGY_MAP",
    "register_template",
    "get_template",
    "list_templates",
    "select_template",
    "TemplateResult",
    "get_template_result",
    "SquareLatticeTemplate",
    "RingTemplate",
    "HeavyHexTemplate",
    "QuantwareVIOTemplate",
]
