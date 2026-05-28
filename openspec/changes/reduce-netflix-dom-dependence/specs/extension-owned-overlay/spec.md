## ADDED Requirements

### Requirement: Fixed-position overlay on body
The subtitle overlay SHALL be mounted on `document.body` using `position: fixed` with coordinates computed from the `<video>` element's bounding rectangle. The overlay SHALL NOT be mounted inside any Netflix-specific container element.

#### Scenario: Overlay positioning on standard playback
- **WHEN** the renderer is enabled and a `<video>` element exists on the page
- **THEN** the overlay SHALL be mounted on `document.body` with `position: fixed`, with its horizontal center aligned to the `<video>` horizontal center and its bottom edge positioned at the `<video>` bottom edge minus 12% of the `<video>` height

#### Scenario: No video element found
- **WHEN** `document.querySelector('video')` returns null
- **THEN** the overlay SHALL NOT be created, and the renderer SHALL log a warning

#### Scenario: Video element resizes
- **WHEN** the `<video>` element changes size (window resize, theater mode toggle)
- **THEN** the overlay SHALL recompute its position from the updated `video.getBoundingClientRect()` within one animation frame

### Requirement: Fullscreen overlay support
The system SHALL detect when the browser enters fullscreen mode and re-parent the overlay into the fullscreen element so that the overlay remains visible during fullscreen playback.

#### Scenario: Entering fullscreen
- **WHEN** the document enters fullscreen mode (`fullscreenchange` event fires)
- **THEN** the overlay SHALL be moved from `document.body` into `document.fullscreenElement` and repositioned relative to the `<video>` element within the fullscreen context

#### Scenario: Exiting fullscreen
- **WHEN** the document exits fullscreen mode
- **THEN** the overlay SHALL be moved back to `document.body` and repositioned relative to the `<video>` element

#### Scenario: Fullscreen with no video element
- **WHEN** fullscreen is entered but no `<video>` element exists
- **THEN** the overlay SHALL be hidden until a `<video>` element is found

### Requirement: Extension-owned DOM nodes only
The overlay and all related DOM nodes SHALL use only extension-owned class names and data attributes. The system SHALL NOT query, read, or depend on any Netflix CSS classes, `[data-uia]` attributes, or Netflix container structure for positioning or rendering.

#### Scenario: Overlay CSS class names
- **WHEN** the overlay is created
- **THEN** all CSS class names SHALL be prefixed with `nt-` (e.g., `nt-subtitle-overlay`) and SHALL NOT match any Netflix class names

### Requirement: Deterministic overlay cleanup
The system SHALL remove all extension-owned overlay nodes from the DOM when the renderer is disabled, when the video navigation occurs, or when the extension is unloaded.

#### Scenario: Renderer disabled
- **WHEN** `disable()` is called on the renderer
- **THEN** the overlay element SHALL be removed from the DOM and all event listeners (resize, fullscreen, video time) SHALL be detached

#### Scenario: Video navigation
- **WHEN** the current video ID changes (user navigates to a different video)
- **THEN** the overlay SHALL be removed and re-created for the new video context