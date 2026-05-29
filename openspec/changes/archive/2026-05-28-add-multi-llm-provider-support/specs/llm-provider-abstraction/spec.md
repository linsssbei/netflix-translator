## ADDED Requirements

### Requirement: Provide shared LLM provider registry
The shared provider layer SHALL expose a registry of supported LLM provider definitions.

#### Scenario: Caller requests supported providers
- **WHEN** extension UI or shared translation code asks for supported providers
- **THEN** the registry SHALL return provider metadata for DeepSeek, Gemini, ChatGPT/OpenAI, Claude/Anthropic, and OpenAI-compatible custom providers

#### Scenario: Provider metadata is used by UI
- **WHEN** the options UI renders provider choices
- **THEN** it SHALL use registry metadata for labels, default model hints, endpoint requirements, and provider identifiers

#### Scenario: Future provider is added
- **WHEN** a developer adds a new provider definition to the registry
- **THEN** provider-specific defaults and model creation SHALL be localized to that provider definition
- **AND** subtitle batching, validation, storage, and rendering code SHALL NOT require provider-specific branches

### Requirement: Normalize provider configuration
The shared provider layer SHALL normalize raw stored settings into a validated runtime provider configuration.

#### Scenario: Stored config omits optional values
- **WHEN** stored settings omit optional endpoint or model fields
- **THEN** normalization SHALL fill provider defaults where the selected provider defines defaults

#### Scenario: Stored config omits required values
- **WHEN** stored settings omit a required API key, endpoint, model, or provider value
- **THEN** normalization SHALL return a validation failure identifying the missing value

#### Scenario: Stored config uses legacy DeepSeek defaults
- **WHEN** stored settings contain an existing DeepSeek API key and no explicit provider
- **THEN** normalization SHALL produce a DeepSeek runtime configuration compatible with existing behavior

### Requirement: Create provider models through provider families
The shared provider layer SHALL create AI SDK language models through provider-family implementations rather than translation-specific switch statements.

#### Scenario: OpenAI-compatible provider is selected
- **WHEN** the selected provider uses the OpenAI-compatible family
- **THEN** the provider layer SHALL create the model using the OpenAI-compatible AI SDK provider path with the resolved endpoint and model

#### Scenario: Gemini provider is selected
- **WHEN** the selected provider is Gemini
- **THEN** the provider layer SHALL create the model using the Gemini-compatible AI SDK provider package and resolved model

#### Scenario: Claude provider is selected
- **WHEN** the selected provider is Claude/Anthropic
- **THEN** the provider layer SHALL create the model using the Anthropic-compatible AI SDK provider package and resolved model

### Requirement: Keep translation batching provider-agnostic
The translator agent SHALL invoke provider calls through a provider-agnostic interface.

#### Scenario: Batch translation starts
- **WHEN** the translator agent processes subtitle batches
- **THEN** it SHALL pass prompts, schema expectations, and batch context to a provider-agnostic call interface
- **AND** it SHALL NOT branch on provider ID for validation, batching, partial persistence, or artifact construction

#### Scenario: Provider returns structured output
- **WHEN** any supported provider returns a structured subtitle batch response
- **THEN** the translator agent SHALL apply the same segment ID mapping, exact-ID validation, duplicate detection, extra-ID rejection, and empty-translation rejection

#### Scenario: Provider call fails
- **WHEN** any supported provider returns an error or times out
- **THEN** the translator agent SHALL preserve existing batch failure, partial progress, debug, and retry behavior where applicable

### Requirement: Keep registry metadata importable without AI SDK
The provider registry metadata SHALL be separable from provider factory code so that UI pages can import provider definitions without bundling AI SDK packages.

#### Scenario: Options page imports provider choices
- **WHEN** the options page imports provider registry metadata to render provider options
- **THEN** the import SHALL NOT trigger bundling of `@ai-sdk/deepseek`, `@ai-sdk/openai`, `@ai-sdk/google`, `@ai-sdk/anthropic`, or the `ai` package into the options page bundle

#### Scenario: Service worker imports provider factory
- **WHEN** the service worker imports the provider factory to create language models
- **THEN** the factory SHALL resolve provider definitions from the shared metadata registry
- **AND** AI SDK provider packages SHALL be imported only by the factory module

### Requirement: Centralize all provider defaults in the registry
There SHALL be a single source of truth for provider default endpoints and default models.

#### Scenario: No duplicate defaults
- **WHEN** the codebase needs a provider default endpoint or default model
- **THEN** it SHALL obtain that value from the provider registry
- **AND** there SHALL NOT be separate `DEFAULT_PROVIDER_CONFIG` objects in translator-agent or auto-fill that duplicate registry defaults

#### Scenario: Endpoint values are canonical
- **WHEN** the registry specifies a default endpoint for a provider
- **THEN** the endpoint SHALL be a base URL without trailing API path segments (e.g., `https://api.deepseek.com/v1` not `https://api.deepseek.com/v1/chat/completions`)
- **AND** the AI SDK provider package SHALL append any API-path suffixes required by that provider

### Requirement: Expose provider capabilities
Provider definitions SHALL declare capabilities needed by callers before runtime provider calls are attempted.

#### Scenario: Structured output is required
- **WHEN** subtitle translation or auto-fill needs schema-backed structured output
- **THEN** the selected provider definition SHALL declare support for the required structured-output mode

#### Scenario: Provider lacks required capability
- **WHEN** a selected provider does not support a required capability
- **THEN** provider validation SHALL fail before a network request is made
- **AND** the error SHALL identify the unsupported capability

### Requirement: Support deterministic provider tests
The provider abstraction SHALL support deterministic tests without network access or real credentials.

#### Scenario: Unit tests create provider doubles
- **WHEN** tests exercise translation or auto-fill provider behavior
- **THEN** they SHALL be able to inject or mock provider implementations without making live network calls

#### Scenario: Live provider checks are not configured
- **WHEN** default test commands run without provider-specific live-test environment variables
- **THEN** live provider tests SHALL be skipped

#### Scenario: Live provider checks are explicitly configured
- **WHEN** a developer provides explicit live-test opt-in and provider credentials
- **THEN** optional live tests MAY verify a small fixture against the selected provider using the same provider abstraction as the extension
