# Requirements Document

## Introduction

The Magic Pencil Tool is a new interaction mode for the Qubit-Pro schematic editor. When activated, it allows users to draw a connection between two quantum components by clicking and dragging from one component pin to another. The tool provides real-time visual feedback during the drag gesture, snaps to valid component pins, enforces the same connection-validity rules already present in the editor (no duplicates, no self-loops, single connection per pin), and renders the final connection as a CPW route — identical to what the existing pin-click workflow produces.

The editor is an SVG-based canvas built with React (not ReactFlow). Components are placed as `Placement` objects and connections are stored as `Connection` objects in the `EditorState`. The `Tool` type already includes `"select"` and `"pan"`; the pencil tool adds `"pencil"` as a third option.

---

## Glossary

- **Canvas**: The SVG-based schematic editor surface managed by `EditorCanvas`.
- **Component**: A quantum hardware element (qubit, resonator, coupler, termination, etc.) described by the component catalog.
- **Connection**: A directed pair of `{ placementId, pinName }` endpoints stored in `EditorState.connections`. Rendered by the backend as a CPW route.
- **Pencil Tool**: The new `"pencil"` tool mode that enables drag-to-connect interaction.
- **Pin**: A named attachment point on a placed component (e.g. `north`, `readout`, `tie`). Defined by `PinSpec`.
- **Placement**: An instance of a component on the canvas, with position, rotation, and parameters.
- **Pending Connection**: The in-progress wire drawn from a source pin while the user is still dragging before releasing over a target pin.
- **Snap Radius**: The maximum screen-space distance (in pixels) at which the pencil cursor will magnetically snap to the nearest valid pin.
- **Valid Pin**: A pin that currently has fewer connections than its `maxConnectionsForPin` limit.
- **Validation Rules**: The set of rules enforced on connection creation: no self-loops, no duplicate edges, single-connection-per-pin capacity.

---

## Requirements

### Requirement 1: Pencil Tool Activation

**User Story:** As a circuit designer, I want to activate a pencil tool in the schematic editor toolbar, so that I can switch into a draw-to-connect interaction mode.

#### Acceptance Criteria

1. THE Editor_Toolbar SHALL display a pencil tool button alongside the existing Select and Pan tool buttons.
2. WHEN the user clicks the pencil tool button, THE Editor_State SHALL set `tool` to `"pencil"`.
3. WHEN the pencil tool is active, THE Editor_Toolbar SHALL render the pencil button in the active/highlighted visual state consistent with the existing Select and Pan button styles.
4. WHEN the user presses the `P` keyboard shortcut, THE Editor_State SHALL set `tool` to `"pencil"`.
5. WHEN the pencil tool is activated, THE Canvas_Cursor SHALL change to a crosshair cursor to signal the draw mode.

---

### Requirement 2: Initiating a Connection Drag

**User Story:** As a circuit designer, I want to start drawing a connection by pressing down on a component pin, so that I can see the connection originate from the correct port.

#### Acceptance Criteria

1. WHEN the pencil tool is active and the user presses the pointer down within the snap radius of a valid pin, THE Canvas SHALL snap the drag origin to that pin's world position.
2. WHEN the user presses the pointer down on a pin that already has the maximum allowed connections, THE Canvas SHALL reject the drag initiation and display a toast error describing the occupied pin.
3. WHEN a drag is initiated from a valid pin, THE Canvas SHALL record the source placement ID and pin name as the pending connection origin.
4. WHEN a drag is initiated, THE Canvas SHALL immediately capture the pointer so that drag-move and drag-end events are reliably received even if the cursor leaves the canvas boundary.

---

### Requirement 3: Real-Time Visual Feedback During Draw

**User Story:** As a circuit designer, I want to see a live preview line from the source pin to my cursor as I drag, so that I understand where the connection will land.

#### Acceptance Criteria

1. WHILE a pencil drag is in progress, THE Canvas SHALL render a dashed preview line from the source pin's screen position to the current cursor screen position.
2. WHILE a pencil drag is in progress and the cursor is within the snap radius of a valid target pin, THE Canvas SHALL snap the preview line endpoint to that target pin's screen position.
3. WHILE a pencil drag is in progress and the cursor is over a valid target pin, THE Canvas SHALL render a visual highlight (e.g. enlarged circle) on that target pin.
4. WHILE a pencil drag is in progress and the cursor is over an occupied or self-loop target pin, THE Canvas SHALL render the preview line in an error colour (red) and show a visual indicator on the invalid target pin.
5. WHILE a pencil drag is in progress, THE Canvas SHALL NOT move any placed component, pan the viewport, or modify any existing connection.

---

### Requirement 4: Completing a Connection

**User Story:** As a circuit designer, I want to complete a connection by releasing the pointer over a valid pin, so that a CPW route is created between the two components.

#### Acceptance Criteria

1. WHEN the user releases the pointer over a valid target pin (not the source pin, not the same placement, not already connected, not over capacity), THE Editor_State SHALL create a new `Connection` and add it to `state.connections`.
2. WHEN a connection is created by the pencil tool, THE Connection SHALL use `"RouteMeander"` as the default `routeComponentId`, matching the existing pin-click workflow.
3. WHEN a connection is created by the pencil tool, THE Editor_State SHALL set `selection` to the newly created connection, matching the existing pin-click selection behaviour.
4. WHEN a connection is created, THE Editor_State SHALL push the previous snapshot onto the undo stack so the action is reversible with Ctrl+Z.

---

### Requirement 5: Rejecting Invalid Connection Attempts

**User Story:** As a circuit designer, I want invalid connections to be silently rejected with a clear error message, so that I cannot accidentally create bad circuits.

#### Acceptance Criteria

1. WHEN the user releases the pointer outside the snap radius of any pin, THE Canvas SHALL discard the pending connection without creating any connection or modifying state.
2. WHEN the user releases the pointer over the same pin that was used to start the drag (same `placementId` and `pinName`), THE Canvas SHALL discard the pending connection.
3. WHEN the user releases the pointer over a different pin on the same placement (self-loop), THE Canvas SHALL discard the pending connection.
4. WHEN the user releases the pointer over a pin that already has the maximum number of connections, THE Canvas SHALL discard the pending connection and display a toast error describing the occupied pin.
5. WHEN the user releases the pointer over a pin that already has a connection to the source pin (duplicate edge), THE Canvas SHALL discard the pending connection and display a toast error describing the duplicate.
6. WHEN a connection attempt is discarded for any reason, THE Canvas SHALL clear the pending connection state and remove the preview line.

---

### Requirement 6: Cancelling a Draw Gesture

**User Story:** As a circuit designer, I want to cancel an in-progress connection by pressing Escape, so that I can abort an accidental drag without affecting the canvas.

#### Acceptance Criteria

1. WHEN the user presses `Escape` while a pencil drag is in progress, THE Canvas SHALL discard the pending connection and remove the preview line.
2. WHEN the user presses `Escape` while no pencil drag is in progress, THE Editor_State SHALL set `tool` to `"select"` (returning to the default tool).
3. IF the pointer is released outside the browser window while a pencil drag is in progress, THEN THE Canvas SHALL treat the event as a cancellation and discard the pending connection.

---

### Requirement 7: Pin Snap Detection

**User Story:** As a circuit designer, I want the pencil to snap to nearby pins automatically, so that I do not need pixel-perfect accuracy when targeting small port handles.

#### Acceptance Criteria

1. THE Pencil_Tool SHALL use a snap radius of 24 screen-space pixels to detect the nearest pin under the cursor.
2. WHEN multiple pins are within the snap radius and two or more share the same minimum distance, THE Pencil_Tool SHALL snap to one of those equidistant pins arbitrarily.
3. WHEN no pin is within the snap radius, THE Pencil_Tool SHALL treat the cursor position as the raw pointer position and show no snap highlight.
4. WHEN detecting snap candidates, THE Pencil_Tool SHALL consider all pins on all placements visible on the canvas except the source pin itself.

---

### Requirement 8: Pencil Tool Cursor and Visual State

**User Story:** As a circuit designer, I want consistent visual feedback about the pencil mode state, so that I always know whether I am in draw mode and whether a snap has occurred.

#### Acceptance Criteria

1. WHILE the pencil tool is active and no drag is in progress, THE Canvas SHALL display a crosshair cursor.
2. WHILE a pencil drag is in progress and the pencil tool is explicitly selected, THE Canvas SHALL display a crosshair cursor throughout the drag gesture.
3. WHEN the pencil tool is deactivated (user switches to Select or Pan), THE Canvas SHALL restore the default cursor appropriate to the newly active tool.
4. THE Preview_Line SHALL be rendered with a dashed stroke of 2px width using the primary accent colour when over a valid target, and red when over an invalid target.
5. THE Source_Pin_Indicator SHALL remain visually highlighted (enlarged dot) throughout the entire duration of the drag gesture.
