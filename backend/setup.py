"""
Quick setup script — creates virtual environment and installs dependencies.
Run: python setup.py   (Windows)
     python3 setup.py  (macOS/Linux)
"""
import subprocess
import sys
import os
import shutil


def run(cmd, check=True):
    print(f"\n>>> {cmd}")
    result = subprocess.run(cmd, shell=True)
    if check and result.returncode != 0:
        print(f"ERROR: command failed with code {result.returncode}")
        sys.exit(result.returncode)
    return result.returncode


# Use the current Python interpreter directly — this is always correct
# regardless of whether the `py` launcher or PATH is configured properly.
def find_python() -> str:
    return sys.executable


python = find_python()
print(f"Using Python: {python}")


# Create venv if not present
if not os.path.exists(".venv"):
    run(f'"{python}" -m venv .venv')
else:
    print(">>> .venv already exists, skipping creation")

# Detect venv paths
if sys.platform == "win32":
    venv_python = r".venv\Scripts\python.exe"
    venv_pip    = r".venv\Scripts\pip.exe"
else:
    venv_python = ".venv/bin/python"
    venv_pip    = ".venv/bin/pip"

# Install requirements (skip pip self-upgrade to avoid Windows lock issue)
run(f'"{venv_pip}" install -r requirements.txt')

# Create .env file for backend if it doesn't exist
if not os.path.exists(".env") and os.path.exists(".env.example"):
    print("\n>>> Creating backend .env from .env.example")
    shutil.copy(".env.example", ".env")
    print(">>> IMPORTANT: Please edit backend/.env to add your Razorpay keys and other secrets.")
elif os.path.exists(".env"):
    print("\n>>> backend/.env file already exists, skipping creation")

# Create .env file for frontend if it doesn't exist
frontend_env = os.path.join("..", "frontend", ".env")
frontend_example = os.path.join("..", "frontend", ".env.example")
if not os.path.exists(frontend_env) and os.path.exists(frontend_example):
    print("\n>>> Creating frontend .env from .env.example")
    shutil.copy(frontend_example, frontend_env)
elif os.path.exists(frontend_env):
    print("\n>>> frontend/.env file already exists, skipping creation")

print("\n[OK] Setup complete!")
print("\nTo start the backend:")
if sys.platform == "win32":
    print(f"  .venv\\Scripts\\python run.py")
else:
    print(f"  .venv/bin/python run.py")
print(f"\nAPI docs: http://localhost:5000/docs")
