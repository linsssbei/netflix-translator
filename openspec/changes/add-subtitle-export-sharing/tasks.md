## 1. Export Data Contracts

- [x] 1.1 Define export format identifiers for `srt`, `webvtt`, and `json-bundle` in shared TypeScript code
- [x] 1.2 Define a versioned JSON subtitle bundle type with format version, video metadata, language metadata, source subtitle hash, export timestamp, artifact metadata, and translated segments
- [x] 1.3 Define an export result type containing filename, MIME type, file extension, and generated content
- [x] 1.4 Define export eligibility validation input/output types that can represent ready, missing artifact, non-ready status, empty segments, invalid timing, and invalid text states

## 2. Shared Export Utilities

- [x] 2.1 Implement timestamp formatting helpers for SRT timestamps using `HH:MM:SS,mmm`
- [x] 2.2 Implement timestamp formatting helpers for WebVTT timestamps using `HH:MM:SS.mmm`
- [x] 2.3 Implement segment ordering and timing validation for translated artifacts
- [x] 2.4 Implement subtitle text normalization for generated file output, including CRLF/LF handling and safe cue boundary handling
- [x] 2.5 Implement sanitized deterministic filename generation using video title or video ID, source language, target language, source subtitle hash prefix, and format extension

## 3. SRT Export

- [x] 3.1 Implement SRT content generation from a validated ready translated artifact
- [x] 3.2 Ensure SRT cue indexes are sequential and independent of internal segment IDs
- [x] 3.3 Preserve readable translated line breaks inside cue text
- [x] 3.4 Reject SRT export when translated segments are empty, missing text, or have invalid timing

## 4. WebVTT Export

- [x] 4.1 Implement WebVTT content generation with a valid `WEBVTT` header
- [x] 4.2 Generate WebVTT cues in playback order from translated segments
- [x] 4.3 Escape or normalize translated text that could corrupt WebVTT cue structure
- [x] 4.4 Reject WebVTT export when translated segments are empty, missing text, or have invalid timing

## 5. JSON Bundle Export

- [x] 5.1 Implement JSON bundle generation from a ready subtitle library entry and translated artifact
- [x] 5.2 Include segment IDs, start/end milliseconds, and translated text for every translated segment
- [x] 5.3 Include optional metadata when available, including video title, provider, provider model, prepared time, source segment count, and translated segment count
- [x] 5.4 Omit raw source subtitle payload from the JSON bundle by default
- [x] 5.5 Pretty-print JSON bundle content for inspectability while keeping field names stable

## 6. Library UI Integration

- [x] 6.1 Add export controls to the subtitle library detail view for SRT, WebVTT, and JSON bundle formats
- [x] 6.2 Enable export controls only for entries that pass export eligibility validation
- [x] 6.3 Show a clear disabled or unavailable state for source-only, preparing, failed, stale, partial, or malformed entries
- [x] 6.4 Wire export controls to generate file content and trigger browser download from the extension-owned library page
- [x] 6.5 Show a user-visible error when export generation fails instead of downloading malformed content

## 7. Browser Download Integration

- [x] 7.1 Implement browser-safe file download creation for generated export content
- [x] 7.2 Use correct MIME types for SRT, WebVTT, and JSON bundle exports
- [x] 7.3 Revoke temporary object URLs after download is triggered
- [x] 7.4 Keep browser-specific download code separate from pure formatting utilities

## 8. Tests

- [x] 8.1 Add unit tests for SRT timestamp formatting and cue generation
- [x] 8.2 Add unit tests for WebVTT timestamp formatting, header generation, and cue generation
- [x] 8.3 Add unit tests for JSON bundle shape, required metadata, optional metadata, and raw source payload omission
- [x] 8.4 Add unit tests for export eligibility validation across ready, failed, preparing, stale, partial, missing artifact, empty segment, invalid timing, and empty text cases
- [x] 8.5 Add unit tests for filename sanitization and deterministic filename generation
- [x] 8.6 Add UI tests or component-level tests for visible export controls, disabled states, successful export actions, and export error handling

## 9. Documentation And Verification

- [x] 9.1 Document supported export formats and their intended use cases in the project documentation
- [x] 9.2 Document that raw source subtitle payloads are not exported by default
- [x] 9.3 Run the existing unit test suite and export-specific tests
- [x] 9.4 Manually verify export from a local `translation-ready` library entry for SRT, WebVTT, and JSON bundle formats
