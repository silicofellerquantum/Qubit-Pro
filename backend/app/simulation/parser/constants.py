"""Physical constants and SI unit conversion factors for quantum calculations."""

from __future__ import annotations

import math

# --- SI Physical Constants ---
E_CHARGE: float = 1.602176634e-19  # Elementary charge (Coulombs)
H_PLANCK: float = 6.62607015e-34  # Planck's constant (Joule-seconds)
HBAR: float = H_PLANCK / (2.0 * math.pi)  # Reduced Planck's constant
PHI0: float = 2.067833848e-15  # Magnetic flux quantum (Webers, Phi_0 = h / (2e))

# --- Unit Conversion Factors ---
FF_TO_F: float = 1.0e-15  # Femtofarads -> Farads
NH_TO_H: float = 1.0e-9  # Nanohenries -> Henries
NA_TO_A: float = 1.0e-9  # Nanoamperes -> Amperes
GHZ_TO_HZ: float = 1.0e9  # Gigahertz -> Hertz
HZ_TO_GHZ: float = 1.0e-9  # Hertz -> Gigahertz
