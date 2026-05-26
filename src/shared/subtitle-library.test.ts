import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildLibraryKey,
  parseLibraryKey,
  saveSourceSubtitle,
  saveTranslatedArtifact,
  loadReadyTranslations,
  detectStaleTranslations,
  updatePreparationStatus,
  saveTranslationDebugInfo,
  getLibraryEntry,
  getEntriesForVideo,
  listAllEntries,
} from '../shared/subtitle-library';
import {
  removeEntry,
  loadEntryDetails,
  computeQualityDiagnostics,
} from '../shared/library-management';
import type {
  SubtitleResource,
  TranslatedArtifact,
} from '../shared/types';

// In-memory storage mock
let storage: Record<string, unknown> = {};

beforeEach(() => {
  storage = {};
});

// Mock chrome.storage.local
(globalThis as any).chrome = {
  storage: {
    local: {
      get: (keys: string | string[] | null) => {
        if (keys === null) {
          return Promise.resolve({ ...storage });
        }
        const keyList = Array.isArray(keys) ? keys : [keys];
        const result: Record<string, unknown> = {};
        for (const k of keyList) {
          if (storage[k] !== undefined) {
            result[k] = storage[k];
          }
        }
        return Promise.resolve(result);
      },
      set: (items: Record<string, unknown>) => {
        Object.assign(storage, items);
        return Promise.resolve();
      },
      remove: (keys: string | string[]) => {
        const keyList = Array.isArray(keys) ? keys : [keys];
        for (const k of keyList) {
          delete storage[k];
        }
        return Promise.resolve();
      },
    },
  },
};

function createResource(overrides: Partial<SubtitleResource> = {}): SubtitleResource {
  return {
    id: 'res_1',
    videoId: '12345',
    sourceLanguage: 'en',
    format: 'ttml',
    url: 'https://example.com/subtitle.ttml',
    acquisitionMethod: 'page-world-clone',
    discoveredAt: Date.now(),
    contentHash:
      'a'.repeat(64),
    ...overrides,
  };
}

function createArtifact(overrides: Partial<TranslatedArtifact> = {}): TranslatedArtifact {
  return {
    videoId: '12345',
    sourceLanguage: 'en',
    targetLanguage: 'zh-CN',
    sourceSubtitleHash: 'a'.repeat(64),
    preparedAt: Date.now(),
    provider: 'openai',
    segments: [
      { id: 'seg_0', startMs: 0, endMs: 5000, translatedText: '你好世界' },
      { id: 'seg_1', startMs: 5000, endMs: 10000, translatedText: '这是测试' },
    ],
    ...overrides,
  };
}

describe('buildLibraryKey / parseLibraryKey', () => {
  it('builds and parses key correctly', () => {
    const key = buildLibraryKey('12345', 'en', 'zh-CN', 'abc123');
    expect(key).toBe('12345:en:zh-CN:abc123');

    const parsed = parseLibraryKey(key);
    expect(parsed).toEqual({
      videoId: '12345',
      sourceLanguage: 'en',
      targetLanguage: 'zh-CN',
      sourceSubtitleHash: 'abc123',
    });
  });

  it('returns null for invalid key', () => {
    expect(parseLibraryKey('bad-key')).toBeNull();
    expect(parseLibraryKey('a:b:c:d:e')).toBeNull();
    expect(parseLibraryKey('')).toBeNull();
  });
});

describe('saveSourceSubtitle', () => {
  it('saves a library entry with source-ready status', async () => {
    const resource = createResource();
    await saveSourceSubtitle(resource, 'zh-CN');

    const key = 'nt_lib_' + buildLibraryKey('12345', 'en', 'zh-CN', resource.contentHash!);
    const result = await chrome.storage.local.get(key);

    expect(result[key]).toBeDefined();
    expect(result[key].status).toBe('source-ready');
    expect(result[key].videoId).toBe('12345');
    expect(result[key].sourceLanguage).toBe('en');
    expect(result[key].targetLanguage).toBe('zh-CN');
    expect(result[key].subtitleResource).toEqual(resource);
  });

  it('throws if resource has no content hash', async () => {
    const resource = createResource({ contentHash: undefined });
    await expect(saveSourceSubtitle(resource, 'zh-CN')).rejects.toThrow('missing content hash');
  });

  it('preserves translated artifact when re-acquiring the same source subtitle', async () => {
    const resource = createResource();

    // First acquisition
    await saveSourceSubtitle(resource, 'zh-CN');

    // Simulate translation completion
    const key = 'nt_lib_' + buildLibraryKey('12345', 'en', 'zh-CN', resource.contentHash!);
    const stored = await chrome.storage.local.get(key);
    stored[key].status = 'translation-ready';
    stored[key].translatedArtifact = {
      videoId: '12345',
      sourceLanguage: 'en',
      targetLanguage: 'zh-CN',
      sourceSubtitleHash: resource.contentHash,
      preparedAt: Date.now(),
      provider: 'deepseek',
      segments: [{ id: 'seg_0', startMs: 0, endMs: 1000, translatedText: 'hello' }],
    };
    await chrome.storage.local.set(stored);

    // Re-acquire the same subtitle (e.g., after extension reload)
    await saveSourceSubtitle(resource, 'zh-CN');

    // Verify translation data is preserved
    const result = await chrome.storage.local.get(key);
    expect(result[key].status).toBe('translation-ready');
    expect(result[key].translatedArtifact).toBeDefined();
    expect(result[key].translatedArtifact.segments).toHaveLength(1);
  });
});

describe('saveTranslatedArtifact', () => {
  it('saves artifact and updates status to translation-ready', async () => {
    const resource = createResource();
    await saveSourceSubtitle(resource, 'zh-CN');

    const artifact = createArtifact();
    await saveTranslatedArtifact('12345', 'en', 'zh-CN', resource.contentHash!, artifact);

    const key = 'nt_lib_' + buildLibraryKey('12345', 'en', 'zh-CN', resource.contentHash!);
    const result = await chrome.storage.local.get(key);

    expect(result[key].status).toBe('translation-ready');
    expect(result[key].translatedArtifact).toEqual(artifact);
  });

  it('throws if no entry exists', async () => {
    const artifact = createArtifact();
    await expect(
      saveTranslatedArtifact('99999', 'en', 'zh-CN', 'nonexistent', artifact)
    ).rejects.toThrow('No library entry found');
  });
});

describe('loadReadyTranslations', () => {
  it('loads matching ready translations', async () => {
    const resource = createResource();
    await saveSourceSubtitle(resource, 'zh-CN');

    const artifact = createArtifact();
    await saveTranslatedArtifact('12345', 'en', 'zh-CN', resource.contentHash!, artifact);

    const entries = await loadReadyTranslations('12345', 'zh-CN');
    expect(entries).toHaveLength(1);
    expect(entries[0].translatedArtifact).toEqual(artifact);
  });

  it('returns empty if no matching translations', async () => {
    const entries = await loadReadyTranslations('99999', 'zh-CN');
    expect(entries).toEqual([]);
  });

  it('ignores entries that are not translation-ready', async () => {
    const resource = createResource();
    await saveSourceSubtitle(resource, 'zh-CN');

    // Don't save artifact — stays source-ready
    const entries = await loadReadyTranslations('12345', 'zh-CN');
    expect(entries).toEqual([]);
  });

  it('filters by target language', async () => {
    const resource = createResource();
    await saveSourceSubtitle(resource, 'zh-CN');
    await saveTranslatedArtifact('12345', 'en', 'zh-CN', resource.contentHash!, createArtifact());

    const entries = await loadReadyTranslations('12345', 'ja');
    expect(entries).toEqual([]);
  });
});

describe('detectStaleTranslations', () => {
  it('detects stale translation when hash differs', async () => {
    const resource = createResource();
    await saveSourceSubtitle(resource, 'zh-CN');
    await saveTranslatedArtifact(
      '12345',
      'en',
      'zh-CN',
      resource.contentHash!,
      createArtifact()
    );

    // Now detect with a different hash (subtitle content changed)
    const stale = await detectStaleTranslations('12345', 'en', 'zh-CN', 'b'.repeat(64));

    expect(stale).toHaveLength(1);
    expect(stale[0].status).toBe('stale-translation');
  });

  it('does not flag when hash matches', async () => {
    const resource = createResource();
    await saveSourceSubtitle(resource, 'zh-CN');
    await saveTranslatedArtifact(
      '12345',
      'en',
      'zh-CN',
      resource.contentHash!,
      createArtifact()
    );

    const stale = await detectStaleTranslations(
      '12345',
      'en',
      'zh-CN',
      resource.contentHash!
    );

    expect(stale).toEqual([]);
  });

  it('does not re-mark already stale entries', async () => {
    const resource = createResource();
    await saveSourceSubtitle(resource, 'zh-CN');
    await saveTranslatedArtifact(
      '12345',
      'en',
      'zh-CN',
      resource.contentHash!,
      createArtifact()
    );

    await detectStaleTranslations('12345', 'en', 'zh-CN', 'b'.repeat(64));

    // Second call should not flag again
    const stale = await detectStaleTranslations('12345', 'en', 'zh-CN', 'c'.repeat(64));
    expect(stale).toEqual([]);
  });
});

describe('updatePreparationStatus', () => {
  it('updates status to a new value', async () => {
    const resource = createResource();
    await saveSourceSubtitle(resource, 'zh-CN');

    await updatePreparationStatus('12345', 'en', 'zh-CN', resource.contentHash!, 'preparing');

    const entry = await getLibraryEntry('12345', 'en', 'zh-CN', resource.contentHash!);
    expect(entry?.status).toBe('preparing');
  });

  it('records error message', async () => {
    const resource = createResource();
    await saveSourceSubtitle(resource, 'zh-CN');

    await updatePreparationStatus(
      '12345',
      'en',
      'zh-CN',
      resource.contentHash!,
      'translation-failed',
      'API key invalid'
    );

    const entry = await getLibraryEntry('12345', 'en', 'zh-CN', resource.contentHash!);
    expect(entry?.status).toBe('translation-failed');
    expect(entry?.errorMessage).toBe('API key invalid');
  });

  it('throws if entry does not exist', async () => {
    await expect(
      updatePreparationStatus('99999', 'en', 'zh-CN', 'nonexistent', 'preparing')
    ).rejects.toThrow('No library entry found');
  });
});

describe('saveTranslationDebugInfo', () => {
  it('stores translation debug information on an entry', async () => {
    const resource = createResource();
    await saveSourceSubtitle(resource, 'zh-CN');

    await saveTranslationDebugInfo('12345', 'en', 'zh-CN', resource.contentHash!, {
      videoId: '12345',
      model: 'deepseek-v4-pro',
      segmentCount: 757,
      strategy: 'batch',
      finishReason: 'stop',
      requestId: 'request-1',
      responseContentLength: 1200,
      responsePreview: '{"segments":[]}',
      usage: {
        promptTokens: 100,
        completionTokens: 200,
        totalTokens: 300,
      },
      validatedCount: 757,
      updatedAt: 123,
    });

    const entry = await getLibraryEntry('12345', 'en', 'zh-CN', resource.contentHash!);
    expect(entry?.translationDebug).toMatchObject({
      model: 'deepseek-v4-pro',
      strategy: 'batch',
      finishReason: 'stop',
      requestId: 'request-1',
      validatedCount: 757,
    });
  });
});

describe('getLibraryEntry', () => {
  it('returns entry when found', async () => {
    const resource = createResource();
    await saveSourceSubtitle(resource, 'zh-CN');

    const entry = await getLibraryEntry('12345', 'en', 'zh-CN', resource.contentHash!);
    expect(entry).not.toBeNull();
    expect(entry!.videoId).toBe('12345');
  });

  it('returns null when not found', async () => {
    const entry = await getLibraryEntry('99999', 'en', 'zh-CN', 'nonexistent');
    expect(entry).toBeNull();
  });
});

describe('getEntriesForVideo', () => {
  it('returns all entries for a video', async () => {
    const resource = createResource();
    await saveSourceSubtitle(resource, 'zh-CN');

    const resource2 = createResource({ sourceLanguage: 'ja', contentHash: 'b'.repeat(64) });
    await saveSourceSubtitle(resource2, 'zh-CN');

    const entries = await getEntriesForVideo('12345');
    expect(entries).toHaveLength(2);
  });

  it('returns empty array for unknown video', async () => {
    const entries = await getEntriesForVideo('99999');
    expect(entries).toEqual([]);
  });
});

describe('listAllEntries', () => {
  it('returns all entries sorted by updated time', async () => {
    const resource1 = createResource({ sourceLanguage: 'en', contentHash: 'a'.repeat(64) });
    await saveSourceSubtitle(resource1, 'zh-CN');

    const resource2 = createResource({ sourceLanguage: 'ja', contentHash: 'b'.repeat(64) });
    await saveSourceSubtitle(resource2, 'zh-CN');

    const entries = await listAllEntries();
    expect(entries).toHaveLength(2);
    expect(entries[0].updatedAt).toBeGreaterThanOrEqual(entries[1].updatedAt);
  });

  it('returns empty array when no entries exist', async () => {
    const entries = await listAllEntries();
    expect(entries).toEqual([]);
  });
});

describe('removeEntry', () => {
  it('removes a specific entry', async () => {
    const resource = createResource();
    await saveSourceSubtitle(resource, 'zh-CN');

    const removed = await removeEntry('12345', 'en', 'zh-CN', resource.contentHash!);
    expect(removed).toBe(true);

    const entry = await getLibraryEntry('12345', 'en', 'zh-CN', resource.contentHash!);
    expect(entry).toBeNull();
  });

  it('returns false for non-existent entry', async () => {
    const removed = await removeEntry('12345', 'en', 'zh-CN', 'nonexistent');
    expect(removed).toBe(false);
  });
});

describe('loadEntryDetails', () => {
  it('loads entry details with source segments', async () => {
    const resource = createResource();
    const payload = '<tt><body><div><p begin="00:00:01.000" end="00:00:02.000">Hello</p><p begin="00:00:02.000" end="00:00:03.000">World</p></div></body></tt>';
    await saveSourceSubtitle(resource, 'zh-CN', payload);

    const details = await loadEntryDetails('12345', 'en', 'zh-CN', resource.contentHash!);
    expect(details).not.toBeNull();
    expect(details!.sourceSegments.length).toBeGreaterThan(0);
    expect(details!.translatedSegments).toEqual([]);
  });

  it('returns null for non-existent entry', async () => {
    const details = await loadEntryDetails('12345', 'en', 'zh-CN', 'nonexistent');
    expect(details).toBeNull();
  });
});

describe('computeQualityDiagnostics', () => {
  it('computes diagnostics for a ready translation', async () => {
    const resource = createResource();
    await saveSourceSubtitle(resource, 'zh-CN');

    const artifact = {
      videoId: '12345',
      sourceLanguage: 'en',
      targetLanguage: 'zh-CN',
      sourceSubtitleHash: resource.contentHash!,
      preparedAt: Date.now(),
      provider: 'deepseek' as const,
      segments: [
        { id: 'seg_1', startMs: 0, endMs: 1000, translatedText: '你好' },
        { id: 'seg_2', startMs: 1000, endMs: 2000, translatedText: '世界' },
      ],
    };

    await saveTranslatedArtifact('12345', 'en', 'zh-CN', resource.contentHash!, artifact);
    const entry = await getLibraryEntry('12345', 'en', 'zh-CN', resource.contentHash!);

    const diagnostics = computeQualityDiagnostics(entry!);
    expect(diagnostics.translatedSegmentCount).toBe(2);
    expect(diagnostics.provider).toBe('deepseek');
  });

  it('computes diagnostics for a failed translation', async () => {
    const resource = createResource();
    await saveSourceSubtitle(resource, 'zh-CN');

    const entry = await getLibraryEntry('12345', 'en', 'zh-CN', resource.contentHash!);
    const diagnostics = computeQualityDiagnostics(entry!);
    expect(diagnostics.translatedSegmentCount).toBe(0);
    expect(diagnostics.isStale).toBe(false);
  });
});
