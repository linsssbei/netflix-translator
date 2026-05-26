## Context

This is a Chrome extension POC for Netflix subtitle translation. Sections 1 through 6A have established the extension structure, browser integration, subtitle data model, subtitle acquisition/parsing, local subtitle library, and initial batch translation workflow. The next work pauses before playback rendering to improve the LLM provider layer, add Chrome-free translator testing, and add local subtitle library management.

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
- Use an AI SDK based provider layer instead of hand-built LLM request/response plumbing.
- Centralize translation style, naming, tone, and glossary instructions in a reusable system prompt profile.
- Save prepared translated subtitle artifacts locally for later playback.
- Provide a simple management UI for inspecting and deleting saved subtitle library entries.
- Allow the shared translator pipeline to be tested outside Chrome and Netflix using fixtures.
- Render saved translated subtitles in sync with Netflix playback.
- Keep the architecture extensible for additional translation providers, subtitle formats, and target languages.

**Non-Goals:**

- Bypassing DRM, accessing protected media streams, or downloading video content.
- Guaranteeing support for every Netflix subtitle format in the first POC.
- Publishing to the Chrome Web Store.
- Building a full account, billing, glossary, or translation memory system.
- Building semantic translation grading or human review workflows in the first management UI.
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

Do not depend on live translation during playback. The extension should first prepare a translation by downloading the original subtitle file, normalizing it, translating the subtitle set through small provider batches, validating each batch, and saving translated subtitle progress in local extension storage. During playback, the extension should locate a ready translated artifact and render from local data.

Store metadata separately from translated subtitle payloads so the extension can track preparation status and find saved translations. Use a lookup key based on `videoId`, `sourceLanguage`, `targetLanguage`, and `sourceSubtitleHash`, not just `videoId`, because Netflix can expose multiple subtitle tracks or change subtitle payloads for the same title.

Initial storage can be `chrome.storage.local` behind a storage interface. The translated artifact should support incremental appends during preparation so each validated batch is durable before the next provider request starts. If subtitle payload size or library size becomes a problem, the implementation can swap the payload store to IndexedDB without changing the rest of the pipeline.

Alternatives considered:

- Live translation during playback: rejected for the POC because it introduces avoidable latency, cost, retry, and partial-rendering problems.
- Key only by video ID: rejected because it cannot distinguish source language, target language, forced/SDH tracks, or changed subtitle content.
- Use a real backend database: unnecessary for the POC and creates avoidable deployment and privacy scope.

### Isolate the translator provider

Expose a translator-agent interface that accepts normalized segments and target language, then returns translated segments with matching IDs and timing. Validate provider output before rendering.

The translator-agent should be rewritten around deterministic incremental batches:

- Use a fixed batch size of 20 output segments for provider requests.
- Optionally include a small read-only context window from adjacent source segments, but only request output for the current batch.
- Require a strict JSON object with a `segments` array and no prose, markdown, or extra keys needed by the extension.
- Validate each batch independently for exact requested IDs, no extra IDs, non-empty translated text, and preserved timing from the source input.
- Append each validated batch to the stored translated artifact and update progress metadata before starting the next batch.
- Mark the artifact ready only after all batches have been validated.

Alternatives considered:

- Hard-code a single API call in the content script: faster, but mixes secrets/network concerns with page code.
- Translate line by line independently: simple, but lower quality and more likely to lose context.
- Translate the full subtitle file in one large LLM request: attractive for context, but unreliable for long JSON output, provider latency, timeout behavior, and Chrome extension service worker visibility.

### Use AI SDK Core for LLM access

Replace the hand-built `fetch` chat-completion implementation with an AI SDK Core provider layer. The adapter should use AI SDK model/provider abstractions for supported providers such as DeepSeek and OpenAI-compatible endpoints, and it should keep the rest of the extension behind the existing translator-agent boundary.

The first implementation should use AI SDK Core, not AI SDK UI or React hooks. AI SDK Core is the better fit because the translator runs in shared TypeScript and the Manifest V3 service worker, while popup/options pages only need stored status and progress. Chrome extension content scripts should not call LLM providers directly; provider calls should run from extension-owned contexts such as the service worker or from Chrome-free tests.

For strict output, define a schema for the batch response, for example a `segments` array of `{ id, translatedText }`, and parse provider output through AI SDK structured-output support. Continue to validate exact IDs, no duplicates, no extras, non-empty text, and preserved source timing after schema validation because schema validity alone does not prove the response matches the requested subtitle batch.

Streaming should be represented as translation lifecycle events, not as renderable partial subtitles. The provider layer can consume AI SDK streaming output and publish progress/debug events, but stored artifacts should still append only validated complete segments or batches.

Centralize translation style in a `TranslationStyleProfile` that feeds the system prompt. The profile should include target language, tone, naming rules, subtitle brevity rules, optional glossary entries, and any per-title notes. Use a bounded `TranslationContextPolicy` for adjacent source segments plus already validated prior translations for recurring names/terms. Do not adopt a full agent memory system for the POC; it adds provider lock-in and is unnecessary for deterministic subtitle batching.

Alternatives considered:

- Keep the current raw `fetch` implementation: works for one OpenAI-compatible provider, but repeats streaming, output parsing, schema validation, provider metadata, and testing utilities that AI SDK already provides.
- Move translation behind a hosted backend: better for protecting shared provider keys, but out of scope for this local POC. The POC can use user-supplied keys in extension settings and optionally support a local proxy endpoint for development.
- Use AI SDK UI hooks: useful for chat UIs, but the translator is not a chat surface and must run from service worker/shared code.

### Test translation outside Chrome

Create a Chrome-free translator test harness that exercises the same parser, cleaning, translation batching, provider adapter, validation, and artifact creation used by the extension. The harness should load fixture subtitle payloads from the repository, run through a storage-independent pipeline, and assert structural correctness of the output.

Split tests into two paths:

- Deterministic tests use AI SDK test helpers or a local mock provider and run in normal CI without network or provider keys.
- Optional live-provider tests are skipped unless explicit environment variables are present, then call the configured AI SDK provider with a small fixture to verify real model/schema behavior.

To make this possible, keep Chrome APIs at the edges. The translation pipeline should accept injected provider and storage implementations, while the service worker adapts Chrome storage/runtime messages to the same pipeline.

Alternatives considered:

- Test only through the unpacked extension: realistic, but too slow and brittle for translation iteration.
- Create a separate local-only translator implementation: faster initially, but violates the requirement that local tests and extension runtime use the same code.

### Add a subtitle library management UI

Extend the extension options page or add a dedicated extension page for managing local subtitle library entries. Keep it simple and utilitarian: a list view plus a detail view.

The list view should show saved videos and subtitle entries with video title when known, video ID, source language, target language, status, updated time, source hash, segment counts, provider/model, and a compact validation summary. It should support basic filtering by status/language and deletion of local entries.

The detail view should let users inspect source subtitle text and translated subtitle text side by side by timestamp. It should also show raw source payload metadata, translated artifact metadata, progress/debug information, latest error, stale status, and deterministic quality signals such as missing/empty translated segments. The first version should not attempt semantic quality scoring; it should expose the data needed to judge quality manually.

Store optional video title metadata when the Netflix adapter can discover it, but do not make title discovery a dependency for subtitle preparation. If the title is missing, the UI should fall back to the video ID.

Alternatives considered:

- Put all diagnostics in the popup: the popup is too small for subtitle inspection and comparison.
- Build a full subtitle editor: useful later, but the immediate need is visibility, cleanup, and diagnostics.

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
- Translation output may omit IDs, alter timing, or merge segments -> Validate each 20-segment response before appending it to storage.
- AI SDK structured output may validate schema but still return the wrong requested IDs -> Keep domain validation after schema validation.
- User-supplied provider keys in an extension can be inspected by the user and should not be treated as protected shared secrets -> Do not bundle developer-owned provider keys; consider a local or hosted proxy only as a later explicit design.
- Streaming structured output can expose incomplete partial objects -> Persist only complete validated segments or batches.
- LLM translation latency may be high for full episodes -> Run translation as a preparation step, persist progress after each validated batch, and save translated artifacts keyed by video ID, source language, target language, and subtitle content hash.
- The management UI may expose large copyrighted subtitle payloads locally -> Keep inspection local, avoid server upload, and provide deletion.
- Rendering overlay may conflict with Netflix controls or fullscreen behavior -> Mount near the video container, support fullscreen, and keep styling isolated.
- Subtitle content may be copyrighted -> Process only for the user's active playback session and avoid server-side storage unless explicitly designed later.

## Migration Plan

Implementation should continue from the existing extension code and completed sections 1 through 6A. The next migration step is to replace the hand-built translator provider internals with the AI SDK provider layer while preserving the public translator-agent behavior and stored artifact shape where possible. After the provider layer and Chrome-free tests are in place, add the management UI before moving on to playback rendering.

Rollback for the new work is to restore the previous provider adapter path and leave existing local subtitle library entries readable. If metadata fields are added for management UI inspection, missing fields should be treated as optional so older local entries still load.

## Open Questions

- Should the first AI SDK provider path use DeepSeek's first-party provider package, the OpenAI-compatible provider package, or both behind the same configuration surface?
- Should a local development proxy be added for live integration testing, or is direct user-supplied provider access enough for the first POC?
- Can a real Netflix subtitle payload be acquired from network resource discovery and re-fetching, or is page-world response cloning required?
- Which Netflix subtitle format appears first in the target title used for the acquisition spike?
