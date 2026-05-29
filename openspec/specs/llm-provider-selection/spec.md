## ADDED Requirements

### Requirement: Configure active LLM provider
The extension SHALL allow users to select the active LLM provider used for subtitle translation.

#### Scenario: User selects a first-class provider
- **WHEN** the user selects DeepSeek, Gemini, ChatGPT/OpenAI, or Claude/Anthropic in extension settings
- **THEN** the extension SHALL persist that provider selection
- **AND** subsequent subtitle preparation SHALL use the selected provider

#### Scenario: No provider has been selected
- **WHEN** provider settings do not contain a selected provider
- **THEN** the extension SHALL use the existing DeepSeek-compatible default behavior

#### Scenario: Unknown provider value is stored
- **WHEN** provider settings contain an unsupported provider identifier
- **THEN** the extension SHALL reject the configuration with an actionable settings error
- **AND** it SHALL NOT silently route the request to a different provider

### Requirement: Configure provider credentials and model
The extension SHALL persist provider credentials and model selection required for the active provider.

#### Scenario: User saves provider settings
- **WHEN** the user saves provider, API key, model, and endpoint settings
- **THEN** the extension SHALL store those values in extension local storage
- **AND** API keys SHALL NOT be written to logs, diagnostics, translated artifacts, or exported subtitle bundles

#### Scenario: Provider has default model
- **WHEN** the user selects a provider with a default model and the model field is empty
- **THEN** the extension SHALL use that provider's default model for provider calls

#### Scenario: Provider requires custom endpoint
- **WHEN** the user selects an OpenAI-compatible custom provider
- **THEN** the extension SHALL require a custom endpoint URL and model name before translation starts

### Requirement: Validate provider settings before translation
The extension SHALL validate provider settings before starting subtitle translation or provider-backed auto-fill.

#### Scenario: Missing API key
- **WHEN** translation or auto-fill starts without an API key for the active provider
- **THEN** the extension SHALL stop before making a provider request
- **AND** it SHALL surface an error instructing the user to configure the provider API key

#### Scenario: Missing required endpoint
- **WHEN** the active provider requires an endpoint and none is configured
- **THEN** the extension SHALL stop before making a provider request
- **AND** it SHALL surface an error identifying the missing endpoint

#### Scenario: Valid provider settings
- **WHEN** provider settings contain all required values for the selected provider
- **THEN** subtitle preparation SHALL start normally using the resolved provider configuration

### Requirement: Use selected provider in translation artifacts and diagnostics
The extension SHALL record the actual provider and model used for each translation run.

#### Scenario: Translation succeeds with selected provider
- **WHEN** subtitle translation completes successfully using Gemini, ChatGPT/OpenAI, Claude/Anthropic, DeepSeek, or an OpenAI-compatible provider
- **THEN** the translated artifact SHALL store the resolved provider identifier
- **AND** provider diagnostics SHALL store the resolved model name when available

#### Scenario: Translation progresses in batches
- **WHEN** a translation run reports batch progress
- **THEN** progress metadata SHALL include the resolved provider model
- **AND** user-visible diagnostics SHALL reflect the selected provider/model rather than a hardcoded DeepSeek value

#### Scenario: Existing artifact lacks provider metadata
- **WHEN** the library displays an older translated artifact without provider or model metadata
- **THEN** the extension SHALL continue to display and render the artifact without failure

### Requirement: Use selected provider for context-profile auto-fill
Provider-backed context-profile auto-fill SHALL use the same active provider configuration as subtitle translation.

#### Scenario: Auto-fill starts with configured provider
- **WHEN** the user starts context-profile auto-fill and provider settings are valid
- **THEN** auto-fill SHALL create its model through the shared provider selection path
- **AND** it SHALL use the selected provider instead of falling back to a different provider family

#### Scenario: Auto-fill provider call fails
- **WHEN** the selected provider rejects or fails an auto-fill request
- **THEN** the extension SHALL surface the provider error without changing the user's selected provider

### Requirement: Include model field in typed settings
The extension settings type SHALL include the model field alongside provider and API key.

#### Scenario: Settings type includes model
- **WHEN** any shared code reads or writes provider settings from chrome.storage.local
- **THEN** the typed settings interface SHALL include a `model` field
- **AND** `model` SHALL be optional to support legacy settings that pre-date multi-model selection

#### Scenario: Options page persists model
- **WHEN** the user saves settings from the options page
- **THEN** the saved model value SHALL be stored as a top-level key in chrome.storage.local
- **AND** the service worker SHALL read the model from storage alongside provider and API key

### Requirement: Include provider and model in translated artifacts
The translated artifact type SHALL record both the provider identifier and the model used for each translation run.

#### Scenario: Artifact includes model
- **WHEN** a translation completes and is saved
- **THEN** the `TranslatedArtifact` SHALL include a `model` field with the resolved model name
- **AND** the `provider` field SHALL reflect the resolved provider identifier rather than a hardcoded value

#### Scenario: Older artifacts lack model
- **WHEN** the library loads an older artifact without a `model` field
- **THEN** the extension SHALL tolerate the missing field and default to an empty or unknown value

### Requirement: Route Anthropic through Anthropic provider family
When the user selects Anthropic, the extension SHALL use the Anthropic provider family, not the OpenAI-compatible family.

#### Scenario: Anthropic is selected
- **WHEN** the user selects Anthropic and provides valid credentials
- **THEN** the provider factory SHALL create the model using `createAnthropic` from `@ai-sdk/anthropic`
- **AND** the request SHALL NOT be routed through the OpenAI-compatible provider path

#### Scenario: Anthropic structured output
- **WHEN** the translator agent processes subtitle batches with the Anthropic provider
- **THEN** the Anthropic provider definition SHALL declare support for the required structured-output mode
- **AND** batch validation SHALL apply the same rules used for every other provider

### Requirement: Auto-fill must use shared provider factory
Context-profile auto-fill SHALL create its model through the same shared provider factory as subtitle translation.

#### Scenario: Auto-fill uses shared factory
- **WHEN** auto-fill needs to create a language model for the configured provider
- **THEN** it SHALL call the shared `createLanguageModel` function
- **AND** it SHALL NOT duplicate model creation logic with separate `createDeepSeek`/`createOpenAI` imports

#### Scenario: Auto-fill provider defaults defined once
- **WHEN** the provider registry defines a default model for a provider
- **THEN** auto-fill SHALL use that registry default
- **AND** auto-fill SHALL NOT define its own separate set of default endpoint and model values

### Requirement: Surface provider context in errors
When a provider call fails, the error SHALL include the provider identifier and model context without exposing credentials.

#### Scenario: Translation provider call fails
- **WHEN** a translation batch call to any provider fails
- **THEN** the error message SHALL identify the provider and model that produced the error
- **AND** the error SHALL NOT include the API key, endpoint URL, or any sensitive credential values

#### Scenario: Auto-fill provider call fails
- **WHEN** an auto-fill request to any provider fails
- **THEN** the diagnostic SHALL include the provider identifier
- **AND** credentials SHALL NOT be included in the error

### Requirement: Support custom OpenAI-compatible providers
The extension SHALL support custom providers that expose an OpenAI-compatible API.

#### Scenario: User configures compatible endpoint
- **WHEN** the user selects the OpenAI-compatible provider option and provides an endpoint, API key, and model
- **THEN** the extension SHALL route subtitle translation through the OpenAI-compatible provider path

#### Scenario: Compatible provider returns invalid subtitle output
- **WHEN** a custom OpenAI-compatible provider returns malformed, incomplete, duplicate, extra, or empty subtitle translations
- **THEN** the extension SHALL reject the response using the same validation rules as first-class providers

### Requirement: Keep provider selection outside content scripts
Content scripts SHALL NOT perform LLM provider calls or contain provider-specific request logic.

#### Scenario: User enables subtitles after translation
- **WHEN** translated subtitles are rendered on Netflix
- **THEN** the content script SHALL receive prepared translated segments
- **AND** it SHALL NOT need to know which provider produced those segments

#### Scenario: User changes provider settings
- **WHEN** the user changes provider settings in the options page
- **THEN** content-script rendering behavior SHALL remain unchanged until a new translation run produces new artifacts
