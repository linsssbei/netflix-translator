## Why

Many Netflix titles include subtitles in their original language but do not include Chinese subtitles. This POC will validate whether a Chrome extension can discover the current Netflix video, extract original subtitle timing/text, prepare a translated subtitle artifact, and render that saved translation during playback.

## What Changes

- Add a Chrome extension proof of concept for Netflix subtitle translation.
- Detect Netflix watch URLs and extract the active video identifier.
- Discover and download the available original-language subtitle resource for the current video.
- Parse Netflix subtitle formats into normalized timed subtitle segments.
- Clean subtitle data into a minimal translation input containing only timing and source text.
- Add a translator-agent workflow that translates the full subtitle file once into a user-selected target language, initially Chinese.
- Save prepared translated subtitle artifacts in local extension storage and locate them by video identity and subtitle metadata.
- Render saved translated subtitle text over Netflix playback in sync with the source timings.
- Provide a replacement/overlay path for translated subtitles without requiring Netflix to provide the target-language subtitle track.

## Capabilities

### New Capabilities

- `netflix-video-detection`: Detect Netflix watch pages and identify the active video ID from the URL/page state.
- `subtitle-source-extraction`: Discover, download, parse, and normalize source subtitle files into timed text segments.
- `subtitle-translation-agent`: Translate normalized subtitle segments into a requested target language while preserving timing and segment structure.
- `prepared-subtitle-library`: Persist source subtitle metadata and translated subtitle artifacts for later playback lookup.
- `translated-subtitle-rendering`: Render translated subtitles in sync with Netflix playback and replace or overlay the original subtitle display.

### Modified Capabilities

None.

## Impact

- New Chrome extension structure, including manifest, content script, background/service worker, extension UI, and storage permissions.
- New Netflix page integration that observes URL changes and playback state inside the Netflix web app.
- New subtitle processing pipeline for subtitle download, parsing, normalization, cleaning, translation, and rendering.
- New local subtitle library/cache for prepared translated subtitle artifacts and preparation status.
- New translator provider integration surface for calling an LLM or translation service.
- Browser permissions and network behavior must be constrained to Netflix pages and explicitly required translation/subtitle endpoints.
