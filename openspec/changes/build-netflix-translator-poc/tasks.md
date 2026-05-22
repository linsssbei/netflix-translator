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
- [ ] 3.6 Manually verify on a real Netflix title that the extension can acquire one original-language subtitle payload and compute its content hash
- [ ] 3.7 Document the observed subtitle format, acquisition method, required permissions, and whether subtitle acquisition is viable for the POC

## 4. Subtitle Parsing And Normalization

- [ ] 4.1 Implement parser support for the first real Netflix subtitle format discovered during the acquisition check
- [ ] 4.2 Normalize parsed subtitles into ordered segments with stable ID, start time, end time, and source text
- [ ] 4.3 Implement cleaned translation input generation that removes unnecessary styling and metadata
- [ ] 4.4 Add fixture tests for parsing success, unsupported format handling, malformed payload handling, and cleaned input generation

## 5. Prepared Subtitle Library

- [ ] 5.1 Implement a local storage interface for subtitle metadata, preparation status, and translated subtitle artifacts
- [ ] 5.2 Key prepared translations by video ID, source language, target language, and source subtitle hash
- [ ] 5.3 Save source subtitle metadata and preparation status after successful subtitle acquisition
- [ ] 5.4 Save validated translated subtitle artifacts after translation preparation succeeds
- [ ] 5.5 Load ready translated subtitle artifacts for the active video and selected target language before rendering
- [ ] 5.6 Detect stale translations when video ID matches but source subtitle hash differs
- [ ] 5.7 Add tests for storage lookup, save/load behavior, missing translation handling, and stale translation detection

## 6. One-Time Translation Preparation

- [ ] 6.1 Define the translator-agent interface for target language, segment batches, and validated translated artifact output
- [ ] 6.2 Implement the first translation provider adapter with configurable credentials or endpoint settings
- [ ] 6.3 Implement full-subtitle preparation that batches segments for context while preserving segment IDs, ordering, and timing
- [ ] 6.4 Validate translation responses and reject output that changes required segment structure
- [ ] 6.5 Record preparation success or failure in the subtitle library without disrupting Netflix playback
- [ ] 6.6 Add tests for Chinese subtitle preparation, batch translation, response validation, and provider failure handling

## 7. Playback Rendering From Saved Translation

- [ ] 7.1 Implement an extension-owned subtitle overlay mounted to the Netflix playback area
- [ ] 7.2 Load a ready translated subtitle artifact for the active video before enabling translated rendering
- [ ] 7.3 Synchronize overlay text with video current time, pause/resume state, and seeking
- [ ] 7.4 Avoid duplicate subtitle display by hiding or bypassing source-language subtitles when translated subtitles are active where possible
- [ ] 7.5 Handle missing translated segments by clearing or skipping text without interrupting playback
- [ ] 7.6 Add tests for artifact loading, timing lookup, seeking behavior, missing segments, and overlay lifecycle

## 8. Minimal User Workflow

- [ ] 8.1 Build minimal controls for selected target language, prepare subtitles, and enable/disable translated subtitles
- [ ] 8.2 Show status states for unsupported page, video detected, subtitle acquisition blocked, source ready, preparing translation, translation ready, translation failed, stale translation, and rendering active
- [ ] 8.3 Wire the happy path: detect video ID, acquire source subtitle, parse, translate once, save artifact, reload from storage, and render during playback
- [ ] 8.4 Manually verify the full POC on one Netflix title with original-language subtitles
- [ ] 8.5 Document local development, extension loading, provider setup, acquisition findings, and known POC limitations
