"""Default settings and filenames for the Palace simulation runner."""

from __future__ import annotations

# Default execution limits
DEFAULT_TIMEOUT_SECONDS: float = 3600.0  # 1 hour
DEFAULT_CANCEL_GRACE_PERIOD: float = 5.0  # 5 seconds to wait for SIGTERM before SIGKILL

# MPI and ProcessDefaults
DEFAULT_MPI_LAUNCHER: str = "mpirun"
RUNNER_VERSION: str = "1.0.0"

# Standard log filenames (written to the workspace's logs/ directory)
LOG_RUNNER: str = "runner.log"
LOG_STDOUT: str = "palace_stdout.log"
LOG_STDERR: str = "palace_stderr.log"

# Output metadata filename (written to the workspace's logs/ or root/ directory)
METADATA_FILENAME: str = "runner_metadata.json"
