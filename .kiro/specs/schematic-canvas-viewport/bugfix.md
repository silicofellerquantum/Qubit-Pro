# Bugfix Requirements Document

## Introduction

The schematic editor canvas uses a fixed 40×40 mm chip coordinate space (±20 mm on each axis), which means that when a design is loaded or the editor is first opened, the viewport is sized to show the entire chip boundary rather than the actual placed components. Components that occupy only a small region of that space — a typical design might span 2–5 mm — appear as tiny objects surrounded by vast empty canvas. The bug manifests at the default/zoomed-out view; when users manually zoom in the editor looks correct. The fix requires: auto-fitting to component extents on load and on "Fit View", removing the implicit reservation of the full chip coordinate range from the default view, ensuring grid scale labels track zoom level dynamically, and making the canvas feel infinite (no hard visible boundary forcing pre-allocated empty space).

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the schematic editor is opened (or a design is loaded) THEN the system initialises the viewport to fit the entire fixed 40×40 mm chip boundary, showing ±20 mm of empty space regardless of where components are placed.

1.2 WHEN components occupy only a small area of the chip (e.g., a 2–5 mm cluster) and the editor opens at the default view THEN the system renders components as tiny shapes inside a large empty canvas, making them difficult to see or interact with.

1.3 WHEN the user triggers "Fit View" (or `fitToContent`) with placed components THEN the system computes the fit zoom correctly based on component extents, but on initial load it dispatches `zoom: 1` and `pan: {0, 0}` instead of calling `fitToContent`, so the first view is always the full chip view.

1.4 WHEN no components are placed and "Fit View" is triggered THEN the system resets to `zoom: 1, pan: {0, 0}`, centring the empty 40×40 mm chip boundary in the viewport.

1.5 WHEN the user zooms in or out THEN the grid scale ruler tick labels update (step sizes change), but the ruler tick range is clamped to `±CHIP_HALF_W` / `±CHIP_HALF_H` (±20 mm), so ticks disappear and the ruler goes blank if the user pans beyond the chip boundary.

1.6 WHEN the user pans beyond the chip boundary (more than ±20 mm from the origin) THEN the system shows a blank ruler and the canvas pan is clamped by the board pixel size, preventing exploration of coordinates outside the fixed chip extent.

### Expected Behavior (Correct)

2.1 WHEN the schematic editor is opened (or a design is loaded) with at least one placed component THEN the system SHALL automatically fit the viewport to the bounding box of all placed components with a 5–10% padding margin, so components fill the visible canvas area without surrounding empty space.

2.2 WHEN components occupy only a small area (e.g., a 2–5 mm cluster) and the editor opens THEN the system SHALL zoom and pan so that cluster fills the viewport at a comfortable scale, not fit the entire fixed 40×40 mm chip boundary.

2.3 WHEN "Fit View" is invoked THEN the system SHALL fit to the bounding box of all placed components (with padding), regardless of the fixed chip boundary dimensions, matching the behavior of the existing `fitToContent` logic.

2.4 WHEN no components are placed and "Fit View" is triggered THEN the system SHALL show a default comfortable view centered on the origin — not an empty 40×40 mm chip view — with a zoom level that makes the grid readable.

2.5 WHEN the user zooms in or out THEN the system SHALL update grid scale ruler tick labels and step sizes continuously to reflect the current zoom level, and the ruler SHALL remain populated with visible ticks at any zoom and pan position, not limited to the ±20 mm chip range.

2.6 WHEN the user pans or scrolls beyond the original chip boundary THEN the system SHALL extend the canvas seamlessly, rendering grid lines and ruler ticks for whatever coordinate region is currently visible, without hard edge boundaries or blank ruler strips.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the user manually zooms in using Ctrl+scroll or the zoom controls THEN the system SHALL CONTINUE TO zoom toward the cursor position and clamp zoom to the configured SCALE_MIN / SCALE_MAX limits.

3.2 WHEN the user pans using middle-mouse drag, the pan tool, or plain scroll/shift-scroll THEN the system SHALL CONTINUE TO pan the viewport smoothly and update component and route positions correctly.

3.3 WHEN components are placed and the user invokes "Fit View" or "Zoom to Selection" THEN the system SHALL CONTINUE TO compute bounding-box-based zoom and pan correctly, centering the selected or all components in the viewport.

3.4 WHEN the user drags a component THEN the system SHALL CONTINUE TO snap the component to the configured snap grid and constrain it within the chip coordinate bounds.

3.5 WHEN the grid display is enabled THEN the system SHALL CONTINUE TO render adaptive snap-aligned grid lines inside the visible canvas area, with major and minor line styling.

3.6 WHEN the ruler ticks are rendered THEN the system SHALL CONTINUE TO correctly classify ticks as major, half, or minor based on the current zoom step size.

3.7 WHEN the schematic editor loads with no previously placed components THEN the system SHALL CONTINUE TO display an empty, navigable canvas ready to accept new components.

3.8 WHEN coordinate transforms `w2s` (world-to-screen) and `s2w` (screen-to-world) are used for component placement, pin positions, and route rendering THEN the system SHALL CONTINUE TO produce correct pixel positions at all zoom and pan values.
