"""Process manager for spawning, streaming, and terminating subprocesses safely."""

from __future__ import annotations

import asyncio
import logging
import os
import signal
from pathlib import Path
from typing import Any, Callable, List, Optional

logger = logging.getLogger(__name__)


class ProcessManager:
    """Spawns subprocesses in isolated process groups to manage execution lifecycle and cancellation."""

    def __init__(self) -> None:
        self.proc: Optional[asyncio.subprocess.Process] = None
        self._exit_code: Optional[int] = None
        self._terminated_or_killed: bool = False

    @property
    def pid(self) -> Optional[int]:
        """Get the PID of the spawned process."""
        return self.proc.pid if self.proc else None

    @property
    def returncode(self) -> Optional[int]:
        """Get the exit code of the completed process."""
        if self._exit_code is not None:
            return self._exit_code
        return self.proc.returncode if self.proc else None

    @property
    def is_running(self) -> bool:
        """Check if the process is currently active."""
        return self.proc is not None and self.proc.returncode is None

    async def spawn(
        self,
        cmd: List[str],
        env: Optional[Dict[str, str]] = None,
        cwd: Optional[str | Path] = None,
    ) -> None:
        """Spawn the process in a new process group.

        Using a new process group allows sending signals (SIGTERM/SIGKILL) to the entire
        process group (PGID) to terminate both the launcher (e.g. mpirun) and all its workers.

        Args:
            cmd: List of command-line arguments.
            env: Optional environment variables.
            cwd: Optional working directory path.
        """
        if self.is_running:
            raise RuntimeError("Process is already running.")

        logger.info("Spawning subprocess: %s", " ".join(cmd))
        self._exit_code = None
        self._terminated_or_killed = False

        try:
            # start_new_session=True creates a new process group (PGID = PID)
            self.proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env,
                cwd=cwd,
                start_new_session=True,
            )
            logger.info("Subprocess successfully spawned with PID: %d", self.pid)
        except Exception as e:
            logger.error("Subprocess launch failed: %s", e)
            raise e

    async def read_streams(
        self,
        on_stdout: Callable[[str], None],
        on_stderr: Callable[[str], None],
    ) -> None:
        """Asynchronously read stdout and stderr lines and forward to callbacks.

        This prevents process hanging due to OS stream pipe buffer saturation.

        Args:
            on_stdout: Callback for stdout lines.
            on_stderr: Callback for stderr lines.
        """
        if not self.proc:
            return

        async def read_stream(stream: Any, callback: Callable[[str], None]) -> None:
            while True:
                line = await stream.readline()
                if not line:
                    break
                decoded = line.decode(errors="replace")
                try:
                    callback(decoded)
                except Exception:
                    pass

        await asyncio.gather(
            read_stream(self.proc.stdout, on_stdout),
            read_stream(self.proc.stderr, on_stderr),
        )

    async def wait(self) -> int:
        """Wait for the process to complete and capture its exit code."""
        if not self.proc:
            raise RuntimeError("No process spawned.")
        self._exit_code = await self.proc.wait()
        return self._exit_code

    async def terminate(self, grace_period: float = 5.0) -> None:
        """Gracefully terminate the process and its entire process group.

        Sends SIGTERM to the process group, waits for the grace period, and escalates
        to SIGKILL if the process group remains active.

        Args:
            grace_period: Time in seconds to wait before sending SIGKILL.
        """
        if not self.is_running:
            return

        pid = self.pid
        if not pid:
            return

        logger.warning("Terminating process group PGID: %d...", pid)
        self._terminated_or_killed = True

        try:
            # Negative PID sends the signal to the entire process group (PGID == PID)
            os.killpg(pid, signal.SIGTERM)
        except ProcessLookupError:
            # Process already completed
            return
        except Exception as e:
            logger.error("Failed to send SIGTERM to process group %d: %s", pid, e)

        # Poll process state during grace period
        elapsed = 0.0
        poll_interval = 0.1
        while elapsed < grace_period:
            if not self.is_running:
                logger.info("Process group %d exited gracefully.", pid)
                return
            await asyncio.sleep(poll_interval)
            elapsed += poll_interval

        # Escalate to SIGKILL if still running
        if self.is_running:
            logger.warning(
                "Process group %d failed to terminate within %.1fs. Sending SIGKILL...",
                pid,
                grace_period,
            )
            try:
                os.killpg(pid, signal.SIGKILL)
                await self.proc.wait()
                logger.info("Process group %d terminated via SIGKILL.", pid)
            except ProcessLookupError:
                pass
            except Exception as e:
                logger.error("Failed to send SIGKILL to process group %d: %s", pid, e)
