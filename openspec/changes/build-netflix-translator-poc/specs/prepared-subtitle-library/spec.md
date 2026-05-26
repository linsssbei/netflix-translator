## ADDED Requirements

### Requirement: Save prepared translated subtitle artifacts
The extension SHALL save validated translated subtitle artifacts in local extension storage and support incremental updates while subtitle preparation is in progress.

#### Scenario: Translation preparation succeeds
- **WHEN** the translator agent returns validated translated segments for a source subtitle
- **THEN** the extension saves a translated subtitle artifact containing video ID, source language, target language, source subtitle hash, and translated segments

#### Scenario: Translation batch succeeds
- **WHEN** the translator agent validates a batch of translated segments during preparation
- **THEN** the extension appends those segments to the stored translated artifact for the same source subtitle
- **AND** it preserves existing validated segments from earlier batches

#### Scenario: Translation preparation fails
- **WHEN** subtitle preparation fails before validated translated segments are available
- **THEN** the extension records a failed preparation status without saving a ready translated subtitle artifact

#### Scenario: Translation preparation fails after partial progress
- **WHEN** subtitle preparation fails after one or more validated batches have been saved
- **THEN** the extension keeps the partial translated artifact for diagnostics but does not expose it as ready for playback rendering

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

#### Scenario: Batch preparation progress changes
- **WHEN** an incremental translation batch starts, succeeds, or fails
- **THEN** the extension records progress metadata including current batch, total batches, validated segment count, total segment count, provider model, and the latest error or response summary when available

#### Scenario: Source subtitle changes
- **WHEN** a saved translation exists for the video ID but the current source subtitle hash differs
- **THEN** the extension marks the saved translation as stale for the current subtitle source

### Requirement: Store inspection metadata
The extension SHALL store enough local metadata to inspect saved subtitle library entries without re-opening Netflix playback.

#### Scenario: Source subtitle is saved
- **WHEN** the extension saves a source subtitle library entry
- **THEN** it stores the video ID, optional video title, source language, target language, source subtitle hash, format, acquisition method, updated time, and source segment count when available

#### Scenario: Translation artifact is saved
- **WHEN** the extension saves a translated subtitle artifact
- **THEN** it stores translated segment count, provider, provider model when available, prepared time, and latest validation/progress metadata

### Requirement: List local subtitle library entries
The extension SHALL provide storage operations for listing local subtitle library entries across videos, languages, and statuses.

#### Scenario: Library contains entries
- **WHEN** the management UI requests saved subtitle library entries
- **THEN** the library returns entries sorted by most recent update time with metadata needed for list display

#### Scenario: Library is empty
- **WHEN** the management UI requests saved subtitle library entries and none exist
- **THEN** the library returns an empty list without error

### Requirement: Load entry details for inspection
The extension SHALL provide storage operations for loading source and translated subtitle details for a selected local library entry.

#### Scenario: Entry has source and translated subtitles
- **WHEN** the user opens a ready translated library entry
- **THEN** the library returns source subtitle text or parsed source segments, translated segments, timing values, status, progress metadata, and latest error/debug information when available

#### Scenario: Entry has source subtitles only
- **WHEN** the user opens a source-ready or failed library entry without a ready translation
- **THEN** the library returns source subtitle details and status diagnostics without requiring translated segments

### Requirement: Remove local subtitle library entries
The extension SHALL allow users to delete selected local subtitle library entries.

#### Scenario: User deletes one entry
- **WHEN** the user confirms deletion for a selected library entry
- **THEN** the extension removes the source payload, translated artifact, progress metadata, and status for that entry from local storage

#### Scenario: User deletes entries for a video
- **WHEN** the user confirms deletion for all entries belonging to a video
- **THEN** the extension removes every local library entry with that video ID
