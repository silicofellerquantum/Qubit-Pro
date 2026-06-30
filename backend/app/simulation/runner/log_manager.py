"""Service to manage file-based logging in the sandboxed workspace."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

from app.simulation.runner.constants import LOG_RUNNER, LOG_STDERR, LOG_STDOUT


class LogManager:
    """Manages writing process execution logs within the workspace's logs directory."""

    def __init__(self, logs_dir: str | Path) -> None:
        """Initialize the LogManager.

        Args:
            logs_dir: Path to the logs directory inside the workspace.
        """
        self.logs_dir = Path(logs_dir)
        self.logs_dir.mkdir(parents=True, exist_ok=True)
        
        self.runner_log_path = self.logs_dir / LOG_RUNNER
        self.stdout_log_path = self.logs_dir / LOG_STDOUT
        self.stderr_log_path = self.logs_dir / LOG_STDERR

        # Touch/initialize files to ensure they exist
        self.runner_log_path.touch(mode=0o600, exist_ok=True)
        self.stdout_log_path.touch(mode=0o600, exist_ok=True)
        self.stderr_log_path.touch(mode=0o600, exist_ok=True)

    def log_runner(self, message: str, level: str = "INFO") -> None:
        """Write a timestamped message to the runner.log file.

        Args:
            message: Log message text.
            level: Logging level (e.g. INFO, WARNING, ERROR).
        """
        timestamp = datetime.utcnow().isoformat() + "Z"
        line = f"{timestamp} [{level}] {message}\n"
        try:
            with open(self.runner_log_path, "a", encoding="utf-8") as f:
                f.write(line)
        except Exception:
            # Prevent logging failures from crashing the main runner thread
            pass

    def log_stdout(self, line: str) -> None:
        """Write a raw line from Palace stdout to palace_stdout.log.

        Args:
            line: The stdout line string.
        """
        if not line.endswith("\n"):
            line += "\n"
        try:
            with open(self.stdout_log_path, "a", encoding="utf-8") as f:
                f.write(line)
        except Exception:
            pass

    def log_stderr(self, line: str) -> None:
        """Write a raw line from Palace stderr to palace_stderr.log.

        Args:
            line: The stderr line string.
        """
        if not line.endswith("\n"):
            line += "\n"
        try:
            with open(self.stderr_log_path, "a", encoding="utf-8") as f:
                f.write(line)
        except Exception:
            pass
