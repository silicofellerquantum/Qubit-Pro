"""
Qubit-Pro backend installer — use this instead of bare `pip install -r requirements.txt`.

WHY NOT PLAIN pip install -r requirements.txt:
  qiskit-metal==0.1.5 hard-pins pyaedt==0.6.46 in its package metadata.
  pyaedt==0.6.46 has a broken setup.py that does `import pip` at build time,
  which fails in all modern pip versions (20+) due to isolated build envs.
  There is no pip-native way to override a transitive dep pin in a single
  requirements.txt pass — pip always re-reads the installed package metadata.

  The only reliable solution is:
    1. Install all deps (including pyaedt==0.6.79) first
    2. Install qiskit-metal with --no-deps (skips its broken dep resolver)

  This script automates those two steps and is safe to call in CI/CD pipelines.

USAGE (local & CI/CD):
  python install.py

DOCKER / deployment:
  RUN python install.py
"""
import subprocess
import sys


def run(cmd: list, label: str) -> None:
    print(f"\n{'='*60}\n  {label}\n{'='*60}")
    result = subprocess.run(cmd)
    if result.returncode != 0:
        print(f"\n[ERROR] Step failed: {label}")
        sys.exit(result.returncode)


pip = [sys.executable, "-m", "pip", "install"]

# Step 1 — install everything in requirements.txt
# This gets pyaedt==0.6.79 in place BEFORE qiskit-metal tries to pull 0.6.46
run(
    pip + ["-r", "requirements.txt"],
    "Step 1/2 — Installing all requirements"
)

# Step 2 — install qiskit-metal package files only, no dep resolution
# All its deps are already satisfied from Step 1
run(
    pip + ["--no-deps", "qiskit-metal==0.1.5"],
    "Step 2/2 — Installing qiskit-metal==0.1.5 (--no-deps)"
)

print(f"\n{'='*60}")
print("  SUCCESS — all packages installed!")
print(f"{'='*60}\n")
