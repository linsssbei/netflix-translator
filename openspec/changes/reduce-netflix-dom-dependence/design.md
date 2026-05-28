## Context

The Netflix Translator extension currently depends on Netflix's front-end DOM in four ways:

1. **Metadata extraction** (`netflix-adapter.ts`): Reads Netflix-specific `[data-uia="..."]` selectors, `.video-title`, `.synopsis`, `.maturity-rating` classes, and inline `<script>` text patterns to extract video title, synopsis, and maturity rating. These selectors break when Netflix updates their UI.

2. **Overlay rendering** (`subtitle-renderer.ts`): Discovers a mount container by walking up from `<video>` to a Netflix-specific `.watch-video` element, or via a large-div heuristic. Uses `position: absolute` with `bottom: 12%` inside that container.

3. **Native subtitle hiding** (`subtitle-renderer.ts`): Runs a MutationObserver on the entire `<body>` with `subtree: true`, scanning for `.player-timedtext`, `.player-timedtext-container`, and `[data-uia="player-timedtext"]` on every DOM mutation. Performance-heavy and fragile.

4. **TTML parsing** (`subtitle-parser.ts`): Uses browser `DOMParser` as the default parser, falling back to `parseTtmlWithRegex()` only when `DOMParser` is unavailable (service worker). The regex parser has known gaps in entity decoding.

The existing `page-world-observer.js` already intercepts Netflix network responses and emits `nt-video-metadata` events with `confidence: 'high'`, but `extractNetflixVideoContext()` (DOM scraping) remains the primary path in `processSubtitleCandidate()` and `buildVideoMetadata()`.

## Goals / Non-Goals

**Goals:**
- Eliminate runtime dependency on Netflix DOM selectors for metadata extraction, overlay positioning, and subtitle hiding
- Make the TTML parser work identically in browser and service worker contexts
- Preserve current functionality: video detection, subtitle display, metadata display
- Reduce performance overhead from MutationObserver-driven subtitle hiding
- Make the extension resilient to Netflix UI changes (class names, data attributes, DOM structure)

**Non-Goals:**
- Removing all Netflix-specific knowledge (the page-world observer still needs Netflix URL patterns and JSON response shapes)
- Supporting browsers other than Chrome/Chromium
- Changing the page-world observer's network interception logic
- Removing the `<video>` element dependency (it's a stable browser primitive)
- Redesigning the extension's UI or popup

## Decisions

### Decision 1: Network-first metadata with DOM fallback

**Decision**: Cache `nt-video-metadata` events by video ID and use them as the primary metadata source. Keep `extractNetflixVideoContext()` but strip it down to stable browser primitives only: `document.title`, `<meta>` tags (`og:title`, `og:description`, `twitter:*`), and `<script type="application/ld+json">` (JSON-LD). Remove all `[data-uia]` and Netflix CSS class selectors from the fallback path. Remove generic `<script>` text scanning.

**Rationale**: Network metadata arrives with `confidence: 'high'` and contains title, synopsis, maturity rating, and genres. It's more reliable than DOM scraping because Netflix's JSON API responses change far less frequently than their front-end DOM. The existing retry loop (`scheduleMetadataRefresh`) can be repurposed to wait for network metadata, only falling back to DOM primitives if no network data arrives within a timeout.

**Alternatives considered**:
- *Remove DOM fallback entirely*: Too risky — network interception can fail if Netflix changes API endpoints or response shapes. A degraded experience is better than no metadata.
- *Keep current selector fallback*: Defeats the purpose. Netflix `[data-uia]` selectors are exactly the coupling we're removing.

### Decision 2: Fixed-position overlay with fullscreen handling

**Decision**: Switch the subtitle overlay to `position: fixed` mounted on `<body>`, computing position from `video.getBoundingClientRect()`. Listen for `fullscreenchange` events and re-parent the overlay into `document.fullscreenElement` when active.

**Rationale**: The debug overlay already uses `position: fixed` on `<body>` successfully. This eliminates `findVideoContainer()` entirely (along with `.watch-video` and large-div heuristics). Computing position from the `<video>` rect is straightforward because `document.querySelector('video')` is a stable selector. A `ResizeObserver` on the `<video>` element handles size changes. The only edge case is fullscreen, which requires re-parenting into the fullscreen element.

**Alternatives considered**:
- *Shadow DOM isolation*: Provides CSS isolation but adds complexity with event delegation. The overlay already uses inline styles with `z-index: 9999`, so CSS leakage is not a practical problem.
- *iframe overlay*: Complete isolation but requires `postMessage` communication for video time sync. Over-engineered.

### Decision 3: CSS injection for native subtitle hiding

**Decision**: Replace the MutationObserver approach with a dynamically injected `<style>` element that applies `display: none !important` to Netflix subtitle selectors. Toggle hiding by adding/removing the style element.

**Rationale**: CSS injection is zero-cost at runtime (no JS overhead per DOM mutation) and automatically applies to dynamically added elements. The selectors (`.player-timedtext`, etc.) remain Netflix-specific, but they're now in a CSS declaration rather than being queried in JavaScript on every DOM mutation. If Netflix removes these classes, subtitles simply become visible — the translated overlay still works independently.

**Alternatives considered**:
- *Financial API / Netflix player controls*: No documented API to programmatically disable native subtitles.
- *Overlay-only approach (no hiding)*: Netflix's native subtitles and the translated overlay would overlap. Legibility degrades.
- *Generic heuristics (find any text near video bottom)*: Would match non-subtitle UI elements.

### Decision 4: Regex-first TTML parsing with entity decoding

**Decision**: Make `parseTtmlWithRegex()` the default parser in all contexts. Add numeric character reference decoding (`&#NNN;`, `&#xHHH;`) and `&apos;` support. Keep `DOMParser` path as an opt-in fallback for environments that want XML validation.

**Rationale**: The regex parser already handles all Netflix TTML payload shapes. Adding entity decoding closes the one known gap. Using a single parser path eliminates parity bugs. Service workers and content scripts produce identical results.

**Alternatives considered**:
- *Keep DOMParser as default in browser*: Preserves current behavior but perpetuates the parity problem. Any bug fix must be applied to both parsers.
- *Remove the regex parser*: Makes TTML parsing unavailable in service workers, breaking subtitle library management.

## Risks / Trade-offs

- **[Network metadata timing]** → Network responses may arrive seconds after page load. Mitigated by the existing retry loop (currently polling DOM, repurposed to poll cache + fallback timeout).
- **[Netflix API response changes]** → If Netflix changes their JSON response structure, `extractMetadataFromObject` may stop matching. Mitigated by its recursive deep-search approach searching 5+ key names per field.
- **[Fullscreen positioning]** → `position: fixed` on `<body>` renders behind fullscreen. Mitigated by listening for `fullscreenchange` and re-parenting.
- **[CSS subtitle hiding selectors break]** → If Netflix renames `.player-timedtext`, both subtitles display. Mitigated by this being a thin CSS contract, easily updated, and the translated overlay still renders correctly regardless.
- **[Regex parser edge cases]** → Rare TTML payloads with CDATA or numeric character references could produce garbled text. Mitigated by adding entity decoding and relying on Netflix's consistent TTML encoding.
- **[`extractNetflixVideoContext` source semantics change]** → Callers that check `netflixContext.source` for specific DOM selector names will see `'metadata-response'` instead. Mitigated by updating confidence levels and documenting the change.