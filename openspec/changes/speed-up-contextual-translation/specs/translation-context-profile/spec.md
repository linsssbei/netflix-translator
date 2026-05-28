## ADDED Requirements

### Requirement: Manage editable translation context profiles
The extension SHALL allow users to create and edit per-title translation context used by subtitle translation.

#### Scenario: User edits profile fields
- **WHEN** the user updates tone, background notes, character names, or glossary terms for a subtitle entry
- **THEN** the extension saves those fields as the active translation context profile for that video, source language, target language, and source subtitle hash

#### Scenario: Translation starts with saved profile
- **WHEN** subtitle translation starts and a translation context profile exists
- **THEN** the translator agent includes the profile's tone, character names, glossary terms, and background notes in every batch system prompt

### Requirement: Auto-fill translation context from online sources
The extension SHALL provide a user-triggered action that proposes translation context profile fields from online public sources.

#### Scenario: Auto-fill succeeds
- **WHEN** the user requests online auto-fill for a detected title
- **THEN** the extension uses AI SDK tool calling to gather public title context
- **AND** it returns structured suggestions for background notes, character names, glossary terms, and source URLs
- **AND** it displays the suggestions in editable profile fields before translation

#### Scenario: Auto-fill fails
- **WHEN** online lookup fails, times out, or returns insufficient context
- **THEN** the extension leaves existing user-entered profile fields unchanged
- **AND** it reports the failure without blocking manual profile editing or translation

### Requirement: Preserve user control over auto-filled context
The extension SHALL treat auto-filled context as editable suggestions, not hidden translation state.

#### Scenario: User edits auto-filled suggestions
- **WHEN** the user changes auto-filled character names, glossary terms, tone, or background notes
- **THEN** translation uses the edited saved values rather than the original auto-fill result
