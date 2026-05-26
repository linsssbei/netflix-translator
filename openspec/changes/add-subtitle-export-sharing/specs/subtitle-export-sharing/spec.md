## ADDED Requirements

### Requirement: Export translated subtitles as SRT
The extension SHALL allow users to export a ready translated subtitle artifact as a UTF-8 SRT file.

#### Scenario: Ready translation is exported as SRT
- **WHEN** the user exports a `translation-ready` library entry as SRT
- **THEN** the extension downloads an `.srt` file containing all translated segments in playback order
- **AND** each cue uses sequential numeric indexes, SRT timestamp formatting, and translated subtitle text

#### Scenario: SRT export preserves translated line breaks
- **WHEN** translated segment text contains readable line breaks
- **THEN** the SRT output preserves those line breaks within the cue text without corrupting cue boundaries

### Requirement: Export translated subtitles as WebVTT
The extension SHALL allow users to export a ready translated subtitle artifact as a UTF-8 WebVTT file.

#### Scenario: Ready translation is exported as WebVTT
- **WHEN** the user exports a `translation-ready` library entry as WebVTT
- **THEN** the extension downloads a `.vtt` file with a `WEBVTT` header and all translated cues in playback order
- **AND** each cue uses WebVTT timestamp formatting and translated subtitle text

#### Scenario: WebVTT text is escaped safely
- **WHEN** translated segment text contains characters that could be interpreted as WebVTT markup or cue syntax
- **THEN** the exported WebVTT file preserves readable text without creating invalid cue structure

### Requirement: Export lossless subtitle sharing bundle
The extension SHALL allow users to export a ready translated subtitle artifact as a versioned JSON bundle for extension-to-extension sharing and future import.

#### Scenario: Ready translation is exported as JSON bundle
- **WHEN** the user exports a `translation-ready` library entry as a JSON bundle
- **THEN** the extension downloads a `.json` file containing `formatVersion`, video ID, optional video title, source language, target language, source subtitle hash, export timestamp, artifact metadata, and translated segments

#### Scenario: JSON bundle preserves segment identity and timing
- **WHEN** a translated artifact is exported as a JSON bundle
- **THEN** each exported segment includes its segment ID, start time in milliseconds, end time in milliseconds, and translated text

#### Scenario: JSON bundle omits raw source subtitle payload
- **WHEN** a translated artifact is exported as a JSON bundle
- **THEN** the exported JSON does not include the raw source subtitle payload by default

### Requirement: Restrict export eligibility
The extension SHALL only expose complete subtitle file export actions for valid ready translated subtitle artifacts.

#### Scenario: Entry is ready for export
- **WHEN** a library entry has status `translation-ready`, a translated artifact, and valid translated segments
- **THEN** the management UI enables SRT, WebVTT, and JSON bundle export actions for that entry

#### Scenario: Entry is not ready for export
- **WHEN** a library entry is source-only, preparing, failed, stale, partial, or missing a translated artifact
- **THEN** the management UI does not export that entry as a complete subtitle file

#### Scenario: Export validation fails
- **WHEN** an export request encounters missing translated text, invalid timing, or an empty segment list
- **THEN** the extension reports that export failed and does not download a malformed subtitle file

### Requirement: Generate deterministic export files
The extension SHALL generate export file content and filenames deterministically from stored subtitle library data.

#### Scenario: Export filename is generated
- **WHEN** the extension prepares an export file
- **THEN** the filename includes a sanitized video title when available or the video ID as fallback, the source language, target language, source subtitle hash prefix, and file extension

#### Scenario: Export content is generated repeatedly
- **WHEN** the same library entry is exported multiple times in the same format without data changes
- **THEN** the exported SRT and WebVTT file contents are identical

#### Scenario: JSON export records export time
- **WHEN** the same library entry is exported multiple times as a JSON bundle
- **THEN** only explicitly time-dependent JSON fields such as export timestamp may differ
