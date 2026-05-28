## ADDED Requirements

### Requirement: CSS injection for native subtitle hiding
The system SHALL hide Netflix's native subtitles by injecting a `<style>` element into `document.head` that applies `display: none !important` to Netflix subtitle selectors. The system SHALL NOT use MutationObserver or JavaScript DOM queries to hide native subtitles.

#### Scenario: Enabling subtitle hiding
- **WHEN** the renderer is enabled and `hideNativeSubtitles` is true
- **THEN** the system SHALL inject a `<style>` element into `document.head` targeting Netflix subtitle selectors with `display: none !important`

#### Scenario: Disabling subtitle hiding
- **WHEN** the renderer is disabled
- **THEN** the system SHALL remove the injected `<style>` element, restoring native subtitle visibility

#### Scenario: Netflix dynamically creates subtitle elements
- **WHEN** Netflix JavaScript creates new subtitle elements after the style is injected
- **THEN** the CSS `display: none !important` rule SHALL apply to new elements automatically without any JavaScript intervention

### Requirement: Best-effort subtitle hiding adapter
The Netflix subtitle selectors SHALL be isolated behind a configurable adapter that documents the selectors as an external contract. If selectors do not match (Netflix changes their DOM), the system SHALL log a debug message and continue without affecting translated subtitle display.

#### Scenario: Selectors match existing elements
- **WHEN** the injected CSS targets `.player-timedtext`, `.player-timedtext-container`, and `[data-uia="player-timedtext"]`
- **THEN** matching elements SHALL have `display: none !important` applied

#### Scenario: Selectors match nothing
- **WHEN** Netflix has removed or renamed the subtitle elements
- **THEN** the system SHALL log a debug-level message and the translated overlay SHALL continue to display normally

### Requirement: No MutationObserver for subtitle hiding
The system SHALL NOT observe DOM mutations for the purpose of hiding native subtitles. All hiding SHALL be achieved through CSS injection only.

#### Scenario: Subtitle hiding performance
- **WHEN** the renderer is active during video playback
- **THEN** no MutationObserver SHALL be observing the document for subtitle hiding, and no JavaScript SHALL execute per DOM mutation for subtitle hiding purposes