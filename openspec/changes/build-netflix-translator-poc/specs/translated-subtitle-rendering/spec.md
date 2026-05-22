## ADDED Requirements

### Requirement: Render translated subtitles over playback
The extension SHALL render saved translated subtitles over the active Netflix video using the translated segment text.

#### Scenario: Saved translation is loaded
- **WHEN** a ready translated subtitle artifact is loaded for the active video
- **THEN** the extension uses that saved artifact as the rendering source

#### Scenario: Playback time enters translated segment window
- **WHEN** the Netflix video current time is within a translated segment's start and end time
- **THEN** the extension displays that segment's translated text over the video

#### Scenario: Playback time leaves translated segment window
- **WHEN** the Netflix video current time is outside the current translated segment's time window
- **THEN** the extension removes or updates the displayed subtitle text

### Requirement: Synchronize with playback controls
The extension SHALL keep translated subtitle rendering synchronized when playback is paused, resumed, or seeked.

#### Scenario: User pauses playback
- **WHEN** the user pauses the Netflix video
- **THEN** the extension keeps the subtitle state aligned with the paused playback time

#### Scenario: User seeks to a new time
- **WHEN** the user seeks to a different playback time
- **THEN** the extension displays the translated subtitle segment matching the new playback time

### Requirement: Avoid duplicate subtitle display
The extension SHALL provide a rendering mode that avoids showing both original and translated subtitles at the same time when possible.

#### Scenario: Translated subtitles are active
- **WHEN** translated subtitle rendering is enabled
- **THEN** the extension either replaces the original subtitle display or renders a translated overlay without duplicate source-language text

### Requirement: Recover from missing translated segments
The extension SHALL handle missing translated segments without interrupting playback.

#### Scenario: Current segment has no translation
- **WHEN** playback reaches a segment that has no validated translation
- **THEN** the extension does not display incorrect translated text and continues checking subsequent segments
