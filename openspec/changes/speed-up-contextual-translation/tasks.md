## 1. Translation Context Profile

- [x] 1.1 Add shared types for `TranslationContextProfile`, character-name entries, glossary entries, source URLs, and profile metadata
- [x] 1.2 Add storage operations to save and load a profile by video ID, source language, target language, and source subtitle hash
- [x] 1.3 Add options/library UI fields for manual tone, background notes, character names, and glossary editing
- [x] 1.4 Include saved profile fields in the translation system prompt for every batch
- [x] 1.5 Add tests for profile save/load, prompt construction, and edited-field precedence

## 2. Online Auto-Fill

- [x] 2.1 Add a service-worker action for user-triggered online context auto-fill
- [x] 2.2 Implement AI SDK tool calling with approved public lookup/fetch tools
- [x] 2.3 Parse auto-fill output into structured profile suggestions with source URLs
- [x] 2.4 Populate editable UI fields without overwriting unsaved user edits silently
- [x] 2.5 Add deterministic tests with mocked tool results and failed lookup cases

## 3. Parallel Batch Translation

- [x] 3.1 Extract batch planning into a testable helper that creates 100-segment output batches
- [x] 3.2 Add configurable overlap context with defaults of 20 source segments before and 20 after
- [x] 3.3 Replace sequential batch processing with a bounded async pool defaulting to 10 in-flight batches
- [x] 3.4 Validate each batch independently and reject output containing context IDs
- [x] 3.5 Merge validated results by source order before saving the final artifact
- [x] 3.6 Preserve partial validated segments when one or more parallel batches fail

## 4. Progress And Retry

- [x] 4.1 Extend progress metadata for completed, failed, and in-flight batches
- [x] 4.2 Update popup/library diagnostics to display parallel progress clearly
- [x] 4.3 Retry failed batches independently with the same profile and overlap context
- [x] 4.4 Ensure translation-ready is set only after all requested segment IDs validate

## 5. Verification

- [x] 5.1 Add unit tests for batch planning, overlap windows, edge batches, and context exclusion
- [x] 5.2 Add unit tests proving concurrency never exceeds the configured limit
- [x] 5.3 Add tests for out-of-order completion and final sorted artifact output
- [x] 5.4 Add tests for one failed batch preserving successful validated segments without readiness
- [x] 5.5 Run `npm test` and `npm run lint`
- [x] 5.6 Optionally run live provider testing with a small fixture and explicit environment variables
