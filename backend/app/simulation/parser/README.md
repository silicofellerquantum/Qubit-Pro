# Palace Result Parser Subsystem

The `parser` package is the physics engine of the Quantum Studio simulation backend. It is responsible for parsing raw CSV solver outputs (such as frequencies, quality factors, capacitance matrices, and inductance loops) into strongly typed, validated models, and performing quantum parameter conversions to derive Hamiltonian energies and coupling strengths.

---

## Physics Conversion Formats

The parser implements rigorous physical parameter derivations based on standard superconducting circuit Hamiltonian models:

### 1. Charging Energy ($E_C$)
For a qubit island, the charging energy $E_C$ (expressed in **GHz**) is computed from its total self-capacitance $C_{\Sigma}$ (the diagonal element $C_{ii}$ of the Maxwell capacitance matrix in Farads):

$$E_C = \frac{e^2}{2 C_{\Sigma}} \cdot \frac{1}{h}$$

Where:
*   $e = 1.602176634 \times 10^{-19}\text{ C}$ (Elementary charge)
*   $h = 6.62607015 \times 10^{-34}\text{ J}\cdot\text{s}$ (Planck's constant)
*   $C_{\Sigma} = C_{ii}\text{ (fF)} \times 10^{-15}$

### 2. Josephson Energy ($E_J$)
The Josephson energy $E_J$ (expressed in **GHz**) is derived from the critical current $I_c$ of the Josephson junction:

$$E_J = \frac{\Phi_0 I_c}{2\pi} \cdot \frac{1}{h}$$

Where:
*   $\Phi_0 = \frac{h}{2e} = 2.067833848 \times 10^{-15}\text{ Wb}$ (Magnetic flux quantum)
*   $I_c = I_c\text{ (nA)} \times 10^{-9}$

### 3. Inductive Energy ($E_L$)
For fluxonium qubits, the inductive energy $E_L$ (expressed in **GHz**) is computed from the superinductor loop self-inductance $L$:

$$E_L = \frac{\Phi_0^2}{(2\pi)^2 L} \cdot \frac{1}{h}$$

Where:
*   $L = L\text{ (nH)} \times 10^{-9}$

### 4. Capacitive Coupling Strength ($g_{ij}$)
The capacitive coupling strength $g_{ij}$ (expressed in **GHz**) between qubit islands $i$ and $j$ is calculated as:

$$g_{ij} = \frac{C_{ij}}{2} \sqrt{\frac{f_i f_j}{C_i C_j}}$$

Where:
*   $C_{ij}$ is the mutual capacitance between islands $i$ and $j$ (off-diagonal element absolute value).
*   $C_i, C_j$ are the self-capacitances of qubit islands $i$ and $j$.
*   $f_i, f_j$ are their respective resonant frequencies (in GHz).

---

## File Specifications Parsed

1.  **`eig.csv`**: Contains column headers for mode index (`m`), real frequency (`Re{f}` in Hz), and quality factor (`Q`).
2.  **`port-EPR.csv`**: Maps mode indices to Energy Participation Ratio (EPR) fractions across junctions/ports (e.g. `EPR[1]`).
3.  **`terminal-C.csv`**: Contains row indices `i` and Maxwell capacitance matrix columns in Farads.
4.  **`terminal-L.csv`**: Contains row indices `i` and loop inductance matrix columns in Henries.

---

## API Usage Example

```python
from pathlib import Path
from app.simulation.parser import ResultParser, PalaceSolverType

output_dir = Path("/path/to/simulation/out")

# 1. Parse Electrostatic Results and derive transmon qubit parameters
qubits_spec = [
    {
        "qubit_id": "Q1",
        "qubit_type": "transmon",
        "terminal_id": "island_1",
        "critical_current_nA": 35.0,  # Translates to EJ
        "frequency_ghz": 5.2,
    },
    {
        "qubit_id": "Q2",
        "qubit_type": "transmon",
        "terminal_id": "island_2",
        "critical_current_nA": 35.0,
        "frequency_ghz": 5.0,
    }
]

raw_results = ResultParser.parse_results(
    output_dir=output_dir,
    solver_type=PalaceSolverType.ELECTROSTATIC,
    terminal_names=["island_1", "island_2", "readout_line"],
    qubits=qubits_spec
)

# Extract derived quantum properties
qubit_params = raw_results["qubit_parameters"]
print("Q1 EC (GHz):", qubit_params["Q1"]["EC_ghz"])
print("Q1 EJ (GHz):", qubit_params["Q1"]["EJ_ghz"])
print("Coupling strength g_Q1_Q2 (GHz):", qubit_params["Q1"]["coupling_strengths"]["Q2"])
```
