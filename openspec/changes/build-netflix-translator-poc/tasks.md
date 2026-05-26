## 1. POC Foundation

- [x] 1.1 Create the Chrome Manifest V3 extension project structure with manifest, content script, service worker, minimal extension UI, and build/test tooling
- [x] 1.2 Configure minimum permissions and host access for Netflix watch pages and subtitle/translation requests
- [x] 1.3 Add shared TypeScript models for video identity, subtitle resources, normalized segments, translation requests, translated artifacts, and preparation status

## 2. Go/No-Go: Netflix Video Detection

- [x] 2.1 Implement Netflix watch URL matching and video ID extraction
- [x] 2.2 Add unit tests for supported watch URLs, non-watch Netflix URLs, malformed URLs, and video ID extraction
- [x] 2.3 Implement Netflix single-page navigation detection when the watch URL changes without full page reload
- [x] 2.4 Manually verify the unpacked extension can detect and display the active video ID on a real Netflix watch page

## 3. Go/No-Go: Subtitle Payload Acquisition

- [x] 3.1 Implement a page-world network observer for subtitle/caption/timed-text request discovery without parsing rendered subtitle DOM
- [x] 3.2 Record subtitle candidates with video ID, source language if available, subtitle format if available, URL, request context, acquisition method, and timestamp
- [x] 3.3 Try primary acquisition by re-fetching the discovered subtitle text resource from the extension context
- [x] 3.4 Implement fallback acquisition by cloning only subtitle text responses from page-world fetch/XHR when re-fetching is blocked
- [x] 3.5 Validate subtitle candidates by content type, URL hints, payload shape, and parser compatibility to avoid non-subtitle resources
- [x] 3.6 Manually verify on a real Netflix title that the extension can acquire one original-language subtitle payload and compute its content hash
- [x] 3.7 Document the observed subtitle format, acquisition method, required permissions, and whether subtitle acquisition is viable for the POC

## 4. Subtitle Parsing And Normalization

- [x] 4.1 Implement parser support for the first real Netflix subtitle format discovered during the acquisition check
- [x] 4.2 Normalize parsed subtitles into ordered segments with stable ID, start time, end time, and source text
- [x] 4.3 Implement cleaned translation input generation that removes unnecessary styling and metadata
- [x] 4.4 Add fixture tests for parsing success, unsupported format handling, malformed payload handling, and cleaned input generation

## 5. Prepared Subtitle Library

- [x] 5.1 Implement a local storage interface for subtitle metadata, preparation status, and translated subtitle artifacts
- [x] 5.2 Key prepared translations by video ID, source language, target language, and source subtitle hash
- [x] 5.3 Save source subtitle metadata and preparation status after successful subtitle acquisition
- [x] 5.4 Save validated translated subtitle artifacts after translation preparation succeeds
- [x] 5.5 Load ready translated subtitle artifacts for the active video and selected target language before rendering
- [x] 5.6 Detect stale translations when video ID matches but source subtitle hash differs
- [x] 5.7 Add tests for storage lookup, save/load behavior, missing translation handling, and stale translation detection

## 6. One-Time Translation Preparation

- [x] 6.1 Define the translator-agent interface for target language, segment batches, and validated translated artifact output
- [x] 6.2 Implement the first translation provider adapter with configurable credentials or endpoint settings
- [x] 6.3 Implement full-subtitle preparation that batches segments for context while preserving segment IDs, ordering, and timing
- [x] 6.4 Validate translation responses and reject output that changes required segment structure
- [x] 6.5 Record preparation success or failure in the subtitle library without disrupting Netflix playback
- [x] 6.6 Add tests for Chinese subtitle preparation, batch translation, response validation, and provider failure handling

## 6A. Translator Workflow Rewrite

- [x] 6A.1 Remove the default one-shot full-subtitle request path from subtitle preparation
- [x] 6A.2 Change provider requests to fixed batches of no more than 20 output segments
- [x] 6A.3 Update prompts to require strict JSON output for only the requested output batch
- [x] 6A.4 Optionally include adjacent source subtitles as read-only context without requesting translations for context rows
- [x] 6A.5 Validate each batch independently for exact IDs, no duplicates, no extras, non-empty text, and preserved source timing
- [x] 6A.6 Append each validated batch to the stored translated artifact before sending the next provider request
- [x] 6A.7 Track progress metadata for current batch, total batches, validated segment count, total segment count, provider model, and latest error/debug summary
- [x] 6A.8 Mark the artifact `translation-ready` only after all batches have validated
- [x] 6A.9 Preserve partial artifacts for diagnostics when preparation fails, but do not expose partial artifacts as ready for rendering
- [x] 6A.10 Add tests for incremental append behavior, strict response validation, partial failure state, progress metadata, and full completion

## 6B. AI SDK Translation Provider Layer

- [x] 6B.1 Add AI SDK dependencies and provider package support for DeepSeek and OpenAI-compatible endpoints
- [x] 6B.2 Replace hand-built chat-completion fetch logic with an AI SDK provider adapter behind the existing translator-agent interface
- [x] 6B.3 Define a schema-backed batch translation output contract and route provider output through AI SDK structured-output parsing
- [x] 6B.4 Keep domain validation for exact segment IDs, duplicate IDs, extra IDs, non-empty text, and preserved timing after AI SDK schema validation
- [x] 6B.5 Add a reusable translation style profile for target language, tone, naming consistency, subtitle brevity, and glossary rules
- [x] 6B.6 Add a bounded translation context policy for adjacent source segments and capped prior validated translation context
- [x] 6B.7 Expose streaming progress/debug events from the AI SDK provider path without marking partial streamed output as ready subtitles
- [x] 6B.8 Ensure provider calls run from the service worker or Chrome-free test harness, not directly from the Netflix content script
- [x] 6B.9 Add tests for provider adapter configuration, structured-output failures, streaming progress, style profile prompt construction, and context policy limits

## 6C. Chrome-Free Translator Integration Testing

- [x] 6C.1 Add a fake raw subtitle fixture that exercises multiline text, repeated names, timing gaps, and enough segments to require multiple batches
- [x] 6C.2 Extract the translator preparation pipeline so it can run with injected provider and storage adapters outside Chrome
- [x] 6C.3 Add an in-memory storage adapter for translator integration tests
- [x] 6C.4 Add deterministic integration tests using AI SDK mock providers or equivalent local provider doubles
- [x] 6C.5 Validate fixture parsing, cleaned input generation, batch requests, schema validation, incremental persistence, and final artifact readiness in the Chrome-free path
- [x] 6C.6 Add an opt-in live provider test path controlled by environment variables for API key, endpoint/provider, model, and target language
- [x] 6C.7 Add npm scripts or documented commands for running deterministic translator integration tests and optional live provider tests

## 6D. Subtitle Library Management UI

- [x] 6D.1 Extend subtitle library metadata to include optional video title, source format, acquisition method, source segment count, translated segment count, provider model, and validation summary
- [x] 6D.2 Add storage operations to list all local subtitle library entries sorted by updated time
- [x] 6D.3 Add storage operations to load raw source subtitle details, parsed source segments, translated segments, timestamps, progress metadata, and latest debug/error details for one entry
- [x] 6D.4 Add storage operations to delete one local library entry and all local entries for a video
- [x] 6D.5 Build a simple management page or options-page tab with filters for status, source language, target language, and video search
- [x] 6D.6 Build a detail view that compares source text and translated text by timestamp and segment ID
- [x] 6D.7 Show deterministic quality diagnostics such as translated segment count, missing segment count, empty translation count, stale status, latest error, and provider/model metadata
- [x] 6D.8 Add delete confirmation UI and refresh the management list after deletion
- [x] 6D.9 Add tests for library listing, detail loading, deletion, empty state, and diagnostic rendering

## 7. Playback Rendering From Saved Translation

- [x] 7.1 Implement an extension-owned subtitle overlay mounted to the Netflix playback area
- [x] 7.2 Load a ready translated subtitle artifact for the active video before enabling translated rendering
- [x] 7.3 Synchronize overlay text with video current time, pause/resume state, and seeking
- [x] 7.4 Avoid duplicate subtitle display by hiding or bypassing source-language subtitles when translated subtitles are active where possible
- [x] 7.5 Handle missing translated segments by clearing or skipping text without interrupting playback
- [x] 7.6 Add tests for artifact loading, timing lookup, seeking behavior, missing segments, and overlay lifecycle

## 8. Minimal User Workflow

- [x] 8.1 Build minimal controls for selected target language, prepare subtitles, and enable/disable translated subtitles
- [x] 8.2 Show status states for unsupported page, video detected, subtitle acquisition blocked, source ready, preparing translation, translation ready, translation failed, stale translation, and rendering active
- [x] 8.3 Wire the happy path: detect video ID, acquire source subtitle, parse, translate once, save artifact, reload from storage, and render during playback
- [x] 8.4 Manually verify the full POC on one Netflix title with original-language subtitles
- [x] 8.5 Document local development, extension loading, provider setup, acquisition findings, and known POC limitations
