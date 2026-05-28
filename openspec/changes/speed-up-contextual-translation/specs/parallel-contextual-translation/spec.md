## ADDED Requirements

### Requirement: Translate batches with bounded concurrency
The translator agent SHALL translate subtitle batches concurrently up to a configured concurrency limit.

#### Scenario: Parallel translation starts
- **WHEN** subtitle preparation starts for untranslated segments
- **THEN** the translator agent splits output work into batches of no more than 100 segments
- **AND** it runs no more than 10 provider batch requests at the same time by default

#### Scenario: Provider calls complete out of order
- **WHEN** parallel provider calls validate in a different order than source segment order
- **THEN** the final translated artifact stores translated segments sorted by original timing or source order

### Requirement: Provide read-only overlap context
The translator agent SHALL include bounded adjacent source context for each batch without requesting output for context segments.

#### Scenario: Middle batch receives overlap context
- **WHEN** a batch has at least 20 source segments before and after its output range
- **THEN** the provider request includes 20 preceding source segments and 20 following source segments as read-only context
- **AND** the provider response MUST include only the requested output batch segment IDs

#### Scenario: Edge batch has limited context
- **WHEN** a batch is near the start or end of the subtitle file
- **THEN** the translator agent includes only the available adjacent source segments as read-only context

### Requirement: Validate parallel batch output independently
The translator agent SHALL validate every parallel batch response before persisting its translated segments.

#### Scenario: Batch response includes context IDs
- **WHEN** a provider response includes segment IDs that were supplied only as read-only context
- **THEN** the translator agent rejects that batch response as invalid

#### Scenario: Batch validates successfully
- **WHEN** a provider response includes exactly one non-empty translation for every requested output segment ID and no extra IDs
- **THEN** the translator agent persists the validated translated segments for that batch

### Requirement: Track parallel translation progress
The extension SHALL record progress metadata that represents concurrent batch execution.

#### Scenario: Parallel progress changes
- **WHEN** a parallel batch starts, validates, retries, or fails
- **THEN** the extension records total batches, completed batches, failed batches, in-flight batch numbers, validated segment count, total segment count, provider model, and latest error when available

### Requirement: Complete only after all parallel batches validate
The translator agent SHALL mark the translated artifact ready only after every requested output segment validates.

#### Scenario: All parallel batches validate
- **WHEN** every requested output segment has exactly one validated translation
- **THEN** the extension saves the merged translated artifact and marks it translation-ready

#### Scenario: One parallel batch fails
- **WHEN** any batch fails after the retry policy is exhausted
- **THEN** the extension preserves already validated translated segments for diagnostics or retry
- **AND** it does not mark the translated artifact ready for playback
