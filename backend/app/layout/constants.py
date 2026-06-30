"""
Layout System Constants

Configuration constants for layout engine:
- Solver parameters
- Performance targets
- Default values
- Component limits
"""

# CP-SAT Configuration
CPSAT_MAX_COMPONENTS = 120  # Max components for CP-SAT solver
CPSAT_TIMEOUT_SECONDS = 2.0
CPSAT_NUM_WORKERS = 8
CPSAT_RANDOM_SEED = 42  # For determinism

# Performance Targets (seconds)
PERF_TARGET_TINY = 0.5      # N ≤ 16
PERF_TARGET_SMALL = 1.5     # 17 ≤ N ≤ 49
PERF_TARGET_MEDIUM = 3.0    # 50 ≤ N ≤ 120
PERF_TARGET_LARGE = 2.0     # N > 120

# Geometric Defaults (mm)
DEFAULT_PITCH_MM = 0.5
DEFAULT_CLEARANCE_MM = 0.05
DEFAULT_DIE_MARGIN_MM = 0.3

# Scoring Weights (Phase 1)
SCORE_WEIGHTS = {
    'spacing': 0.25,
    'symmetry': 0.25,
    'compactness': 0.20,
    'edge_compliance': 0.15,
    'aesthetics': 0.15,
}

# Template Selection
TEMPLATE_PRIORITY = [
    'heavyhex',    # IBM-style
    'vio',         # Quantware-style
    'square',      # Default lattice
    'ring',        # Specialty
]
