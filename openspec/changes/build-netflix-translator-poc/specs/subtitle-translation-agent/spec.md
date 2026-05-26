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
The translator agent SHALL translate subtitles through small, deterministic batches rather than relying on one full-subtitle provider request.

#### Scenario: Batch contains up to twenty output segments
- **WHEN** the extension prepares a subtitle file for translation
- **THEN** the translator agent splits the cleaned subtitle input into batches of no more than 20 output segments
- **AND** each provider request asks for translations only for the current output batch

#### Scenario: Batch includes read-only context
- **WHEN** a batch is not the first batch in the subtitle file
- **THEN** the translator agent MAY include a small number of adjacent source segments as read-only context
- **AND** the provider response MUST NOT include translations for read-only context segments

### Requirement: Use an AI SDK provider layer
The translator agent SHALL call LLM providers through an AI SDK based provider layer instead of hand-building provider-specific HTTP request and response parsing logic.

#### Scenario: AI SDK provider is configured
- **WHEN** subtitle preparation starts with a supported provider configuration
- **THEN** the translator agent creates an AI SDK language model for the selected provider, endpoint, model, and API key
- **AND** provider-specific details remain isolated from subtitle batching, validation, storage, and rendering code

#### Scenario: Provider supports OpenAI-compatible endpoints
- **WHEN** the user configures a custom OpenAI-compatible provider endpoint
- **THEN** the translator agent can route batch translation through the AI SDK OpenAI-compatible provider path

#### Scenario: Provider call runs in extension-owned context
- **WHEN** the extension invokes the translator agent during playback preparation
- **THEN** LLM provider network requests are made from the service worker or another extension-owned context, not directly from the Netflix content script

### Requirement: Centralize translation style instructions
The translator agent SHALL build provider prompts from a reusable translation style profile that controls target language, tone, naming consistency, subtitle brevity, and optional glossary terms.

#### Scenario: Style profile is available
- **WHEN** the translator agent prepares a batch request
- **THEN** it sends a system prompt derived from the active translation style profile
- **AND** the prompt includes instructions for consistent names, natural tone, concise subtitle text, and exact segment structure preservation

#### Scenario: Glossary terms are configured
- **WHEN** a translation style profile contains glossary or character-name rules
- **THEN** the translator agent includes those rules in the system prompt for every batch

### Requirement: Manage bounded translation context
The translator agent SHALL use a bounded context policy so each batch can receive useful context without sending the entire subtitle file.

#### Scenario: Adjacent context is configured
- **WHEN** a batch has nearby source segments before or after it
- **THEN** the translator agent includes only the configured number of adjacent source segments as read-only context

#### Scenario: Prior validated translations are available
- **WHEN** previous batches have validated translations that may improve naming consistency
- **THEN** the translator agent MAY include a capped summary of relevant prior names, glossary terms, or accepted translations as read-only context
- **AND** the provider response MUST still contain translations only for the requested output batch

### Requirement: Require strict provider output
The translator agent SHALL request and parse a strict machine-readable response for each batch.

#### Scenario: Provider returns a valid batch response
- **WHEN** the provider returns a batch translation response
- **THEN** the response contains only a JSON object with a `segments` array
- **AND** every item contains exactly one requested output segment ID and its translated text

#### Scenario: Provider returns extra text or invalid JSON
- **WHEN** the provider response includes prose, markdown fences, malformed JSON, missing IDs, duplicate IDs, extra IDs, or empty translations
- **THEN** the translator agent rejects that batch response and records the batch failure

#### Scenario: AI SDK schema validation succeeds
- **WHEN** AI SDK structured-output parsing returns a schema-valid batch response
- **THEN** the translator agent still validates exact requested IDs, duplicate IDs, extra IDs, non-empty translated text, and preserved source timing before saving the batch

#### Scenario: AI SDK schema validation fails
- **WHEN** AI SDK structured-output parsing rejects the provider response
- **THEN** the translator agent records the schema failure and does not append that batch to the translated artifact

### Requirement: Stream translation progress safely
The translator agent SHALL expose streaming provider progress without exposing unvalidated partial subtitles as ready translated artifacts.

#### Scenario: Provider emits stream progress
- **WHEN** the AI SDK provider produces streaming output or lifecycle events for a batch
- **THEN** the translator agent records progress or debug information that can be shown to the user
- **AND** it appends subtitle text only after complete translated segments pass validation

#### Scenario: Stream fails before validation
- **WHEN** a streaming provider response fails before the requested batch validates
- **THEN** the translator agent records the failure and preserves previously validated batches only

### Requirement: Persist incremental batch progress
The translator agent SHALL persist validated translated segments after each successful batch instead of waiting for the full subtitle file to finish.

#### Scenario: Batch translation succeeds
- **WHEN** a 20-segment batch is translated and validated
- **THEN** the extension appends the validated translated segments to the stored translated artifact for the same video, source language, target language, and source subtitle hash
- **AND** it records progress including translated segment count, total segment count, batch number, and batch count

#### Scenario: Preparation is interrupted after partial progress
- **WHEN** translation stops after one or more batches have been saved
- **THEN** the extension preserves the partial translated artifact and progress metadata for debugging or later retry

### Requirement: Complete only after all batches validate
The translator agent SHALL mark subtitle preparation ready only after every output segment has a validated translation.

#### Scenario: All batches complete
- **WHEN** every requested output segment has exactly one validated translated segment
- **THEN** the extension marks the translated artifact as ready for playback rendering

#### Scenario: A batch fails
- **WHEN** any batch fails after the configured retry policy
- **THEN** the extension records translation failure details and does not mark the partial artifact as ready

### Requirement: Handle translation failures
The translator agent SHALL report translation failures without breaking Netflix playback.

#### Scenario: Translation provider fails
- **WHEN** the translation provider returns an error or times out
- **THEN** the extension records the preparation failure and leaves playback usable
