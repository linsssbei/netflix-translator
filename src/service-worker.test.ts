import { describe, expect, it } from 'vitest';
import { resolveAutoFillProviderType, selectEntriesForPreparation } from './service-worker';
import type { SubtitleLibraryEntry } from './shared/types';

function createEntry(
  status: SubtitleLibraryEntry['status'],
  targetLanguage = 'zh-CN'
): SubtitleLibraryEntry {
  return {
    key: `12345:en:${targetLanguage}:hash`,
    videoId: '12345',
    sourceLanguage: 'en',
    targetLanguage,
    sourceSubtitleHash: 'hash',
    status,
    updatedAt: Date.now(),
    sourcePayload: '<tt><body><div><p begin="00:00:00" end="00:00:01">Hello</p></div></body></tt>',
  };
}

describe('selectEntriesForPreparation', () => {
  it('allows retrying a failed translation when source payload is still available', () => {
    const entries = [createEntry('translation-failed')];

    const selected = selectEntriesForPreparation(entries, 'zh-CN');

    expect(selected).toHaveLength(1);
    expect(selected[0].status).toBe('translation-failed');
  });

  it('allows retrying a preparing entry when source payload is still available', () => {
    const entries = [createEntry('preparing')];

    const selected = selectEntriesForPreparation(entries, 'zh-CN');

    expect(selected).toHaveLength(1);
    expect(selected[0].status).toBe('preparing');
  });

  it('prefers entries matching the selected target language', () => {
    const entries = [
      createEntry('source-ready', 'ja'),
      createEntry('translation-failed', 'zh-CN'),
    ];

    const selected = selectEntriesForPreparation(entries, 'zh-CN');

    expect(selected).toHaveLength(1);
    expect(selected[0].targetLanguage).toBe('zh-CN');
  });
});

describe('resolveAutoFillProviderType', () => {
  it('uses the configured provider when no custom endpoint is set', () => {
    expect(resolveAutoFillProviderType({ provider: 'deepseek' })).toBe('deepseek');
  });

  it('uses endpoint hints when custom endpoint is set', () => {
    expect(
      resolveAutoFillProviderType({
        provider: 'openai',
        endpoint: 'https://api.deepseek.com/v1',
      })
    ).toBe('deepseek');
  });
});
