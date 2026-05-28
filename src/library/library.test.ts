import { describe, expect, it } from 'vitest';
import { mergeAutoFillResultIntoProfile } from './library';
import type { AutoFillResult, TranslationContextProfile } from '../shared/types';

function createProfile(overrides: Partial<TranslationContextProfile> = {}): TranslationContextProfile {
  return {
    videoId: '12345',
    sourceLanguage: 'en',
    targetLanguage: 'zh-CN',
    sourceSubtitleHash: 'hash',
    tone: '',
    backgroundNotes: '',
    characterNames: [],
    glossary: [],
    sourceURLs: [],
    autoFilled: false,
    updatedAt: 1,
    ...overrides,
  };
}

const autoFillResult: AutoFillResult = {
  tone: 'Auto tone',
  backgroundNotes: 'Auto notes',
  characterNames: [{ original: 'Auto Name', translation: '自动名' }],
  glossary: [{ term: 'Auto Term', translation: '自动术语' }],
  sourceURLs: [{ url: 'https://example.com', label: 'Example' }],
};

describe('mergeAutoFillResultIntoProfile', () => {
  it('preserves unsaved form edits when applying auto-fill suggestions', () => {
    const profile = createProfile();

    const merged = mergeAutoFillResultIntoProfile(profile, autoFillResult, {
      tone: 'Manual tone',
      backgroundNotes: 'Manual notes',
      characterNames: [{ original: 'Manual Name', translation: '手动名' }],
      glossary: [{ term: 'Manual Term', translation: '手动术语' }],
    });

    expect(merged.tone).toBe('Manual tone');
    expect(merged.backgroundNotes).toBe('Manual notes');
    expect(merged.characterNames).toEqual([{ original: 'Manual Name', translation: '手动名' }]);
    expect(merged.glossary).toEqual([{ term: 'Manual Term', translation: '手动术语' }]);
    expect(merged.sourceURLs).toEqual(autoFillResult.sourceURLs);
    expect(merged.autoFilled).toBe(true);
  });
});
