## Context

The POC currently stores source subtitle metadata, raw source payloads, translated artifacts, progress metadata, and diagnostics in the local subtitle library. The management UI can list entries and inspect source/translated segments, but there is no way to download a translated subtitle artifact as a standalone file.

Export should operate from extension-owned UI contexts, not from the Netflix content script. It should use the existing `SubtitleLibraryEntry` and `TranslatedArtifact` data shape, avoid raw source subtitle redistribution by default, and keep generated output deterministic enough to test outside Chrome.

## Goals / Non-Goals

**Goals:**

- Let users export `translation-ready` artifacts as UTF-8 SRT.
- Let users export `translation-ready` artifacts as WebVTT.
- Let users export a lossless JSON bundle for extension-to-extension sharing and future import.
- Keep file formatting logic in shared, deterministic utilities that can be unit tested without Chrome.
- Add export controls to the subtitle library management UI where users already inspect local entries.
- Avoid exporting raw source subtitle payloads by default.

**Non-Goals:**

- Importing exported JSON bundles back into the library.
- Editing subtitles before export.
- Exporting partial, failed, stale, or source-only entries as complete subtitle files.
- Uploading exported subtitles to any server or sharing service.
- Supporting every subtitle format as an export target in the first version.
- Preserving Netflix TTML/DFXP styling, position, or line-level presentation metadata in SRT/VTT.

## Decisions

### Default to SRT for human sharing

Use SRT as the default export format because it is the most broadly accepted subtitle interchange format across players, subtitle editors, and media library tools. Generate numeric cue indexes from sorted translated segments instead of exposing internal segment IDs in the SRT body.

Alternatives considered:

- WebVTT only: better for browser workflows, but less universal for casual sharing.
- Raw TTML/DFXP: would preserve more source format structure, but the extension translates normalized segments and does not preserve a faithful source-format document.

### Support WebVTT as the web-native export

Generate WebVTT from the same translated segment list for browser previews, web players, and web tooling. Keep formatting simple: a `WEBVTT` header followed by timing cues and translated text. Do not add custom cue settings in the first version unless existing segment metadata later proves stable and useful.

Alternatives considered:

- Styling-rich VTT: attractive for positioning, but the current artifact only guarantees timing and translated text.
- Native browser track injection as export: belongs to playback rendering, not file export.

### Add a versioned JSON bundle for lossless project sharing

Define a project-specific JSON bundle with `formatVersion`, video metadata, languages, source subtitle hash, export timestamp, artifact metadata, and translated segments. This format should preserve segment IDs and millisecond timing so a later import feature can validate whether the bundle matches a local source subtitle.

The JSON bundle should not include `sourcePayload` by default. It may include optional non-sensitive metadata already present in `SubtitleLibraryEntry`, such as video title, provider, provider model, prepared time, source segment count, and translated segment count.

Alternatives considered:

- Use only SRT/VTT: easy to share, but loses IDs, hash, provider/debug metadata, and reliable re-import shape.
- Include raw source payload in JSON: useful for diagnostics, but increases copyright and redistribution risk.

### Export only eligible complete translations

Treat an entry as exportable only when it has status `translation-ready`, a translated artifact, and at least one valid translated segment with monotonically valid timing. The export UI should disable or hide complete-file export actions for source-only, preparing, failed, stale, or partial entries.

For stale translations, the first version should not export by default because the stored translation no longer matches the current source subtitle hash for that video. If a later workflow needs archival export of stale translations, it should be explicit and visually separate.

Alternatives considered:

- Allow partial export for diagnostics: useful for debugging, but likely confusing as a user-facing subtitle file.
- Export any artifact regardless of status: simpler, but risks sharing incomplete or mismatched subtitle files.

### Keep generation separate from download

Split export into two layers:

- Pure formatting utilities create `{ filename, mimeType, content }` for SRT, VTT, or JSON.
- UI/browser integration turns that content into a downloadable file from the library page.

This keeps formatting testable without Chrome and keeps browser download behavior isolated to extension UI code.

Alternatives considered:

- Implement export directly in the library UI: faster initially, but harder to test and reuse.
- Route export through the service worker: unnecessary unless future browser APIs require it.

## Risks / Trade-offs

- Subtitle text may contain blank lines or arrow-like strings that conflict with SRT conventions -> Normalize line endings, trim unsafe surrounding whitespace, and preserve readable multi-line text.
- Invalid segment timing can create broken files -> Validate start/end times before export and fail with a clear error instead of producing a file.
- SRT/VTT cannot preserve internal segment IDs and metadata -> Provide JSON bundle export as the lossless format.
- Exported translated subtitles may still raise copyright or redistribution concerns -> Export only translated text by default and omit raw source payload.
- Browser download APIs vary by extension context -> Keep browser-specific code small and covered with mocks where possible.
- Filenames may contain unsafe characters from video titles -> Sanitize filenames and fall back to video ID.

## Migration Plan

This change adds new export behavior without changing existing stored entries. Existing `translation-ready` library entries should become exportable as long as they contain a `translatedArtifact`. Missing optional metadata should be omitted from JSON bundles and filenames should fall back to stable identifiers.

Rollback is to remove the export controls and shared export utilities. Stored subtitle library data does not need migration.

## Open Questions

- Should stale translations remain fully blocked from export, or should the UI offer an explicit "export stale archive" action later?
- Should JSON bundles include quality diagnostics, or only the minimal metadata needed for future import?
- Should the extension eventually support side-by-side bilingual SRT/VTT exports, or keep the first version translated-only?
