## Why

The extension currently treats DeepSeek as the effective translation provider even though some UI and type surfaces already mention other providers. Users need to choose Gemini, ChatGPT/OpenAI, Claude/Anthropic, or an OpenAI-compatible endpoint without provider-specific logic leaking into subtitle batching, validation, storage, or rendering.

## What Changes

- Add a generic LLM provider configuration model that separates provider identity, API key, model, endpoint, and provider family.
- Add first-class provider options for DeepSeek, Gemini, ChatGPT/OpenAI, and Claude/Anthropic.
- Add a reusable provider registry/factory so future providers can be added through one provider definition instead of scattered switch statements.
- Support OpenAI-compatible providers through a dedicated compatibility path that accepts custom base URLs and model names.
- Route subtitle translation and context-profile auto-fill through the same provider resolution layer.
- Persist the selected provider and use it in translated artifacts, translation progress, diagnostics, and library metadata.
- Validate provider settings before translation starts and surface actionable configuration errors.
- Keep content scripts and subtitle rendering independent of provider-specific implementation details.

## Capabilities

### New Capabilities
- `llm-provider-selection`: User-facing provider selection, settings persistence, validation, and diagnostics for DeepSeek, Gemini, ChatGPT/OpenAI, Claude/Anthropic, and OpenAI-compatible providers.
- `llm-provider-abstraction`: Shared provider registry, provider family interfaces, model creation, and extension points for adding future providers.

### Modified Capabilities
- None. No baseline OpenSpec capabilities have been archived under `openspec/specs/`; this change introduces the provider capabilities as new specs.

## Impact

- Affected shared modules: `src/shared/types.ts`, `src/shared/translation-provider.ts`, `src/shared/translator-agent.ts`, `src/shared/auto-fill.ts`, translator tests, and provider configuration tests.
- Affected extension modules: `src/service-worker.ts`, `src/options/options.ts`, `options.html`, popup/library diagnostics that display provider metadata.
- Dependencies may need additional AI SDK provider packages for Gemini and Anthropic/Claude.
- Existing saved entries must remain readable; provider/model fields should continue to be optional where historical data lacks them.
- Default behavior should remain DeepSeek-compatible for users who have existing DeepSeek settings.
