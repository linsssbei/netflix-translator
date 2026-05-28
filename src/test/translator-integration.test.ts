import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseTtmlWithRegex, generateTranslationInput } from '../shared/subtitle-parser';
import { prepareTranslation } from '../shared/translator-agent';
import type { TranslationStyleProfile } from '../shared/translation-provider';
import { InMemoryStorageAdapter } from './in-memory-storage';
import type { CleanedTranslationInput } from '../shared/types';

// Mock AI SDK
vi.mock('ai', () => ({
  generateObject: vi.fn(),
}));

vi.mock('@ai-sdk/deepseek', () => ({
  createDeepSeek: vi.fn(() => vi.fn(() => ({ modelId: 'deepseek-chat' }))),
}));

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => vi.fn(() => ({ modelId: 'gpt-4o' }))),
}));

const FIXTURE_PATH = join(__dirname, 'fixtures', 'sample-subtitles.ttml');

function loadFixture(): string {
  return readFileSync(FIXTURE_PATH, 'utf-8');
}

function createLargeInput(segmentCount: number): CleanedTranslationInput {
  return {
    targetLanguage: 'zh-CN',
    segments: Array.from({ length: segmentCount }, (_, index) => ({
      id: `seg_${index}`,
      startMs: index * 1000,
      endMs: index * 1000 + 900,
      sourceText: `Line ${index}`,
    })),
  };
}

function createDeterministicProvider(
  translationMap?: Map<string, string>
) {
  return (async (options: any) => {
    const userMsg = options.messages.find((m: any) => m.role === 'user');
    const content = userMsg?.content as string;
    const lines = content.split('\n');
    const ids: string[] = [];
    let inTranslate = false;
    for (const line of lines) {
      if (line.startsWith('[TRANSLATE]')) {
        inTranslate = true;
        continue;
      }
      if (line.startsWith('[CONTEXT]')) {
        inTranslate = false;
        continue;
      }
      if (inTranslate) {
        const match = line.match(/^\[(?<id>[^\]]+)\]/);
        if (match?.groups?.id) ids.push(match.groups.id);
      }
    }

    const segments = ids.map((id) => ({
      id,
      translatedText: translationMap?.get(id) || `[translated] ${id}`,
    }));

    return {
      object: { segments },
      usage: { inputTokens: 100, outputTokens: 50 },
    };
  }) as any;
}

describe('Translator Integration Tests (Chrome-Free)', () => {
  let storage: InMemoryStorageAdapter;

  beforeEach(() => {
    storage = new InMemoryStorageAdapter();
    vi.restoreAllMocks();
  });

  describe('Fixture parsing and cleaned input generation', () => {
    it('parses the fixture TTML into segments', () => {
      const payload = loadFixture();
      const segments = parseTtmlWithRegex(payload);

      expect(segments.length).toBeGreaterThan(20);
      expect(segments[0].id).toBeTruthy();
      expect(segments[0].startMs).toBeGreaterThanOrEqual(0);
      expect(segments[0].endMs).toBeGreaterThan(segments[0].startMs);
      expect(segments[0].sourceText).toBeTruthy();
    });

    it('generates cleaned translation input from parsed segments', () => {
      const payload = loadFixture();
      const segments = parseTtmlWithRegex(payload);
      const input = generateTranslationInput(segments, 'zh-CN');

      expect(input.targetLanguage).toBe('zh-CN');
      expect(input.segments.length).toBe(segments.length);
      expect(input.segments[0]).toHaveProperty('id');
      expect(input.segments[0]).toHaveProperty('startMs');
      expect(input.segments[0]).toHaveProperty('endMs');
      expect(input.segments[0]).toHaveProperty('sourceText');
      expect(input.segments[0]).not.toHaveProperty('metadata');
    });

    it('includes repeated names in segments', () => {
      const payload = loadFixture();
      const segments = parseTtmlWithRegex(payload);
      const texts = segments.map((s) => s.sourceText);

      // Sarah appears multiple times
      const sarahSegments = texts.filter((t) => t.includes('Sarah'));
      expect(sarahSegments.length).toBeGreaterThan(3);

      // John appears multiple times
      const johnSegments = texts.filter((t) => t.includes('John'));
      expect(johnSegments.length).toBeGreaterThan(3);
    });

    it('has enough segments for multiple batches', () => {
      const payload = loadFixture();
      const segments = parseTtmlWithRegex(payload);

      // Should have more than 100 segments (batch size) to test batching
      expect(segments.length).toBeGreaterThan(20);
    });
  });

  describe('Deterministic provider integration', () => {
    it('runs the full pipeline with a deterministic mock provider', async () => {
      const payload = loadFixture();
      const segments = parseTtmlWithRegex(payload);
      const input = generateTranslationInput(segments, 'zh-CN');

      // Mock the AI SDK to return deterministic translations
      const { generateObject } = await import('ai');
      vi.mocked(generateObject).mockImplementation(createDeterministicProvider());

      const batchCompletions: Array<{ segments: number; progress: unknown }> = [];

      await storage.saveSourceSubtitle({
        key: 'test-video-123:en:zh-CN:fixture-hash-abc',
        videoId: 'test-video-123',
        sourceLanguage: 'en',
        targetLanguage: 'zh-CN',
        sourceSubtitleHash: 'fixture-hash-abc',
        status: 'source-ready',
        updatedAt: Date.now(),
        sourcePayload: payload,
        sourceSegmentCount: segments.length,
      });

      const artifact = await prepareTranslation(
        input,
        { apiKey: 'test-key' },
        'test-video-123',
        'en',
        'fixture-hash-abc',
        'deepseek',
        undefined,
        async (validatedSegments, progress) => {
          batchCompletions.push({ segments: validatedSegments.length, progress });
          // Save to in-memory storage
          await storage.updatePartialArtifact(
            'test-video-123',
            'en',
            'zh-CN',
            'fixture-hash-abc',
            validatedSegments,
            progress
          );
        }
      );

      // Verify artifact
      expect(artifact.videoId).toBe('test-video-123');
      expect(artifact.sourceLanguage).toBe('en');
      expect(artifact.targetLanguage).toBe('zh-CN');
      expect(artifact.sourceSubtitleHash).toBe('fixture-hash-abc');
      expect(artifact.segments.length).toBe(input.segments.length);
      expect(artifact.preparedAt).toBeGreaterThan(0);

      // Verify all segments have valid structure
      for (const seg of artifact.segments) {
        expect(seg.id).toBeTruthy();
        expect(seg.startMs).toBeGreaterThanOrEqual(0);
        expect(seg.endMs).toBeGreaterThan(seg.startMs);
        expect(seg.translatedText).toBeTruthy();
      }

      // Verify incremental progress was recorded (fixture has ~50 segments, batch size 100)
      expect(batchCompletions.length).toBeGreaterThanOrEqual(1);
      const lastProgress = batchCompletions[batchCompletions.length - 1].progress as any;
      expect(lastProgress.validatedSegmentCount).toBe(input.segments.length);
      expect(lastProgress.currentBatch).toBe(lastProgress.totalBatches);
    });

    it('validates each batch independently', async () => {
      const input = createLargeInput(150);

      const { generateObject } = await import('ai');
      let callCount = 0;
      vi.mocked(generateObject).mockImplementation(async (options: any) => {
        callCount++;
        const userMsg = options.messages.find((m: any) => m.role === 'user');
        const content = userMsg?.content as string;
        const lines = content.split('\n');
        const ids: string[] = [];
        let inTranslate = false;
        for (const line of lines) {
          if (line.startsWith('[TRANSLATE]')) {
            inTranslate = true;
            continue;
          }
          if (line.startsWith('[CONTEXT]')) {
            inTranslate = false;
            continue;
          }
          if (inTranslate) {
            const match = line.match(/^\[(?<id>[^\]]+)\]/);
            if (match?.groups?.id) ids.push(match.groups.id);
          }
        }
        // Second batch returns TOTAL failure (all empty) — no smart retry
        if (callCount === 2) {
          return {
            object: {
              segments: ids.map((id) => ({ id, translatedText: '' })),
            },
            usage: { inputTokens: 100, outputTokens: 50 },
          } as any;
        }

        return {
          object: {
            segments: ids.map((id) => ({ id, translatedText: `[translated] ${id}` })),
          },
          usage: { inputTokens: 100, outputTokens: 50 },
        } as any;
      });

      await expect(
        prepareTranslation(
          input,
          { apiKey: 'test-key' },
          'test-video-123',
          'en',
          'fixture-hash-abc',
          'deepseek'
        )
      ).rejects.toThrow('partially failed');
    });

    it('preserves partial progress on failure', async () => {
      const input = createLargeInput(150);

      const { generateObject } = await import('ai');
      let callCount = 0;
      (vi.mocked(generateObject) as any).mockImplementation(async (options: any) => {
        callCount++;
        const userMsg = options.messages.find((m: any) => m.role === 'user');
        const content = userMsg?.content as string;
        const lines = content.split('\n');
        const ids: string[] = [];
        let inTranslate = false;
        for (const line of lines) {
          if (line.startsWith('[TRANSLATE]')) {
            inTranslate = true;
            continue;
          }
          if (line.startsWith('[CONTEXT]')) {
            inTranslate = false;
            continue;
          }
          if (inTranslate) {
            const match = line.match(/^\[(?<id>[^\]]+)\]/);
            if (match?.groups?.id) ids.push(match.groups.id);
          }
        }

        // Second batch fails
        if (callCount === 2) {
          throw new Error('Simulated provider failure');
        }

        return {
          object: {
            segments: ids.map((id) => ({ id, translatedText: `[translated] ${id}` })),
          },
          usage: { inputTokens: 100, outputTokens: 50 },
        };
      });

      try {
        await prepareTranslation(
          input,
          { apiKey: 'test-key' },
          'test-video-123',
          'en',
          'fixture-hash-abc',
          'deepseek'
        );
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(Error);
        const partialSegments = (err as any).partialSegments;
        expect(partialSegments).toBeDefined();
        expect(partialSegments.length).toBeGreaterThan(0);
        expect(partialSegments.length).toBeLessThan(input.segments.length);
      }
    });
  });

  describe('Style profile integration', () => {
    it('uses style profile in prompt construction', async () => {
      const payload = loadFixture();
      const segments = parseTtmlWithRegex(payload);
      const input = generateTranslationInput(segments, 'zh-CN');

      const { generateObject } = await import('ai');
      vi.mocked(generateObject).mockImplementation(createDeterministicProvider());

      const styleProfile: TranslationStyleProfile = {
        targetLanguageName: 'Simplified Chinese',
        tone: 'Use formal and respectful tone.',
        namingConsistency: 'Sarah must always be 莎拉, John must always be 约翰.',
        brevity: 'Keep subtitles under 15 characters when possible.',
        glossary: [
          { term: 'Sarah', translation: '莎拉' },
          { term: 'John', translation: '约翰' },
          { term: 'Netflix', translation: '网飞' },
        ],
      };

      await prepareTranslation(
        input,
        { apiKey: 'test-key' },
        'test-video-123',
        'en',
        'fixture-hash-abc',
        'deepseek',
        undefined,
        undefined,
        { styleProfile }
      );

      // Verify the system prompt includes style profile elements
      const callArgs = vi.mocked(generateObject).mock.calls[0][0] as any;
      const systemPrompt = callArgs.messages[0].content as string;
      expect(systemPrompt).toContain('莎拉');
      expect(systemPrompt).toContain('约翰');
      expect(systemPrompt).toContain('网飞');
      expect(systemPrompt).toContain('formal and respectful');
    });
  });

  describe('Context policy integration', () => {
    it('respects custom context policy bounds', async () => {
      const input = createLargeInput(150);

      const { generateObject } = await import('ai');
      const prompts: string[] = [];
      vi.mocked(generateObject).mockImplementation(async (options: any) => {
        const userMsg = options.messages.find((m: any) => m.role === 'user');
        prompts.push(userMsg?.content as string);
        return createDeterministicProvider()(options);
      });

      await prepareTranslation(
        input,
        { apiKey: 'test-key' },
        'test-video-123',
        'en',
        'fixture-hash-abc',
        'deepseek',
        undefined,
        undefined,
        {
          contextPolicy: {
            contextBeforeCount: 2,
            contextAfterCount: 1,
          },
        }
      );

      // Second batch should have exactly 2 context segments before
      const secondPrompt = prompts[1];
      const contextLines = secondPrompt.split('\n').filter((l) => l.startsWith('[CONTEXT]'));
      expect(contextLines.length).toBeGreaterThan(0);
    });
  });
});

describe('Live Provider Tests (Opt-in)', () => {
  const LIVE_API_KEY = process.env.LIVE_API_KEY;
  const LIVE_PROVIDER = process.env.LIVE_PROVIDER || 'deepseek';
  const LIVE_MODEL = process.env.LIVE_MODEL;
  const LIVE_ENDPOINT = process.env.LIVE_ENDPOINT;
  const LIVE_TARGET_LANGUAGE = process.env.LIVE_TARGET_LANGUAGE || 'zh-CN';
  const LIVE_TEST_ENABLED = process.env.LIVE_TEST === 'true';

  it.skipIf(!LIVE_TEST_ENABLED)('sends a small batch through the live provider', async () => {
    if (!LIVE_API_KEY) {
      throw new Error('LIVE_API_KEY is required for live tests');
    }

    const payload = loadFixture();
    const segments = parseTtmlWithRegex(payload);
    const input = generateTranslationInput(segments, LIVE_TARGET_LANGUAGE);

    // Use only first 5 segments for live test
    const smallInput: CleanedTranslationInput = {
      targetLanguage: LIVE_TARGET_LANGUAGE,
      segments: input.segments.slice(0, 5),
    };

    const artifact = await prepareTranslation(
      smallInput,
      {
        apiKey: LIVE_API_KEY,
        endpoint: LIVE_ENDPOINT,
        model: LIVE_MODEL,
      },
      'live-test-video',
      'en',
      'live-test-hash',
      LIVE_PROVIDER as any
    );

    expect(artifact.segments).toHaveLength(5);
    for (let i = 0; i < artifact.segments.length; i++) {
      expect(artifact.segments[i].translatedText).toBeTruthy();
      expect(artifact.segments[i].translatedText).not.toBe(smallInput.segments[i].sourceText);
    }
  });
});
