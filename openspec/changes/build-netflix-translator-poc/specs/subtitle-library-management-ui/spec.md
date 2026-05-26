## ADDED Requirements

### Requirement: Show local subtitle library entries
The extension SHALL provide a management UI for viewing local subtitle library entries saved by the subtitle preparation workflow.

#### Scenario: Saved entries exist
- **WHEN** the user opens the subtitle library management UI
- **THEN** the UI lists saved entries with video title when known, video ID, source language, target language, status, updated time, source subtitle hash, source segment count, translated segment count, provider, and provider model when available

#### Scenario: No saved entries exist
- **WHEN** the user opens the subtitle library management UI and the local library is empty
- **THEN** the UI shows an empty state without reporting an error

### Requirement: Filter local subtitle library entries
The management UI SHALL allow users to narrow visible subtitle library entries by basic metadata.

#### Scenario: User filters by status
- **WHEN** the user selects a preparation status filter
- **THEN** the UI shows only entries matching that status

#### Scenario: User searches by title or video ID
- **WHEN** the user enters a video title or video ID query
- **THEN** the UI shows only entries whose known title or video ID matches the query

### Requirement: Inspect subtitle entry details
The management UI SHALL show source and translated subtitle details for a selected local library entry.

#### Scenario: Ready translation is selected
- **WHEN** the user opens a translation-ready entry
- **THEN** the UI shows source and translated subtitle text side by side with segment ID, start timestamp, end timestamp, source text, and translated text

#### Scenario: Source-only entry is selected
- **WHEN** the user opens an entry that has source subtitles but no ready translation
- **THEN** the UI shows source subtitle details and the current preparation status without requiring translated subtitle text

#### Scenario: Failed translation is selected
- **WHEN** the user opens a translation-failed entry
- **THEN** the UI shows source subtitle details, latest error message, translation progress metadata, and provider debug summary when available

### Requirement: Show deterministic quality diagnostics
The management UI SHALL show deterministic subtitle quality diagnostics derived from stored source and translated artifacts.

#### Scenario: Translation artifact is ready
- **WHEN** the UI displays a ready translated artifact
- **THEN** it shows total source segment count, translated segment count, missing translated segment count, empty translated segment count, stale status, provider, model, and prepared time when available

#### Scenario: Translation is partial or failed
- **WHEN** the UI displays a partial or failed translation
- **THEN** it shows validated segment count, total segment count, current batch, total batches, latest error, and updated time when available

### Requirement: Remove local subtitle data
The management UI SHALL allow users to remove local subtitle library data.

#### Scenario: User deletes a selected entry
- **WHEN** the user confirms deletion for one library entry
- **THEN** the extension removes that entry from local storage
- **AND** the management UI no longer lists it

#### Scenario: User deletes all entries for a video
- **WHEN** the user confirms deletion for all entries belonging to a video
- **THEN** the extension removes every local entry for that video ID
- **AND** the management UI refreshes to show the remaining entries
