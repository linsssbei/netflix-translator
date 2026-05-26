## Why

Many Netflix titles include subtitles in their original language but do not include Chinese subtitles. This POC will validate whether a Chrome extension can discover the current Netflix video, extract original subtitle timing/text, prepare a translated subtitle artifact, and render that saved translation during playback.

## What Changes

- Add a Chrome extension proof of concept for Netflix subtitle translation.
- Detect Netflix watch URLs and extract the active video identifier.
- Discover and download the available original-language subtitle resource for the current video.
- Parse Netflix subtitle formats into normalized timed subtitle segments.
- Clean subtitle data into a minimal translation input containing only timing and source text.
- Add a translator-agent workflow that translates the full subtitle file once into a user-selected target language, initially Chinese.
- Replace the hand-built LLM request layer with an AI SDK based provider layer that supports streaming, schema-backed output, centralized system prompts, and bounded translation context.
- Save prepared translated subtitle artifacts in local extension storage and locate them by video identity and subtitle metadata.
- Add a local subtitle library management UI for inspecting saved source subtitles, translated subtitles, timestamps, status, diagnostics, and deleting local entries.
- Add a Chrome-free translator integration test harness that runs the same translation pipeline against fixture subtitle payloads before extension playback testing.
- Render saved translated subtitle text over Netflix playback in sync with the source timings.
- Provide a replacement/overlay path for translated subtitles without requiring Netflix to provide the target-language subtitle track.

## Capabilities

### New Capabilities

- `netflix-video-detection`: Detect Netflix watch pages and identify the active video ID from the URL/page state.
- `subtitle-source-extraction`: Discover, download, parse, and normalize source subtitle files into timed text segments.
- `subtitle-translation-agent`: Translate normalized subtitle segments into a requested target language while preserving timing and segment structure.
- `prepared-subtitle-library`: Persist source subtitle metadata and translated subtitle artifacts for later playback lookup.
- `subtitle-library-management-ui`: Inspect, compare, and remove locally saved subtitle library entries.
- `translator-integration-testing`: Run the shared translation pipeline outside Chrome with deterministic fixtures and optional live provider checks.
- `translated-subtitle-rendering`: Render translated subtitles in sync with Netflix playback and replace or overlay the original subtitle display.

### Modified Capabilities

None.

## Impact

- New Chrome extension structure, including manifest, content script, background/service worker, extension UI, and storage permissions.
- New Netflix page integration that observes URL changes and playback state inside the Netflix web app.
- New subtitle processing pipeline for subtitle download, parsing, normalization, cleaning, translation, and rendering.
- New local subtitle library/cache for prepared translated subtitle artifacts and preparation status.
- New translator provider integration surface built on AI SDK Core for calling an LLM or translation service.
- New extension management page surface for saved subtitle inspection and cleanup.
- New test fixture and integration-test path that can validate translation behavior without Netflix or Chrome extension APIs.
- Browser permissions and network behavior must be constrained to Netflix pages and explicitly required translation/subtitle endpoints.
