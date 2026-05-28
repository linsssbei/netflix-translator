## Context

The current POC already has AI SDK provider access, strict JSON batch responses, batch validation, incremental persistence, and a reusable translation style profile. The next improvement is to reduce wall-clock translation time without losing consistency across batches.

Parallelism changes the consistency model. Sequential batches can optionally use previous validated translations, but 10 concurrent batches complete out of order. Therefore, consistency must come from a shared pre-translation context profile rather than from prior batch output.

## Goals / Non-Goals

**Goals:**

- Run up to 10 translation batches concurrently.
- Keep 100 output segments per batch.
- Include read-only overlap context around each batch, defaulting to 20 segments before and 20 segments after.
- Provide editable per-title profile fields for tone, character names, glossary terms, and background notes.
- Provide an auto-fill action that uses AI SDK tool calling to populate profile suggestions from online public sources.
- Keep provider responses strict: only requested output segment IDs may be returned.
- Persist validated batch results incrementally and merge final output by original segment order.

**Non-Goals:**

- Browse online during every translation batch.
- Let auto-fill silently override user-edited profile fields during translation.
- Build a full translation memory or human review workflow.
- Export or upload raw source subtitles to third-party search services.
- Mark partial parallel translations as ready for playback.

## Decisions

### Use a saved translation context profile

Create a `TranslationContextProfile` that is editable before translation and included in every provider system prompt. It should contain title metadata, tone instructions, character names, glossary entries, background notes, and source URLs used by auto-fill.

Alternatives considered:

- Let each batch infer names independently: faster to build, but inconsistent.
- Depend on previous batch translations: incompatible with parallel completion order.

### Auto-fill profile before translation

Online lookup should be a user-triggered pre-translation action. The service worker calls an AI SDK model with tools for approved public source lookup and returns structured profile suggestions. The UI then displays editable fields.

Alternatives considered:

- Hidden automatic lookup during translation: less user control and harder to debug.
- Search every batch independently: expensive, inconsistent, and slow.

### Use bounded parallel batch execution

Split untranslated output segments into 100-segment batches and run at most 10 provider calls at once. Each batch receives overlap context as read-only source segments, but provider output must contain only the current batch IDs.

Alternatives considered:

- One full-subtitle request: better global context, but unreliable for long JSON output.
- Unlimited concurrency: risks provider rate limits, browser/service-worker pressure, and harder failure handling.
- Smaller 20-segment batches: more requests and overhead for full episodes.

### Track parallel progress explicitly

Progress should track total batches, completed batches, failed batches, in-flight batch numbers, validated segment count, total segment count, provider model, and latest errors. Current batch alone is not meaningful when batches run concurrently.

## Risks / Trade-offs

- Provider rate limits may reject 10 concurrent requests -> make concurrency configurable with a default of 10 and retry failed batches.
- Larger overlap increases token cost -> default to 20 before/after, but keep policy configurable.
- Online sources may be wrong or unavailable -> require user-editable fields and store source URLs for visibility.
- MV3 permissions may block public lookup fetches -> use optional host permissions or a narrow allowlist.
- Parallel failures can leave partial progress -> preserve validated segments but keep status failed until all requested IDs validate.

## Migration Plan

Add profile and parallel progress fields as optional metadata so old library entries continue to load. Keep existing translated artifact segment shape unchanged. Rollback can disable parallel mode and fall back to existing sequential translation while ignoring profile metadata.
