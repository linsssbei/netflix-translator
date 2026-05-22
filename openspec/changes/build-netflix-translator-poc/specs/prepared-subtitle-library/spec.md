## ADDED Requirements

### Requirement: Save prepared translated subtitle artifacts
The extension SHALL save validated translated subtitle artifacts in local extension storage after subtitle preparation succeeds.

#### Scenario: Translation preparation succeeds
- **WHEN** the translator agent returns validated translated segments for a source subtitle
- **THEN** the extension saves a translated subtitle artifact containing video ID, source language, target language, source subtitle hash, and translated segments

#### Scenario: Translation preparation fails
- **WHEN** subtitle preparation fails before validated translated segments are available
- **THEN** the extension records a failed preparation status without saving a ready translated subtitle artifact

### Requirement: Locate saved translations for playback
The extension SHALL locate ready translated subtitle artifacts for the active Netflix video before starting playback rendering.

#### Scenario: Matching saved translation exists
- **WHEN** the active video ID, source language, target language, and source subtitle hash match a ready translated subtitle artifact
- **THEN** the extension loads that saved translated subtitle artifact for rendering

#### Scenario: No matching saved translation exists
- **WHEN** the active video has no ready translated subtitle artifact for the selected target language and source subtitle hash
- **THEN** the extension reports that the video must be prepared before translated subtitles can be rendered

### Requirement: Track preparation status
The extension SHALL track subtitle preparation status for each video and target language.

#### Scenario: Subtitle preparation is in progress
- **WHEN** the extension is downloading, parsing, or translating subtitles for a video
- **THEN** it records a preparation status that can be shown to the user

#### Scenario: Source subtitle changes
- **WHEN** a saved translation exists for the video ID but the current source subtitle hash differs
- **THEN** the extension marks the saved translation as stale for the current subtitle source
