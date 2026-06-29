# Requirements Document

## Introduction

The Route Override Fields Pre-Population feature improves the connection editing experience in the quantum chip schematic editor. Currently, when a user creates a connection between two component pins, the Route Override fields in the Property Inspector (Total Length, Fillet, Lead Length, Trace Width, Trace Gap) are blank by default. Users must know the Qiskit Metal defaults from memory or documentation before setting meaningful overrides.

This feature introduces a single `ROUTE_DEFAULTS` configuration object keyed by route component ID. This object becomes the single source of truth for: (a) the display value shown in each override field when no explicit override has been saved, and (b) the hint text shown in the "Route overrides" section header. When the user switches the Route Component dropdown, the displayed default values update to match the selected component's known defaults. If the user clears a field back to blank, the override is removed from the store, preserving the existing "blank = Qiskit Metal decides" semantics.

## Glossary

- **ConnectionInspector**: The React component in `property-inspector.tsx` that renders when a connection is selected. It exposes the Route Component dropdown and the Route Overrides section.
- **Route_Override_Fields**: The five editable input fields in the Route Overrides section: Total Length, Fillet, Lead Length, Trace Width, Trace Gap.
- **ROUTE_DEFAULTS**: A new TypeScript constant of type `Record<string, Record<string, string>>` keyed by route component ID. Each entry maps override field keys to their default string values (e.g., `"7mm"`, `"99um"`).
- **RouteOverrideField**: The existing reusable React component that renders a single labelled input field for a route override value.
- **FilletField**: The existing specialised React component that renders the Fillet input with negative-value validation.
- **Display value**: The value shown inside an input field at any given moment. When no explicit override is stored, the display value is the component's known default from `ROUTE_DEFAULTS`. When an override is stored, the display value is that stored override.
- **Stored override**: A key/value pair present in `connection.routeOverrides` in the design store. Blank fields do not produce stored overrides.
- **routeOverrides**: The `Record<string, string | number> | undefined` field on the `Connection` data model that persists user-supplied overrides to the store.
- **Hint text**: The descriptive paragraph rendered just below the "Route overrides" section heading, e.g. "Blank = Qiskit Metal default. Defaults: length 7mm · fillet 99um …".
- **RouteMeander**: The default Qiskit Metal route component for meandering CPW routes.
- **RouteStraight**: A Qiskit Metal route component for straight CPW connections. Has different defaults (no fillet, shorter total length).

---

## Requirements

### Requirement 1: Single Source of Truth for Route Defaults

**User Story:** As a frontend developer maintaining the editor, I want all per-component default values to be defined in one place, so that updating a default value is a single-line change that automatically propagates to every consumer.

#### Acceptance Criteria

1. THE Property_Inspector_Module SHALL define a `ROUTE_DEFAULTS` constant of type `Record<string, Record<string, string>>` where the outer key is the route component ID (e.g. `"RouteMeander"`) and the inner keys are override field names (`total_length`, `fillet`, `lead_length`, `trace_width`, `trace_gap`).
2. THE `ROUTE_DEFAULTS` constant SHALL contain an entry for `"RouteMeander"` with exactly these values: `total_length = "7mm"`, `fillet = "99um"`, `lead_length = "30um"`, `trace_width = "10um"`, `trace_gap = "6um"`.
3. THE `ROUTE_DEFAULTS` constant SHALL contain an entry for `"RouteStraight"` with exactly these values: `total_length = "7mm"`, `trace_width = "10um"`, `trace_gap = "6um"` — and SHALL NOT contain keys `fillet` or `lead_length` for `"RouteStraight"`, because RouteStraight does not accept those parameters.
4. WHEN `ROUTE_DEFAULTS` is queried for a key that does not exist in the inner map for a given component (e.g. `fillet` for `"RouteStraight"`), THE lookup SHALL return `undefined`, and the calling code SHALL treat `undefined` as "no default available for this component/field combination."
5. THE existing `ROUTE_MEANDER_DEFAULTS` constant (currently defined in `property-inspector.tsx`) SHALL be deleted, and every reference to `ROUTE_MEANDER_DEFAULTS` in the same file SHALL be replaced with `ROUTE_DEFAULTS["RouteMeander"]`.
6. WHEN a developer changes a single value in `ROUTE_DEFAULTS` (e.g. changes `fillet` for `"RouteMeander"` from `"99um"` to `"50um"`), THE hint text rendered in `ConnectionInspector` and the placeholder/display value shown in the corresponding `RouteOverrideField` or `FilletField` SHALL both automatically reflect the new value without any other code changes.

---

### Requirement 2: Pre-Populated Display Values in Route Override Fields

**User Story:** As a chip designer, I want the Route Override fields to show the component's known default values when I first select a connection, so that I have a meaningful starting point without needing to look up defaults from external documentation.

#### Acceptance Criteria

1. WHEN a connection is selected and `connection.routeOverrides` does not contain a value for a non-`fillet` field key, THE `RouteOverrideField` component SHALL display the default value from `ROUTE_DEFAULTS[routeComponentId][fieldKey]` as a placeholder (not as the controlled input value), so the field appears pre-filled visually but contains no committed value.
2. WHEN a connection is selected and `connection.routeOverrides` does not contain a value for the `fillet` key, THE `FilletField` component SHALL display the default fillet value from `ROUTE_DEFAULTS[routeComponentId]["fillet"]` as a placeholder (not as the controlled input value), consistent with criterion 1.
3. WHEN `connection.routeComponentId` is undefined or is a key not present in `ROUTE_DEFAULTS`, BOTH `RouteOverrideField` AND `FilletField` SHALL fall back to using `ROUTE_DEFAULTS["RouteMeander"]` as the source of default placeholder values.
4. WHEN `connection.routeOverrides` contains an explicit stored value for a field key, THE corresponding `RouteOverrideField` or `FilletField` SHALL display that stored override value as the controlled input value, not the default from `ROUTE_DEFAULTS`.
5. THE display of default values in the Route_Override_Fields SHALL NOT write anything to `connection.routeOverrides` in the design store; the store entry for any field remains absent until the user actively commits an edited value to that specific field.

---

### Requirement 3: Route Component Switch Updates Display Defaults

**User Story:** As a chip designer, I want the Route Override fields to immediately reflect the selected route component's defaults when I change the Route Component dropdown, so that the displayed defaults are always relevant to the active component.

#### Acceptance Criteria

1. WHEN the user selects a different route component from the Route Component dropdown, THE Route_Override_Fields SHALL update their displayed default values to reflect the new component's entry in `ROUTE_DEFAULTS`.
2. WHEN the user switches from `RouteMeander` to `RouteStraight`, THE Fillet field and Lead Length field SHALL display empty/blank (because `RouteStraight` has no entry for those keys in `ROUTE_DEFAULTS`) rather than the previous component's defaults.
3. WHEN the user switches from `RouteStraight` to `RouteMeander`, THE Fillet field and Lead Length field SHALL display the `RouteMeander` defaults from `ROUTE_DEFAULTS`.
4. WHEN the user switches route component but has previously stored explicit overrides, THE fields that have stored overrides SHALL continue to display those stored override values, not the new component's defaults.

---

### Requirement 4: Blank Field Preserves Delete-on-Blank Behaviour

**User Story:** As a chip designer, I want to clear a Route Override field back to blank so that Qiskit Metal uses its own internal default for that parameter, consistent with the existing behaviour.

#### Acceptance Criteria

1. WHEN the user clears a Route_Override_Field to an empty string and commits the value (by pressing Enter or leaving focus), THE `updateRouteOverride` function SHALL delete the corresponding key from `connection.routeOverrides`.
2. WHEN the user clears all Route_Override_Fields to blank, THE `updateRouteOverride` function SHALL set `connection.routeOverrides` to `undefined` in the design store.
3. AFTER the user clears a Route_Override_Field to blank, THE field SHALL display the default value from `ROUTE_DEFAULTS` for the active route component (not the empty string), because no stored override exists.
4. THE existing `updateRouteOverride` helper function behaviour SHALL be preserved unchanged: a blank committed value removes the key; a non-blank value stores the key.

---

### Requirement 5: Hint Text Driven by ROUTE_DEFAULTS

**User Story:** As a chip designer, I want the hint text beneath the "Route overrides" heading to accurately reflect the current component's defaults, so that the UI is self-consistent and does not show stale hardcoded strings.

#### Acceptance Criteria

1. THE `ConnectionInspector` component SHALL derive the hint text for the "Route overrides" section from `ROUTE_DEFAULTS` using the connection's `routeComponentId`, rather than using a hardcoded string literal.
2. WHEN `connection.routeComponentId` is `"RouteMeander"` or is undefined, THE hint text SHALL list all five default values from `ROUTE_DEFAULTS["RouteMeander"]`.
3. WHEN `connection.routeComponentId` is `"RouteStraight"`, THE hint text SHALL list only the fields present in `ROUTE_DEFAULTS["RouteStraight"]` (total length, trace width, trace gap) without mentioning fillet or lead length.
4. THE `lead_length` inconsistency between the current hardcoded hint text (which incorrectly states "lead 50um") and the current `ROUTE_MEANDER_DEFAULTS` constant (which correctly stores "30um") SHALL be resolved: the hint text SHALL display "30um" for lead length, sourced from `ROUTE_DEFAULTS`.
5. WHEN a developer changes a default value in `ROUTE_DEFAULTS`, THE hint text SHALL automatically reflect the updated value without any additional code changes.

---

### Requirement 6: No Defaults Written to the Design Store

**User Story:** As a chip designer, I want the pre-populated field values to be display-only, so that my design file does not accumulate spurious overrides for every connection and remains clean and minimal.

#### Acceptance Criteria

1. WHEN a connection is first created (pin-to-pin drag), THE `connection.routeOverrides` property in the design store SHALL remain `undefined` unless the user explicitly edits and commits a value.
2. THE `ConnectionInspector` component SHALL NOT dispatch any `UPDATE_CONNECTION` action on mount or on route component change to pre-fill `routeOverrides` with default values.
3. THE display of default values in the Route_Override_Fields SHALL be achieved solely through the `value` prop passed to the controlled input components, computed from `ROUTE_DEFAULTS` at render time.
4. WHEN the design is serialised and saved (via the existing persistence layer), connections with no user-supplied overrides SHALL have `routeOverrides` as `undefined` or absent from the serialised output.
