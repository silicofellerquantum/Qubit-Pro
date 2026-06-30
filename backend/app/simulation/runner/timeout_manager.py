"""Asynchronous timeout management service for process execution."""

from __future__ import annotations

import asyncio
from typing import Any, Callable, Optional


class TimeoutManager:
    """Manages execution timeouts asynchronously, firing a callback upon expiration."""

    def __init__(self) -> None:
        self.timeout_task: Optional[asyncio.Task] = None

    def start(self, seconds: float, callback: Callable[[], Any]) -> None:
        """Start the timeout timer task.

        If the timer expires, the callback is executed.

        Args:
            seconds: Duration in seconds to wait before timing out.
            callback: Sync or async callback function to execute on timeout.
        """
        self.cancel()

        async def timer() -> None:
            try:
                await asyncio.sleep(seconds)
                # Fire the timeout callback
                if asyncio.iscoroutinefunction(callback):
                    await callback()
                else:
                    callback()
            except asyncio.CancelledError:
                # Expected when execution finishes before timeout
                pass

        self.timeout_task = asyncio.create_task(timer())

    def cancel(self) -> None:
        """Cancel the active timeout timer."""
        if self.timeout_task and not self.timeout_task.done():
            self.timeout_task.cancel()
        self.timeout_task = None
