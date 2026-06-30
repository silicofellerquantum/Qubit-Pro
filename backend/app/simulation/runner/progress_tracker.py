"""Service to parse Palace execution output and track simulation progress."""

from __future__ import annotations

from typing import Callable, Optional

from app.simulation.runner.runner_models import ProgressState, SimulationStage


class ProgressTracker:
    """Parses lines from Palace stdout to estimate the current solver stage and percentage."""

    def __init__(self, on_progress: Optional[Callable[[ProgressState], None]] = None) -> None:
        """Initialize the ProgressTracker.

        Args:
            on_progress: Optional callback function triggered when progress state changes.
        """
        self.on_progress = on_progress
        self.current_state = ProgressState(
            stage=SimulationStage.STARTING,
            percentage=0.0,
            message="Initializing simulation execution...",
        )

    def update_state(
        self,
        stage: SimulationStage,
        percentage: float,
        message: Optional[str] = None,
    ) -> None:
        """Update the internal progress state and invoke the callback if changed.

        Args:
            stage: The active SimulationStage.
            percentage: Completion percentage (0.0 to 100.0).
            message: Informative message about the stage.
        """
        # Ensure percentage is clamped between 0 and 100
        clamped_pct = max(0.0, min(100.0, float(percentage)))
        
        if (
            self.current_state.stage != stage
            or abs(self.current_state.percentage - clamped_pct) > 0.01
            or self.current_state.message != message
        ):
            self.current_state = ProgressState(
                stage=stage,
                percentage=clamped_pct,
                message=message,
            )
            if self.on_progress:
                try:
                    self.on_progress(self.current_state)
                except Exception:
                    # Defensive programming: ensure callback failures do not disrupt the solver
                    pass

    def parse_line(self, line: str) -> None:
        """Parse a single line of Palace stdout and estimate simulation progress.

        Args:
            line: A raw line from Palace stdout.
        """
        line_lower = line.lower()

        # 1. Loading Mesh (10% - 29%)
        if (
            "reading mesh" in line_lower
            or "loading mesh" in line_lower
            or "read mesh" in line_lower
        ):
            self.update_stage_if_newer(SimulationStage.LOADING_MESH, 10.0, "Reading mesh file...")
        elif "grid size" in line_lower or "mesh dimension" in line_lower or "elements" in line_lower:
            self.update_stage_if_newer(SimulationStage.LOADING_MESH, 20.0, "Mesh loaded, configuring grid...")

        # 2. Initializing Solver (30% - 49%)
        elif (
            "initializing" in line_lower
            or "setting up" in line_lower
            or "setup operator" in line_lower
        ):
            self.update_stage_if_newer(
                SimulationStage.INITIALIZING_SOLVER, 30.0, "Initializing solver operators..."
            )
        elif "assembling" in line_lower or "matrix assembly" in line_lower or "boundary conditions" in line_lower:
            self.update_stage_if_newer(
                SimulationStage.INITIALIZING_SOLVER, 40.0, "Assembling system matrices..."
            )

        # 3. Solving (50% - 89%)
        elif "starting solver" in line_lower or "begin solving" in line_lower:
            self.update_stage_if_newer(SimulationStage.SOLVING, 50.0, "Solver started...")
        elif "iteration" in line_lower or "residual" in line_lower or "gmres" in line_lower:
            # Slowly increment progress within the SOLVING stage
            current_pct = self.current_state.percentage
            if self.current_state.stage == SimulationStage.SOLVING:
                new_pct = min(current_pct + 0.5, 85.0)
            else:
                new_pct = 55.0
            self.update_stage_if_newer(
                SimulationStage.SOLVING, new_pct, "Iterative solver running..."
            )
        elif "eigenmode" in line_lower or "mode " in line_lower or " eigenvalue" in line_lower:
            self.update_stage_if_newer(SimulationStage.SOLVING, 80.0, "Extracting modes...")

        # 4. Postprocessing (90% - 99%)
        elif (
            "writing" in line_lower
            or "saving" in line_lower
            or "postprocessing" in line_lower
            or "saving files" in line_lower
        ):
            self.update_stage_if_newer(
                SimulationStage.POSTPROCESSING, 90.0, "Writing simulation outputs..."
            )
        elif "field" in line_lower or "paraview" in line_lower or "vtu" in line_lower:
            self.update_stage_if_newer(
                SimulationStage.POSTPROCESSING, 95.0, "Generating visualization data..."
            )

    def update_stage_if_newer(
        self,
        stage: SimulationStage,
        percentage: float,
        message: Optional[str] = None,
    ) -> None:
        """Update progress stage, ensuring we don't regress in stages or percentages.

        Args:
            stage: The target SimulationStage.
            percentage: The target percentage.
            message: Informative message.
        """
        # Define relative ordering of stages to prevent regression
        stage_order = {
            SimulationStage.STARTING: 0,
            SimulationStage.LAUNCHING_PALACE: 1,
            SimulationStage.LOADING_MESH: 2,
            SimulationStage.INITIALIZING_SOLVER: 3,
            SimulationStage.SOLVING: 4,
            SimulationStage.POSTPROCESSING: 5,
            SimulationStage.COMPLETED: 6,
            SimulationStage.FAILED: 6,
            SimulationStage.CANCELLED: 6,
        }

        curr_order = stage_order.get(self.current_state.stage, 0)
        target_order = stage_order.get(stage, 0)

        if target_order > curr_order:
            self.update_state(stage, percentage, message)
        elif target_order == curr_order:
            # If in the same stage, only allow percentage to increase
            if percentage > self.current_state.percentage:
                self.update_state(stage, percentage, message)
