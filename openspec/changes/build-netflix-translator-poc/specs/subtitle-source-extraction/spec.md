## ADDED Requirements

### Requirement: Discover original-language subtitle resource
The extension SHALL discover an available original-language subtitle resource for the current Netflix video when one is exposed to the browser.

#### Scenario: Original-language subtitle resource is available
- **WHEN** the active Netflix video exposes an original-language subtitle resource
- **THEN** the extension records the subtitle language, format, and retrievable resource reference

#### Scenario: No subtitle resource is available
- **WHEN** no supported original-language subtitle resource can be discovered
- **THEN** the extension reports that subtitles are unavailable for the current video

### Requirement: Verify subtitle acquisition feasibility
The extension SHALL provide a feasibility check that proves it can acquire a real original-language subtitle payload for a Netflix video before translation or rendering work depends on that video.

#### Scenario: Real subtitle payload is acquired
- **WHEN** the extension runs the acquisition feasibility check on a Netflix video with original-language subtitles
- **THEN** it records the video ID, source language, subtitle format, acquisition method, and payload hash

#### Scenario: Real subtitle payload cannot be acquired
- **WHEN** the extension cannot acquire a subtitle payload through resource re-fetching or subtitle response cloning
- **THEN** it marks subtitle acquisition as blocked for the current video and does not continue to translation

### Requirement: Download subtitle source
The extension SHALL retrieve the selected original-language subtitle resource for local processing.

#### Scenario: Subtitle resource download succeeds
- **WHEN** a discovered subtitle resource is retrievable
- **THEN** the extension downloads the subtitle payload without downloading video media

#### Scenario: Subtitle resource download fails
- **WHEN** the subtitle resource cannot be retrieved
- **THEN** the extension reports the failure and does not invoke translation

### Requirement: Parse supported subtitle formats
The extension SHALL parse supported Netflix subtitle payloads into ordered timed text segments.

#### Scenario: Supported subtitle payload is parsed
- **WHEN** the downloaded subtitle payload uses a supported subtitle format
- **THEN** the extension extracts segment start time, end time, and text in playback order

#### Scenario: Unsupported subtitle payload is encountered
- **WHEN** the downloaded subtitle payload uses an unsupported or invalid format
- **THEN** the extension reports an unsupported subtitle format error

### Requirement: Produce cleaned translation input
The extension SHALL convert parsed subtitles into a cleaned translation input containing only segment IDs, timing, and source text.

#### Scenario: Parsed subtitles contain styling metadata
- **WHEN** parsed subtitle segments contain styling, positioning, or format-specific metadata
- **THEN** the cleaned translation input excludes that metadata and preserves only necessary timing and text

#### Scenario: Subtitle text contains markup
- **WHEN** subtitle text includes supported inline markup that is not needed for translation
- **THEN** the cleaned translation input removes or normalizes that markup while preserving readable text
