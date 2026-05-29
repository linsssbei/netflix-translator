## Context

The current translation pipeline already has an AI SDK-based batch translation path, strict schema validation, progress/debug metadata, and options UI fields for provider, API key, model, and endpoint. However, DeepSeek is still the effective default and is hardcoded in important places such as service-worker artifact creation and translation invocation. The shared provider factory currently supports only DeepSeek and OpenAI-compatible construction, while Gemini and Claude/Anthropic are not first-class runtime options.

This feature should make provider selection a normal extension setting rather than a DeepSeek-specific path. It should support DeepSeek, Gemini, ChatGPT/OpenAI, Claude/Anthropic, and custom OpenAI-compatible providers while keeping subtitle batching, prompt construction, validation, persistence, and rendering provider-agnostic.

## Goals / Non-Goals

**Goals:**
- Provide a generic provider registry/factory with one definition per supported provider.
- Support DeepSeek, Gemini, ChatGPT/OpenAI, Claude/Anthropic, and custom OpenAI-compatible providers for subtitle translation.
- Reuse the same provider resolution path for context-profile auto-fill so translation and helper AI calls behave consistently.
- Persist selected provider settings and use them for translation artifacts, progress, diagnostics, and library metadata.
- Make future providers additive: new provider definitions should avoid editing translation batching or service-worker flow.
- Validate provider configuration before translation starts and show clear errors for missing API keys, unsupported provider IDs, missing endpoints, or missing models.
- Preserve existing DeepSeek settings and saved library entries.

**Non-Goals:**
- Do not add a hosted backend or shared server-side key management.
- Do not implement provider-specific prompt tuning beyond what is required for reliable schema-backed subtitle translation.
- Do not add per-video provider selection; provider settings remain global extension settings for this change.
- Do not migrate existing translated artifacts beyond reading optional provider/model metadata safely.
- Do not change subtitle parsing, batching size, rendering, or appearance behavior except where provider metadata flows through existing diagnostics.

## Decisions

### Provider Registry

Create a shared registry of provider definitions keyed by stable provider IDs such as `deepseek`, `openai`, `gemini`, `anthropic`, and `openai-compatible`. Each definition owns its display label, provider family, default endpoint behavior, default model, endpoint requirements, and AI SDK model creation function.

**Registry split for bundling:** The options page (`options.ts`) must import provider metadata (labels, defaults, required fields) without pulling AI SDK packages into the options bundle. The registry SHALL be separated into two modules:
- `provider-registry.ts` — metadata-only: provider IDs, labels, provider families, default models, default endpoints, endpoint policies (required/optional/hidden), capability declarations. Zero AI SDK imports. Imported by options page, service worker, translator-agent, and auto-fill.
- `provider-factory.ts` — model creation: imports `createDeepSeek`, `createOpenAI`, `createAnthropic`, etc. and resolves a registry definition into a `LanguageModel`. Imported only by service worker, translator-agent, and auto-fill. NOT imported by the options page.

Without this split, importing the registry in `options.ts` would bundle the entire AI SDK (~550KB) into `options.js` (currently 1.4KB).

This keeps provider knowledge in one module and lets service-worker, options UI, auto-fill, and translator-agent code consume the same provider metadata. The alternative is to extend existing switch statements in every caller, but that would make each future provider touch multiple unrelated files and increase the chance of inconsistent defaults.

### Provider Families

Model creation should distinguish between provider IDs and provider families. The first supported families should be:
- OpenAI-compatible chat completions for DeepSeek, OpenAI, and custom OpenAI-compatible endpoints when appropriate.
- Gemini through the AI SDK Google provider package.
- Claude through the AI SDK Anthropic provider package.

DeepSeek can remain a named provider even if implemented through either the first-party DeepSeek AI SDK package or an OpenAI-compatible family. The registry should hide that choice from callers.

### Configuration Model

Use one normalized provider config shape across extension settings and shared translation code:
- `provider`: stable provider ID.
- `apiKey`: user-supplied key.
- `model`: selected model or provider default.
- `endpoint`: optional base URL for providers that allow or require a custom endpoint.

The following type updates are required:
- `ExtensionSettings` must add an optional `model?: string` field alongside the existing provider, apiKey, and customEndpoint fields.
- `TranslatedArtifact` must add an optional `model?: string` field to record which model produced the translation.
- The settings storage key `customEndpoint` maps to `endpoint` in runtime config; normalization handles this mapping.

The normalizer should apply provider defaults and return a complete runtime config for model creation. It should not silently coerce unsupported provider IDs to OpenAI; unsupported IDs should fail validation before a provider call starts.

Endpoint values stored in the registry SHALL be base URLs (e.g., `https://api.deepseek.com/v1`), not URLs with API-path suffixes (e.g., `https://api.deepseek.com/v1/chat/completions`). The AI SDK provider packages handle appending any required path segments. This resolves the inconsistency where `translation-provider.ts` defaults to `https://api.deepseek.com/v1` but `translator-agent.ts` and `options.ts` default to `https://api.deepseek.com/v1/chat/completions`.

### Options UI

The options page should derive provider choices, default models, endpoint visibility, and placeholder text from the registry. This avoids hardcoding provider defaults in the DOM script. Custom OpenAI-compatible providers should require an endpoint and model, while first-class hosted providers can hide or de-emphasize endpoint editing unless the registry marks endpoint override as supported.

### Translation And Auto-Fill Integration

`translator-agent` should receive the selected provider config and should write the resolved provider ID and model into translated artifacts and progress/debug metadata. The service worker should no longer pass a hardcoded provider value or save final artifacts as DeepSeek when another provider was selected. The `translator-agent`'s local `DEFAULT_PROVIDER_CONFIG` object (lines 29-32) should be removed and its values obtained from the provider registry instead.

`auto-fill` should use the same provider factory and validation path. If a provider does not support the required structured-output mode, validation should fail with a clear message rather than falling back to a different provider. The `auto-fill` module currently has its own independent model creation with hardcoded defaults — it should call the shared `createLanguageModel` from the provider factory module and remove its local `defaults` object.

### Error Handling

Provider config validation should happen before parsing/translation work begins when possible. Provider call failures should preserve existing retry/partial-progress behavior and annotate errors with provider/model context where safe. API keys must never be logged or stored in debug summaries.

### Testing Strategy

Unit tests should cover provider registry metadata, normalization, validation, model creation routing, service-worker provider propagation, options UI persistence/defaulting, artifact metadata, and auto-fill provider reuse. Existing deterministic provider tests should remain network-free. Optional live tests may support provider-specific environment variables, but the default test suite must not require provider credentials.

## Risks / Trade-offs

- **Provider packages increase service-worker bundle** -> Add only the provider packages needed for Gemini and Claude (~100-250KB each). The service worker bundle currently sits at 337KB; growing to ~700KB is acceptable for Chrome extensions. Keep provider creation lazy via the separated registry/factory pattern.
- **Options page must stay AI-SDK-free** -> See registry split above. The options page must import only `provider-registry.ts` (metadata), never `provider-factory.ts` (model creation). Verify with bundle size checks that `options.js` stays under ~5KB.
- **Different providers vary in structured-output support** -> Keep schema validation and batch response validation provider-independent, and document provider-specific failures as configuration/runtime errors. Verify Anthropic and Gemini structured-output support before declaring their provider family capabilities in the registry.
- **Endpoint terminology differs by provider** -> Store an optional endpoint generically, but registry metadata determines whether it is required, optional, hidden, or interpreted as a base URL. Gemini uses provider-specific model creation (`googleAI('model-id')`) without a baseURL concept — the registry must reflect this.
- **Existing settings may contain older provider values** -> Normalize known legacy values and fall back to DeepSeek only when provider is missing, not when it is unknown.
- **Custom OpenAI-compatible providers may behave differently from OpenAI** -> Treat them as best-effort OpenAI-compatible endpoints, require explicit endpoint/model, and keep all output validation strict.

## Migration Plan

1. Add provider types, registry metadata, config normalization, and validation while preserving existing DeepSeek defaults.
2. Update translation provider creation and auto-fill to use the registry.
3. Update the service worker to propagate selected provider/model into `prepareTranslation`, progress, debug, and final artifact metadata.
4. Update options UI to render provider settings from registry metadata and persist the normalized config.
5. Add tests for all provider paths without live network calls.
6. Optionally add skipped live-provider checks keyed by explicit environment variables for DeepSeek, Gemini, OpenAI, Anthropic, and OpenAI-compatible endpoints.

Rollback is to restore the previous DeepSeek default provider path. Existing saved artifacts remain readable because provider/model metadata is optional in older entries and existing DeepSeek entries use the same provider ID.

## Open Questions

- Which exact default models should be used for first-class providers at implementation time? Proposed defaults should be current at implementation time and centralized in the registry.
- Should DeepSeek use the first-party `@ai-sdk/deepseek` provider package or the OpenAI-compatible provider family internally? The registry can support either choice without changing callers.
- Should endpoint override be exposed for OpenAI/Anthropic/Gemini first-class providers, or only for the OpenAI-compatible custom provider? The recommended first version exposes endpoint only when required or explicitly marked advanced by registry metadata.
