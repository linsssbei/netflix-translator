import { describe, it, expect } from 'vitest';
import { planBatches, validateBatchResponseDetailed } from '../shared/translator-agent';
import {
  buildSystemPromptFromProfile,
  buildDefaultStyleProfile,
  buildBatchPrompt,
  normalizeProviderSegments,
} from '../shared/translation-provider';
import type { TranslationContextProfile, CleanedTranslationInput } from '../shared/types';
import { createEmptyProfile, buildProfileKey } from '../shared/context-profile';

function makeSegments(count: number): CleanedTranslationInput['segments'] {
  return Array.from({ length: count }, (_, i) => ({
    id: `seg_${i}`,
    startMs: i * 1000,
    endMs: i * 1000 + 900,
    sourceText: `Line ${i}`,
  }));
}

describe('planBatches', () => {
  it('creates a single batch for segments within batch size', () => {
    const segments = makeSegments(50);
    const batches = planBatches(segments, 100, 20, 20);

    expect(batches).toHaveLength(1);
    expect(batches[0].outputSegments).toHaveLength(50);
    expect(batches[0].batchNumber).toBe(1);
  });

  it('creates multiple batches for segments exceeding batch size', () => {
    const segments = makeSegments(250);
    const batches = planBatches(segments, 100, 20, 20);

    expect(batches).toHaveLength(3);
    expect(batches[0].outputSegments).toHaveLength(100);
    expect(batches[1].outputSegments).toHaveLength(100);
    expect(batches[2].outputSegments).toHaveLength(50);
  });

  it('includes read-only overlap context before each batch', () => {
    const segments = makeSegments(200);
    const batches = planBatches(segments, 100, 20, 20);

    expect(batches[0].contextBefore).toHaveLength(0);
    expect(batches[1].contextBefore).toHaveLength(20);
    expect(batches[1].contextBefore[0].id).toBe('seg_80');
  });

  it('includes read-only overlap context after each batch', () => {
    const segments = makeSegments(200);
    const batches = planBatches(segments, 100, 20, 20);

    expect(batches[0].contextAfter).toHaveLength(20);
    expect(batches[0].contextAfter[0].id).toBe('seg_100');
    expect(batches[1].contextAfter).toHaveLength(0);
  });

  it('handles edge batch at start with limited context before', () => {
    const segments = makeSegments(150);
    const batches = planBatches(segments, 100, 20, 20);

    expect(batches[0].contextBefore).toHaveLength(0);
    expect(batches[0].contextAfter).toHaveLength(20);
  });

  it('handles edge batch at end with limited context after', () => {
    const segments = makeSegments(150);
    const batches = planBatches(segments, 100, 20, 20);

    expect(batches[1].contextBefore).toHaveLength(20);
    expect(batches[1].contextAfter).toHaveLength(0);
  });

  it('tracks output IDs and context IDs separately', () => {
    const segments = makeSegments(250);
    const batches = planBatches(segments, 100, 20, 20);

    for (const batch of batches) {
      for (const seg of batch.outputSegments) {
        expect(batch.outputIds.has(seg.id)).toBe(true);
      }
      for (const seg of batch.contextBefore) {
        expect(batch.contextIds.has(seg.id)).toBe(true);
        expect(batch.outputIds.has(seg.id)).toBe(false);
      }
      for (const seg of batch.contextAfter) {
        expect(batch.contextIds.has(seg.id)).toBe(true);
        expect(batch.outputIds.has(seg.id)).toBe(false);
      }
    }
  });

  it('uses configurable overlap context counts', () => {
    const segments = makeSegments(250);
    const batches = planBatches(segments, 100, 10, 5);

    expect(batches[1].contextBefore).toHaveLength(10);
    expect(batches[0].contextAfter).toHaveLength(5);
  });

  it('creates empty context arrays for segments smaller than overlap', () => {
    const segments = makeSegments(10);
    const batches = planBatches(segments, 100, 20, 20);

    expect(batches).toHaveLength(1);
    expect(batches[0].contextBefore).toHaveLength(0);
    expect(batches[0].contextAfter).toHaveLength(0);
  });

  it('batches maintain non-overlapping output segment sets', () => {
    const segments = makeSegments(250);
    const batches = planBatches(segments, 100, 20, 20);

    const allOutputIds = new Set<string>();
    for (const batch of batches) {
      for (const seg of batch.outputSegments) {
        expect(allOutputIds.has(seg.id)).toBe(false);
        allOutputIds.add(seg.id);
      }
    }
    expect(allOutputIds.size).toBe(250);
  });

  it('context segments do not overlap with output segments', () => {
    const segments = makeSegments(300);
    const batches = planBatches(segments, 100, 20, 20);

    for (const batch of batches) {
      for (const seg of batch.contextBefore) {
        expect(batch.outputIds.has(seg.id)).toBe(false);
      }
      for (const seg of batch.contextAfter) {
        expect(batch.outputIds.has(seg.id)).toBe(false);
      }
    }
  });
});

describe('validateBatchResponseDetailed', () => {
  const mockInput = makeSegments(3);

  it('validates a correct batch response', () => {
    const result = validateBatchResponseDetailed(mockInput, [
      { id: 'seg_0', translatedText: '你好世界' },
      { id: 'seg_1', translatedText: '你好吗？' },
      { id: 'seg_2', translatedText: '这是测试。' },
    ]);

    expect(result.valid).toBe(true);
    expect(result.validSegments).toHaveLength(3);
  });

  it('rejects response containing context IDs', () => {
    const contextIds = new Set(['seg_0']);

    const result = validateBatchResponseDetailed(
      [
        { id: 'seg_0', startMs: 0, endMs: 5000, sourceText: 'Hello' },
        { id: 'seg_1', startMs: 5000, endMs: 10000, sourceText: 'World' },
        { id: 'seg_2', startMs: 10000, endMs: 15000, sourceText: 'Test' },
      ].slice(1, 3),
      [
        { id: 'seg_0', translatedText: 'context translation' },
        { id: 'seg_1', translatedText: 'batch translation' },
        { id: 'seg_2', translatedText: 'another translation' },
      ],
      contextIds
    );

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('context-only segment IDs');
  });

  it('rejects response with extra IDs that are not context IDs', () => {
    const result = validateBatchResponseDetailed(mockInput, [
      { id: 'seg_0', translatedText: 'a' },
      { id: 'seg_1', translatedText: 'b' },
      { id: 'seg_2', translatedText: 'c' },
      { id: 'seg_99', translatedText: 'extra' },
    ]);

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Unexpected segment IDs');
  });
});

describe('provider-facing segment IDs', () => {
  it('uses non-numeric stable request IDs in batch prompts', () => {
    const prompt = buildBatchPrompt(
      [{ id: 'seg_400', startMs: 400000, endMs: 400900, sourceText: 'Line 400' }],
      [],
      [],
    );

    expect(prompt).toContain('[nt_seg_400]');
    expect(prompt).not.toContain('[seg_400]');
  });

  it('maps provider request IDs back to source segment IDs', () => {
    const normalized = normalizeProviderSegments(
      [{ id: 'nt_seg_400', translatedText: 'translated' }],
      [{ id: 'seg_400', startMs: 400000, endMs: 400900, sourceText: 'Line 400' }],
      [],
      []
    );

    expect(normalized).toEqual([{ id: 'seg_400', translatedText: 'translated' }]);
  });
});

describe('TranslationContextProfile', () => {
  it('creates an empty profile with correct defaults', () => {
    const profile = createEmptyProfile('12345', 'en', 'zh-CN', 'abc123');

    expect(profile.videoId).toBe('12345');
    expect(profile.sourceLanguage).toBe('en');
    expect(profile.targetLanguage).toBe('zh-CN');
    expect(profile.sourceSubtitleHash).toBe('abc123');
    expect(profile.tone).toBe('');
    expect(profile.backgroundNotes).toBe('');
    expect(profile.characterNames).toEqual([]);
    expect(profile.glossary).toEqual([]);
    expect(profile.sourceURLs).toEqual([]);
    expect(profile.autoFilled).toBe(false);
  });

  it('builds a correct profile key', () => {
    const key = buildProfileKey('12345', 'en', 'zh-CN', 'abc123');
    expect(key).toBe('12345:en:zh-CN:abc123');
  });
});

describe('buildSystemPromptFromProfile with context profile', () => {
  it('includes profile tone instructions when provided', () => {
    const styleProfile = buildDefaultStyleProfile('zh-CN');
    const contextProfile: TranslationContextProfile = {
      videoId: '12345',
      sourceLanguage: 'en',
      targetLanguage: 'zh-CN',
      sourceSubtitleHash: 'abc',
      tone: 'Use casual, humorous tone',
      backgroundNotes: '',
      characterNames: [],
      glossary: [],
      sourceURLs: [],
      autoFilled: false,
      updatedAt: Date.now(),
    };

    const prompt = buildSystemPromptFromProfile(styleProfile, contextProfile);
    expect(prompt).toContain('Use casual, humorous tone');
    expect(prompt).toContain('Tone Instructions:');
  });

  it('includes background notes when provided', () => {
    const styleProfile = buildDefaultStyleProfile('zh-CN');
    const contextProfile: TranslationContextProfile = {
      videoId: '12345',
      sourceLanguage: 'en',
      targetLanguage: 'zh-CN',
      sourceSubtitleHash: 'abc',
      tone: '',
      backgroundNotes: 'A sci-fi series about time travel',
      characterNames: [],
      glossary: [],
      sourceURLs: [],
      autoFilled: false,
      updatedAt: Date.now(),
    };

    const prompt = buildSystemPromptFromProfile(styleProfile, contextProfile);
    expect(prompt).toContain('A sci-fi series about time travel');
    expect(prompt).toContain('Background:');
  });

  it('includes character names when provided', () => {
    const styleProfile = buildDefaultStyleProfile('ja');
    const contextProfile: TranslationContextProfile = {
      videoId: '12345',
      sourceLanguage: 'ja',
      targetLanguage: 'en',
      sourceSubtitleHash: 'abc',
      tone: '',
      backgroundNotes: '',
      characterNames: [
        { original: '主人公', translation: 'Hero' },
        { original: '先生', translation: 'Teacher' },
      ],
      glossary: [],
      sourceURLs: [],
      autoFilled: false,
      updatedAt: Date.now(),
    };

    const prompt = buildSystemPromptFromProfile(styleProfile, contextProfile);
    expect(prompt).toContain('Character Names');
    expect(prompt).toContain('"主人公" → "Hero"');
    expect(prompt).toContain('"先生" → "Teacher"');
  });

  it('includes glossary entries when provided', () => {
    const styleProfile = buildDefaultStyleProfile('zh-CN');
    const contextProfile: TranslationContextProfile = {
      videoId: '12345',
      sourceLanguage: 'en',
      targetLanguage: 'zh-CN',
      sourceSubtitleHash: 'abc',
      tone: '',
      backgroundNotes: '',
      characterNames: [],
      glossary: [
        { term: 'Netflix', translation: '网飞' },
        { term: 'AI', translation: '人工智能' },
      ],
      sourceURLs: [],
      autoFilled: false,
      updatedAt: Date.now(),
    };

    const prompt = buildSystemPromptFromProfile(styleProfile, contextProfile);
    expect(prompt).toContain('Title-Specific Glossary');
    expect(prompt).toContain('"Netflix" → "网飞"');
    expect(prompt).toContain('"AI" → "人工智能"');
  });

  it('does not add empty sections when profile has no entries', () => {
    const styleProfile = buildDefaultStyleProfile('zh-CN');
    const contextProfile: TranslationContextProfile = {
      videoId: '12345',
      sourceLanguage: 'en',
      targetLanguage: 'zh-CN',
      sourceSubtitleHash: 'abc',
      tone: '',
      backgroundNotes: '',
      characterNames: [],
      glossary: [],
      sourceURLs: [],
      autoFilled: false,
      updatedAt: Date.now(),
    };

    const prompt = buildSystemPromptFromProfile(styleProfile, contextProfile);
    expect(prompt).not.toContain('Tone Instructions:');
    expect(prompt).not.toContain('Background:');
    expect(prompt).not.toContain('Character Names');
    expect(prompt).not.toContain('Title-Specific Glossary');
  });

  it('preserves style profile glossary alongside context profile glossary', () => {
    const styleProfile: ReturnType<typeof buildDefaultStyleProfile> = {
      targetLanguageName: 'Simplified Chinese',
      tone: 'Natural tone',
      namingConsistency: 'Keep names consistent',
      brevity: 'Keep it short',
      glossary: [{ term: 'API', translation: '接口' }],
    };
    const contextProfile: TranslationContextProfile = {
      videoId: '12345',
      sourceLanguage: 'en',
      targetLanguage: 'zh-CN',
      sourceSubtitleHash: 'abc',
      tone: '',
      backgroundNotes: '',
      characterNames: [],
      glossary: [{ term: 'Netflix', translation: '网飞' }],
      sourceURLs: [],
      autoFilled: false,
      updatedAt: Date.now(),
    };

    const prompt = buildSystemPromptFromProfile(styleProfile, contextProfile);
    expect(prompt).toContain('接口');
    expect(prompt).toContain('网飞');
  });
});

describe('Parallel batch planning edge cases', () => {
  it('handles exactly batch-size segments', () => {
    const segments = makeSegments(100);
    const batches = planBatches(segments, 100, 20, 20);

    expect(batches).toHaveLength(1);
    expect(batches[0].outputSegments).toHaveLength(100);
  });

  it('handles 1 segment', () => {
    const segments = makeSegments(1);
    const batches = planBatches(segments, 100, 20, 20);

    expect(batches).toHaveLength(1);
    expect(batches[0].outputSegments).toHaveLength(1);
    expect(batches[0].contextBefore).toHaveLength(0);
    expect(batches[0].contextAfter).toHaveLength(0);
  });

  it('creates correct overlap for middle batch', () => {
    const segments = makeSegments(300);
    const batches = planBatches(segments, 100, 20, 20);

    expect(batches).toHaveLength(3);

    expect(batches[1].contextBefore).toHaveLength(20);
    expect(batches[1].contextBefore[0].id).toBe('seg_80');
    expect(batches[1].contextBefore[19].id).toBe('seg_99');

    expect(batches[1].contextAfter).toHaveLength(20);
    expect(batches[1].contextAfter[0].id).toBe('seg_200');
    expect(batches[1].contextAfter[19].id).toBe('seg_219');
  });

  it('zero overlap context still works', () => {
    const segments = makeSegments(200);
    const batches = planBatches(segments, 100, 0, 0);

    expect(batches[0].contextBefore).toHaveLength(0);
    expect(batches[0].contextAfter).toHaveLength(0);
    expect(batches[1].contextBefore).toHaveLength(0);
    expect(batches[1].contextAfter).toHaveLength(0);
  });
});
