## 1. Dependencies And Provider Metadata

- [x] 1.1 Add AI SDK provider dependencies needed for Gemini (`@ai-sdk/google`) and Claude/Anthropic (`@ai-sdk/anthropic`)
- [x] 1.2 Define stable provider IDs for `deepseek`, `openai`, `gemini`, `anthropic`, and `openai-compatible`
- [x] 1.3 Create shared provider registry metadata module (`provider-registry.ts`) with labels, provider family, default model, endpoint policy, placeholder text, and required capabilities — zero AI SDK imports
- [x] 1.4 Create provider factory module (`provider-factory.ts`) that imports AI SDK packages and resolves registry definitions into `LanguageModel` instances
- [x] 1.5 Canonicalize all endpoint values to base URLs (e.g., `https://api.deepseek.com/v1`) without API-path suffixes
- [x] 1.6 Add tests confirming registry contains all required first-class providers and custom OpenAI-compatible metadata

## 2. Provider Configuration Model

- [x] 2.1 Replace scattered provider config typing with a shared raw settings type and normalized runtime config type
- [x] 2.2 Add `model?: string` to `ExtensionSettings` type and `TranslatedArtifact` type
- [x] 2.3 Implement provider settings normalization that preserves existing DeepSeek defaults when no provider is stored
- [x] 2.4 Implement validation for unsupported provider IDs, missing API keys, missing required endpoints, missing required models, and unsupported capabilities
- [x] 2.5 Add tests for valid provider configs, legacy DeepSeek settings, missing fields, unknown providers, and custom OpenAI-compatible endpoints

## 3. Provider Factory And Abstraction

- [x] 3.1 Refactor `createLanguageModel` to use provider registry definitions instead of translation-specific switch statements
- [x] 3.2 Add provider-family model creation for OpenAI-compatible providers, Gemini, and Claude/Anthropic
- [x] 3.3 Keep DeepSeek behind its named provider definition while preserving existing default model and endpoint behavior
- [x] 3.4 Ensure provider factory errors never include API keys or sensitive credential values
- [x] 3.5 Add unit tests for model creation routing across DeepSeek, OpenAI, Gemini, Anthropic, and OpenAI-compatible providers

## 4. Translator Agent Integration

- [x] 4.1 Update translator-agent provider resolution to consume normalized runtime provider configs from the registry
- [x] 4.2 Remove hardcoded DeepSeek provider values from translation invocation and artifact construction
- [x] 4.3 Remove local `DEFAULT_PROVIDER_CONFIG` from translator-agent (lines 29-32); obtain defaults from provider registry
- [x] 4.4 Ensure batch progress and debug metadata include the resolved provider/model used for the run
- [x] 4.5 Preserve provider-agnostic batching, strict schema parsing, exact segment validation, partial progress, and retry behavior
- [x] 4.6 Add translator-agent tests proving selected provider/model flow into artifacts, progress, and debug info
- [x] 5.5 Add service-worker tests for provider propagation, invalid settings, and legacy DeepSeek defaults

## 6. Auto-Fill Integration

- [x] 6.1 Refactor context-profile auto-fill to use the shared `createLanguageModel` from `provider-factory.ts` instead of its own `createDeepSeek`/`createOpenAI` imports
- [x] 6.2 Remove local `defaults` object from auto-fill (lines 35-38); obtain defaults from provider registry
- [x] 6.3 Remove provider fallback behavior that routes unsupported or non-DeepSeek providers through OpenAI implicitly
- [x] 6.4 Add tests for auto-fill using DeepSeek, OpenAI, Gemini, Anthropic, and OpenAI-compatible provider configs through mocks
- [x] 6.5 Add tests confirming auto-fill failures do not mutate selected provider settings

## 7. Options UI

- [x] 7.1 Update `options.html` and options script to render provider choices from shared `provider-registry.ts` metadata
- [x] 7.2 Update provider-change behavior to populate default models and endpoint visibility/placeholders from registry metadata
- [x] 7.3 Require endpoint input for OpenAI-compatible custom providers and avoid requiring it for first-class providers unless registry metadata requires it
- [x] 7.4 Persist provider settings using the shared raw settings shape (including `model`)
- [x] 7.5 Verify `options.js` bundle size remains small (<5KB); confirm no AI SDK packages are bundled into the options page
- [x] 7.6 Add options UI tests for provider switching, default model population, endpoint requirements, persistence, and reload behavior

## 8. Diagnostics And Library Metadata

- [x] 8.1 Ensure popup translation progress displays the selected provider/model when available
- [x] 8.2 Ensure library metadata/export paths continue to show provider/model when available and tolerate missing metadata
- [x] 8.3 Verify API keys and endpoint secrets are never included in debug summaries, library entries, or exported bundles
- [x] 8.4 Add tests for provider/model diagnostics and secret redaction

## 9. Optional Live Provider Checks

- [x] 9.1 Extend skipped live integration tests to accept explicit provider-specific environment variables for DeepSeek, OpenAI, Gemini, Anthropic, and OpenAI-compatible providers
- [x] 9.2 Ensure default test commands skip live checks when opt-in variables are absent
- [x] 9.3 Document local live-test environment variable names in the test file or adjacent developer documentation

## 10. Verification

- [x] 10.1 Run `npm test -- --run`
- [x] 10.2 Run `npm run lint`
- [x] 10.3 Run `npm run test:extension-syntax`
- [x] 10.4 Manually verify options UI provider switching and one mocked or live translation run for each configured provider path
