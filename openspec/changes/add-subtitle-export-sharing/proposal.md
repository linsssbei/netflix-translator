## Why

Prepared translated subtitles currently stay inside local extension storage, which makes them useful for playback but hard to share, archive, inspect in external tools, or move between browser profiles. Adding export support lets users turn a ready translated artifact into common subtitle files while preserving a lossless project format for re-import and diagnostics later.

## What Changes

- Add export actions for ready translated subtitle artifacts in the local subtitle library.
- Export translated subtitles as UTF-8 SRT for the default human/shareable format.
- Export translated subtitles as WebVTT for browser and web-tool workflows.
- Export a project-specific JSON bundle that preserves artifact metadata, source subtitle hash, timing, segment IDs, and translated text for extension-to-extension sharing.
- Generate deterministic filenames from available video title or video ID, target language, source language, subtitle hash prefix, and format.
- Prevent raw source subtitle payload export by default to reduce redistribution risk for copyrighted subtitle files.
- Validate export eligibility and segment data before file generation so partial or failed translations are not exported as complete subtitle files.
- Leave import support out of scope for this change, but shape the JSON bundle so a later import feature can consume it.

## Capabilities

### New Capabilities

- `subtitle-export-sharing`: Export ready translated subtitle artifacts to shareable subtitle files and lossless extension bundle files.

### Modified Capabilities

None.

## Impact

- Local subtitle library management UI gains export controls for eligible entries.
- Shared subtitle/export utilities will format translated artifacts as SRT, WebVTT, and JSON bundle content.
- Storage read paths will load ready translated artifacts and metadata for export.
- Browser download behavior will be needed from extension-owned UI contexts.
- Tests should cover formatting, filename generation, export eligibility, escaping/newline handling, and JSON bundle shape.
