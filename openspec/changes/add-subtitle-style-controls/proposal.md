## Why

Translated subtitles currently render with fixed visual styling and a fixed position. Users need popup-level controls to tune subtitle readability for different screen sizes, viewing distance, languages, and Netflix playback layouts before enabling subtitles.

## What Changes

- Add subtitle appearance settings configurable from the extension popup.
- Allow users to change subtitle font size.
- Allow users to choose subtitle placement, including top and bottom positions.
- Add a popup preview editor that shows sample subtitle text inside a resizable preview area.
- Ensure subtitle text automatically fits inside the configured subtitle area.
- Persist appearance settings and apply them when translated subtitles are enabled or updated.
- Preserve existing translation preparation and rendering behavior when users do not customize subtitle appearance.

## Capabilities

### New Capabilities
- `subtitle-style-controls`: Popup-managed subtitle appearance settings, preview editing, persistence, and renderer application.

### Modified Capabilities

None.

## Impact

- Popup UI: `popup.html`, `src/popup/popup.ts`, `src/popup/popup.css`
- Content script renderer: `src/content-scripts/subtitle-renderer.ts`, `src/content-scripts/netflix.ts`
- Extension messaging/types: `src/shared/types.ts`, service-worker routing if settings are relayed through existing messages
- Storage: `chrome.storage.local` settings for subtitle appearance
- Tests: popup/settings behavior, renderer style application, fit-to-area behavior, and message integration
