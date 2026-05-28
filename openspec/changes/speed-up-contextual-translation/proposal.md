## Why

Current subtitle translation runs batch work too slowly for full episodes and has limited consistency controls across independent batches. We need a clear future design for faster translation while improving character-name, glossary, tone, and title-background consistency.

## What Changes

- Add editable per-title translation context profiles with tone, character names, glossary terms, and background notes.
- Add an auto-fill action that uses AI SDK tool calling to gather public online context and populate editable profile fields.
- Change translation preparation to support bounded parallel batch translation.
- Use 100 output segments per batch with read-only overlap context before and after each batch.
- Validate and persist each batch independently while only marking the artifact ready after all output segments validate.
- Preserve user control: online auto-fill proposes profile content, but translation consumes the saved editable profile.

## Capabilities

### New Capabilities

- `translation-context-profile`: Editable and auto-filled context used to keep subtitle translation tone, names, and terminology consistent.
- `parallel-contextual-translation`: Bounded parallel translation batches with overlap context, strict validation, retry, and progress tracking.

### Modified Capabilities

- `subtitle-translation-agent`: Translation preparation behavior changes from sequential batches to bounded concurrent batches with shared context profile support.

## Impact

- Affected shared modules: translator agent, translation provider prompt construction, translation progress metadata, settings/storage types.
- Affected extension contexts: service worker translation orchestration and options/library UI for profile editing and auto-fill.
- Potential manifest impact: online lookup may require host permissions or optional host permissions for approved public sources.
- No stored translated artifact shape needs to change for playback; new profile/progress metadata should be optional for backward compatibility.
