## MODIFIED Requirements

### Requirement: Use contextual batch translation
The translator agent SHALL translate subtitles through deterministic provider batches with configurable context and concurrency rather than relying on one full-subtitle provider request.

#### Scenario: Batch contains up to one hundred output segments
- **WHEN** the extension prepares a subtitle file for translation
- **THEN** the translator agent splits the cleaned subtitle input into batches of no more than 100 output segments
- **AND** each provider request asks for translations only for the current output batch

#### Scenario: Batch includes read-only context
- **WHEN** a batch has adjacent source segments before or after its output range
- **THEN** the translator agent includes configured adjacent source segments as read-only context
- **AND** the provider response MUST NOT include translations for read-only context segments

#### Scenario: Translation context profile is available
- **WHEN** a saved translation context profile exists for the subtitle being prepared
- **THEN** the translator agent includes the profile context in every batch prompt used for that preparation run

#### Scenario: Parallel batch execution is enabled
- **WHEN** subtitle preparation runs with a concurrency limit greater than one
- **THEN** the translator agent may process multiple provider batches concurrently
- **AND** it MUST validate, persist, and merge batch results as independent output ranges
