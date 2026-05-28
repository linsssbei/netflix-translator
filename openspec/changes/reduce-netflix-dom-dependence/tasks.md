## 1. Current DOM Dependency Audit

- [x] 1.1 Confirm all Netflix page DOM reads in `src/content-scripts/netflix-adapter.ts`: meta tags, JSON-LD scripts, generic script text scanning, title/synopsis/maturity selectors, document title fallback, and page-world observer injection mount
- [x] 1.2 Confirm all Netflix player DOM reads in `src/content-scripts/subtitle-renderer.ts`: video lookup, container walking, `.watch-video` fallback, large-div heuristic, native subtitle selector hiding, and mutation observation
- [x] 1.3 Confirm TTML parser DOM usage in `src/shared/subtitle-parser.ts`: `DOMParser`, XML `querySelector`, paragraph node traversal, and browser-first parser selection
- [x] 1.4 Classify each dependency as extension-owned DOM, stable browser primitive, Netflix page DOM, Netflix CSS selector, or payload parsing

## 2. Metadata Without Netflix Page DOM

- [x] 2.1 Define a network-first metadata contract emitted by `public/page-world-observer.js` from intercepted Netflix JSON responses
- [x] 2.2 Replace `extractNetflixVideoContext()` as the primary metadata path with cached `nt-video-metadata` events keyed by video ID
- [x] 2.3 Remove or demote DOM title/synopsis/maturity selectors to explicit low-confidence fallback behavior
- [x] 2.4 Remove generic script tag scanning for page state unless a later design explicitly justifies it
- [x] 2.5 Add stale/empty metadata handling so subtitle acquisition can proceed without page DOM context

## 3. Playback And Overlay Without Netflix Container Parsing

- [x] 3.1 Decide whether playback time should come from the `<video>` element, request animation timing, or another stable page-world signal
- [x] 3.2 Replace Netflix container discovery heuristics with an extension-owned fixed overlay root when feasible
- [x] 3.3 Limit DOM attachment to extension-owned nodes and standard browser elements, avoiding Netflix class and layout selectors
- [x] 3.4 Add deterministic cleanup for extension-owned overlay nodes across video navigation and renderer disable
- [x] 3.5 Verify overlay positioning across fullscreen, theater-size, and resized player states without relying on Netflix container classes

## 4. Native Subtitle Handling

- [x] 4.1 Reevaluate whether native subtitles need DOM hiding once translated overlay timing is driven independently
- [x] 4.2 Prefer user/player subtitle settings or non-DOM strategies over hiding Netflix subtitle nodes by selector
- [x] 4.3 If hiding remains necessary, isolate it behind a best-effort adapter with clear failure tolerance and no impact on translation playback
- [x] 4.4 Remove renderer correctness dependencies on `.player-timedtext`, `.player-timedtext-container`, `[data-uia="player-timedtext"]`, and related Netflix selectors

## 5. Subtitle Payload Parsing

- [x] 5.1 Decide whether `parseTtml()` should always use the service-worker-safe parser path for consistency
- [x] 5.2 Replace browser `DOMParser` as the default TTML path or isolate it behind fixture-proven parser parity tests
- [x] 5.3 Add parity tests proving TTML payloads parse identically outside DOM-capable contexts
- [x] 5.4 Add fixture coverage for TTML namespaces, `<br>`, nested spans, tick rates, `dur`, escaped entities, and malformed payloads

## 6. Tests And Acceptance Criteria

- [x] 6.1 Add unit tests proving metadata extraction works from intercepted JSON events without any Netflix DOM fixtures
- [x] 6.2 Add renderer tests that fail if Netflix-specific selectors are required for normal overlay display
- [x] 6.3 Add parser tests that run with `DOMParser` unavailable and cover expected Netflix TTML payload shapes
- [x] 6.4 Add an extension E2E fixture page that validates subtitle acquisition and overlay display without Netflix DOM selector coupling
- [x] 6.5 Keep an optional live Netflix smoke test for logged-in manual validation, but do not make live DOM selectors part of CI acceptance
