## Why

The extension relies on Netflix-specific DOM selectors (`[data-uia="..."]`, `.watch-video`, `.player-timedtext`, etc.) and browser-only APIs (`DOMParser`) that break when Netflix updates their UI, cannot run in service worker contexts, and couple the extension's correctness to Netflix's frontend implementation details. A network-first metadata strategy and extension-owned rendering would make the extension resilient to Netflix UI changes, enable service-worker-only subtitle parsing, and eliminate a costly MutationObserver that scans the entire DOM on every change.

## What Changes

- **Metadata extraction**: Replace DOM-scraping (`[data-uia]` selectors, script tag scanning) as the primary video metadata path with cached `nt-video-metadata` events from intercepted network responses. Demote `extractNetflixVideoContext()` to a low-confidence fallback using only stable browser primitives (`document.title`, `<meta>` tags, JSON-LD).
- **Overlay rendering**: Replace `position: absolute` overlay mounted inside Netflix containers with `position: fixed` overlay mounted on `<body>`, positioned via `video.getBoundingClientRect()`. Handle fullscreen mode via `fullscreenchange` event. Eliminate `findVideoContainer()` and its Netflix container heuristics.
- **Native subtitle hiding**: Replace the MutationObserver + `querySelectorAll` approach with CSS injection (`display: none !important`). Isolate Netflix selectors behind a best-effort adapter.
- **TTML parsing**: Make `parseTtmlWithRegex()` the default parser path. Add missing entity decoding (`&apos;`, numeric character references). Add parity tests with fixture coverage.
- **BREAKING**: `extractNetflixVideoContext()` return values may differ when network metadata is primary (higher confidence, potentially different `source` field). Code that reads `netflixContext.source` to detect `'dom-title-selector'` vs `'json-ld'` vs `'script-state'` will see `'metadata-response'` instead.

## Capabilities

### New Capabilities
- `network-first-metadata`: Video metadata sourced from intercepted network responses with DOM scraping as low-confidence fallback
- `extension-owned-overlay`: Subtitle overlay rendered via `position: fixed` on `<body>` with fullscreen support, independent of Netflix container layout
- `css-subtitle-hiding`: Native subtitle suppression via injected CSS stylesheet instead of MutationObserver
- `service-worker-ttml-parser`: TTML parsing that works identically in browser and service worker contexts using regex-based parser as default

### Modified Capabilities
<!-- No existing specs to modify -->

## Impact

- `src/content-scripts/netflix-adapter.ts`: Remove Netflix DOM selectors, add metadata cache, demote `extractNetflixVideoContext()` to fallback
- `src/content-scripts/subtitle-renderer.ts`: Replace container discovery with `position: fixed` + `video.getBoundingClientRect()`, add fullscreen handling, replace MutationObserver hiding with CSS injection
- `src/shared/subtitle-parser.ts`: Make regex parser the default, add entity decoding, keep DOMParser as opt-in fallback
- `public/page-world-observer.js`: No changes needed (already emits `nt-video-metadata` with high confidence)
- `src/shared/types.ts`: `NetflixVideoContext.source` and `confidence` field semantics change
- Tests: New unit tests for network metadata path, overlay positioning, CSS injection, and TTML parser parity