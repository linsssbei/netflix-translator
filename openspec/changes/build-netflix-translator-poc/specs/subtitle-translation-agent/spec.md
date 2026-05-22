## ADDED Requirements

### Requirement: Accept target language requests
The translator agent SHALL prepare translated subtitle artifacts in the target language selected by the user.

#### Scenario: User selects Chinese
- **WHEN** the user selects Chinese as the target language and starts subtitle preparation
- **THEN** the translator agent translates the full normalized subtitle set into Chinese

#### Scenario: User changes target language
- **WHEN** the user selects a different supported target language
- **THEN** the translator agent uses the newly selected language for subsequent subtitle preparation requests

### Requirement: Preserve segment structure
The translator agent SHALL return translated subtitle segments that preserve the input segment IDs, ordering, start times, and end times.

#### Scenario: Translation completes successfully
- **WHEN** the translator agent returns translations for cleaned subtitle input
- **THEN** each translated segment matches an input segment ID and keeps the original timing values

#### Scenario: Translation response changes segment structure
- **WHEN** the translator response omits required segment IDs or changes timing values
- **THEN** the extension rejects the invalid response and does not render the invalid subtitles

### Requirement: Use contextual batch translation
The translator agent SHALL support translating multiple adjacent subtitle segments in a single request to improve context while preserving segment boundaries.

#### Scenario: Batch contains multiple segments
- **WHEN** the extension sends a batch of subtitle segments for translation
- **THEN** the translator agent returns a translation for each segment without merging or reordering segments

### Requirement: Handle translation failures
The translator agent SHALL report translation failures without breaking Netflix playback.

#### Scenario: Translation provider fails
- **WHEN** the translation provider returns an error or times out
- **THEN** the extension records the preparation failure and leaves playback usable
