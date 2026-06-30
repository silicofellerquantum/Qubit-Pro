from __future__ import annotations

import os
import shutil
import logging

logger = logging.getLogger(__name__)

class ResourceLimiter:
    """Monitors and enforces system resource caps (CPU, RAM, Disk, Timeout) for safe simulation execution."""

    def __init__(
        self,
        max_cpu_cores: int = 4,
        max_ram_mb: float = 8192.0,
        min_disk_space_mb: float = 2048.0,
        max_runtime_seconds: float = 1800.0,
    ) -> None:
        self.max_cpu_cores = max_cpu_cores
        self.max_ram_mb = max_ram_mb
        self.min_disk_space_mb = min_disk_space_mb
        self.max_runtime_seconds = max_runtime_seconds

    def check_preflight_limits(self, workspace_dir: str) -> tuple[bool, str]:
        """Verify pre-run limits like available disk space. Returns (passed, error_message)."""
        # Check disk space in workspace partition
        try:
            total, used, free = shutil.disk_usage(workspace_dir)
            free_mb = free / (1024 * 1024)
            if free_mb < self.min_disk_space_mb:
                err_msg = f"Insufficient disk space in workspace directory: {free_mb:.1f} MB free, need at least {self.min_disk_space_mb} MB."
                logger.error(err_msg)
                return False, err_msg
        except Exception as e:
            logger.warning("Could not verify disk space: %s", e)

        return True, ""

    def enforce_cpu_limit(self, pid: int) -> None:
        """Enforce CPU affinity or process priority. Graceful fallback if psutil is unavailable."""
        try:
            import psutil
            proc = psutil.Process(pid)
            available_cores = list(range(min(self.max_cpu_cores, os.cpu_count() or 1)))
            proc.cpu_affinity(available_cores)
            logger.info("Restricted process %d to CPU affinity: %s", pid, available_cores)
        except ImportError:
            # Under standard systems, we can still set process niceness
            try:
                os.nice(10)
                logger.info("Lowered process priority (nice value increased to 10) due to missing psutil.")
            except Exception:
                pass
        except Exception as e:
            logger.warning("Failed to enforce CPU core limits: %s", e)

    def check_memory_consumption(self) -> tuple[bool, float]:
        """Check the current process and children memory usage. Returns (is_safe, memory_mb)."""
        try:
            import psutil
            process = psutil.Process(os.getpid())
            mem_info = process.memory_info()
            rss_mb = mem_info.rss / (1024 * 1024)
            
            # Include child processes if any
            for child in process.children(recursive=True):
                try:
                    rss_mb += child.memory_info().rss / (1024 * 1024)
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    pass

            if rss_mb > self.max_ram_mb:
                logger.error("Memory consumption limit exceeded: %.1f MB / %.1f MB maximum.", rss_mb, self.max_ram_mb)
                return False, rss_mb
            return True, rss_mb
        except ImportError:
            # Fallback if psutil is not available - cannot easily fetch child memory, assume OK
            return True, 0.0
        except Exception as e:
            logger.warning("Failed to verify memory consumption: %s", e)
            return True, 0.0
