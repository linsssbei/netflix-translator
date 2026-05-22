## Context

This is a new Chrome extension POC for Netflix subtitle translation. The repository currently contains OpenSpec artifacts only, so the first implementation will establish the extension structure, browser integration, subtitle data model, translation boundary, and rendering approach.

Netflix is a single-page web application. The extension must detect navigation changes after initial page load, identify active playback, discover subtitle resources exposed to the browser, prepare translated subtitle artifacts, and render saved translated subtitles without relying on Netflix to provide the target language. The POC should keep provider-specific translation logic isolated so the translator service can change later.

The POC has two hard feasibility gates: video identity detection and subtitle payload acquisition. If the extension cannot reliably detect the Netflix video ID and acquire at least one real original-language subtitle payload without DOM subtitle parsing or media downloading, the rest of the POC should pause because translation and rendering would not prove the core concept.

## Goals / Non-Goals

**Goals:**

- Build a Chrome extension that activates only on Netflix watch pages.
- Detect the active Netflix video ID from URL/page navigation.
- Discover an original-language subtitle resource available to the page.
- Parse subtitle files into a normalized segment model with start time, end time, and source text.
- Produce a cleaned translation input that omits unnecessary subtitle metadata.
- Translate the full subtitle file once into a user-selected target language, initially Chinese.
- Save prepared translated subtitle artifacts locally for later playback.
- Render saved translated subtitles in sync with Netflix playback.
- Keep the architecture extensible for additional translation providers, subtitle formats, and target languages.

**Non-Goals:**

- Bypassing DRM, accessing protected media streams, or downloading video content.
- Guaranteeing support for every Netflix subtitle format in the first POC.
- Publishing to the Chrome Web Store.
- Building a full account, billing, glossary, or translation memory system.
- Persisting or redistributing copyrighted subtitle files beyond what is needed for local user playback.

## Decisions

### Use a Manifest V3 Chrome extension

Use Manifest V3 with a content script for Netflix page integration, a service worker for cross-origin/network coordination where needed, and an extension UI for target-language and provider settings.

Alternatives considered:

- Userscript: faster for experimentation, but weaker packaging, permissions, and settings story.
- Standalone web app: cannot reliably interact with Netflix playback DOM or page-local subtitle resources.

### Treat Netflix integration as a page adapter

Create a Netflix-specific adapter responsible for URL detection, video ID extraction, subtitle resource discovery, and playback time observation. Keep subtitle parsing, translation, and rendering behind generic interfaces.

Alternatives considered:

- Implement everything in one content script: simpler initially, but difficult to extend or test.
- Build a generic streaming-site adapter first: unnecessary scope for the POC.

### Acquire subtitle files through network resource discovery

Discover subtitle resources by observing Netflix network activity for subtitle/caption/timed-text requests, then acquire the subtitle payload as a text resource. The primary path is to capture the subtitle resource URL and required request context, then fetch that subtitle file from the extension service worker or content script. If the URL cannot be re-fetched due to session, header, or CORS constraints, use a page-world fetch/XHR observer to clone only subtitle text responses and pass the payload to the extension.

Do not parse rendered subtitle DOM as an extraction source. The DOM is presentation output, can be lossy, and is more likely to break when Netflix changes internal rendering. Also do not rely on Chrome's HTTP cache as a source of subtitle payloads because normal Chrome extension APIs do not expose arbitrary cached response bodies.

Alternatives considered:

- Parse visible subtitle DOM: rejected because it is unstable, incomplete, and presentation-specific.
- Read Chrome's already-downloaded cache entry: rejected because extensions do not have a supported API for arbitrary cache body access.
- Use Chrome debugger/DevTools Protocol to read network response bodies: useful for manual investigation, but too invasive for the user-facing POC.
- Hard-code Netflix subtitle endpoints: brittle because URL formats and request context can change.

### Normalize subtitles before translation

Represent subtitles as an ordered list of segments: `id`, `startMs`, `endMs`, `sourceText`, and optional metadata. The cleaned translation input should contain only stable segment IDs, timing, and text.

Alternatives considered:

- Send raw subtitle XML to the translator: preserves all data, but increases token usage and couples translation to Netflix formats.
- Convert immediately to SRT/VTT: familiar formats, but segment IDs and structured validation are easier with JSON.

### Prepare and persist translated subtitle artifacts before playback

Do not depend on live translation during playback. The extension should first prepare a translation by downloading the original subtitle file, normalizing it, translating the full subtitle set once, validating the result, and saving a translated subtitle artifact in local extension storage. During playback, the extension should locate a ready translated artifact and render from local data.

Store metadata separately from translated subtitle payloads so the extension can track preparation status and find saved translations. Use a lookup key based on `videoId`, `sourceLanguage`, `targetLanguage`, and `sourceSubtitleHash`, not just `videoId`, because Netflix can expose multiple subtitle tracks or change subtitle payloads for the same title.

Initial storage can be `chrome.storage.local` behind a storage interface. If subtitle payload size or library size becomes a problem, the implementation can swap the payload store to IndexedDB without changing the rest of the pipeline.

Alternatives considered:

- Live translation during playback: rejected for the POC because it introduces avoidable latency, cost, retry, and partial-rendering problems.
- Key only by video ID: rejected because it cannot distinguish source language, target language, forced/SDH tracks, or changed subtitle content.
- Use a real backend database: unnecessary for the POC and creates avoidable deployment and privacy scope.

### Isolate the translator provider

Expose a translator-agent interface that accepts normalized segments and target language, then returns translated segments with matching IDs and timing. Validate provider output before rendering.

Alternatives considered:

- Hard-code a single API call in the content script: faster, but mixes secrets/network concerns with page code.
- Translate line by line independently: simple, but lower quality and more likely to lose context.

### Render an extension-owned subtitle overlay

Render saved translated subtitles in an extension-owned overlay synchronized to the Netflix video element current time. Hide or avoid relying on Netflix subtitle DOM replacement for the POC unless a stable native subtitle replacement path is discovered.

Alternatives considered:

- Inject translated text into Netflix's subtitle DOM: could look native, but Netflix class names and rendering internals are unstable.
- Generate a local WebVTT track: attractive if accepted by the player, but Netflix's player may not expose a reliable track injection path.

## Risks / Trade-offs

- Video ID detection or subtitle payload acquisition may not be feasible with acceptable extension permissions -> Treat these as first-priority go/no-go checks before investing in translation, storage, or rendering polish.
- Netflix changes internal APIs or DOM structure -> Keep all Netflix-specific selectors/interception logic in one adapter and fail with a clear unsupported-state message.
- Subtitle URLs may be short-lived or not directly fetchable from extension context -> Capture required request context where possible and fall back to page-world response cloning for subtitle text resources only.
- Network observation may accidentally match non-subtitle resources -> Validate candidate content type, URL hints, and parseability before treating payloads as subtitles.
- Translation output may omit IDs, alter timing, or merge segments -> Validate response structure and fall back to source text for invalid segments.
- LLM translation latency may be high for full episodes -> Run translation as a preparation step and save translated artifacts keyed by video ID, source language, target language, and subtitle content hash.
- Rendering overlay may conflict with Netflix controls or fullscreen behavior -> Mount near the video container, support fullscreen, and keep styling isolated.
- Subtitle content may be copyrighted -> Process only for the user's active playback session and avoid server-side storage unless explicitly designed later.

## Migration Plan

This is a new project with no existing runtime code. Implementation can start by adding the extension scaffold, then the Netflix adapter, subtitle pipeline, translator boundary, and renderer behind the specs.

Rollback is removing or disabling the extension files; no data migration is required for the POC.

## Open Questions

- Which translation provider should be used for the first POC?
- Should provider API keys be stored in extension settings, supplied by a local backend, or proxied through a user-controlled service?
- Can a real Netflix subtitle payload be acquired from network resource discovery and re-fetching, or is page-world response cloning required?
- Which Netflix subtitle format appears first in the target title used for the acquisition spike?
