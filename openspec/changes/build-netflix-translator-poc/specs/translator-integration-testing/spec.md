## ADDED Requirements

### Requirement: Run translator pipeline without Chrome
The project SHALL provide an integration-test path that runs the shared translator pipeline without loading Chrome, Netflix, or the extension UI.

#### Scenario: Deterministic integration test runs
- **WHEN** the developer runs the deterministic translator integration test command
- **THEN** the test loads a fixture subtitle payload, parses it, creates cleaned translation input, runs the shared translator pipeline with an injected test provider, validates output, and produces a ready translated artifact

#### Scenario: Chrome APIs are unavailable
- **WHEN** translator integration tests run in the Node/Vitest environment without `chrome`
- **THEN** the translator pipeline uses injected provider and storage adapters instead of calling Chrome extension APIs directly

### Requirement: Use fixture subtitle payloads
The integration-test path SHALL include local fake subtitle fixtures that cover representative translation behavior.

#### Scenario: Fixture contains repeated names and multiple batches
- **WHEN** the fixture is parsed for translation testing
- **THEN** it includes repeated names or terms, multiline subtitle text, timestamp gaps, and enough segments to exercise multiple translation batches

#### Scenario: Fixture expected output is validated
- **WHEN** the test provider returns translated fixture output
- **THEN** the integration test verifies exact segment IDs, preserved timing, non-empty translated text, incremental progress, and final ready status

### Requirement: Support deterministic provider tests
The integration-test path SHALL support deterministic provider doubles for repeatable tests without network access or provider credentials.

#### Scenario: Mock provider returns valid output
- **WHEN** a deterministic provider returns schema-valid translated segments for each batch
- **THEN** the translator pipeline saves each validated batch and marks the artifact ready after all batches complete

#### Scenario: Mock provider returns invalid output
- **WHEN** a deterministic provider returns malformed JSON, missing IDs, duplicate IDs, extra IDs, or empty translated text
- **THEN** the translator pipeline rejects the invalid batch and preserves only previously validated progress

### Requirement: Support optional live provider checks
The integration-test path SHALL support opt-in live LLM provider checks without making live provider calls part of the default test suite.

#### Scenario: Live test environment is not configured
- **WHEN** live provider environment variables are absent
- **THEN** live provider integration tests are skipped

#### Scenario: Live test environment is configured
- **WHEN** the developer provides the required provider, API key, model, endpoint when needed, target language, and live-test opt-in flag
- **THEN** the live integration test sends a small fixture batch through the same AI SDK provider adapter used by the extension
- **AND** it validates the translated output before reporting success
