import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  validateBatchResponse,
  validateTranslationResponse,
  prepareTranslation,
  validateBatchResponseDetailed,
} from '../shared/translator-agent';
import type {
  CleanedTranslationInput,
} from '../shared/types';
import { generateObject } from 'ai';

const mockInput: CleanedTranslationInput = {
  targetLanguage: 'zh-CN',
  segments: [
    { id: 'seg_0', startMs: 0, endMs: 5000, sourceText: 'Hello world' },
    { id: 'seg_1', startMs: 5000, endMs: 10000, sourceText: 'How are you?' },
    { id: 'seg_2', startMs: 10000, endMs: 15000, sourceText: 'This is a test.' },
  ],
};

// Mock the AI SDK module
vi.mock('ai', () => ({
  generateObject: vi.fn(),
}));

vi.mock('@ai-sdk/deepseek', () => ({
  createDeepSeek: vi.fn(() => vi.fn(() => ({ modelId: 'deepseek-chat' }))),
}));

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => vi.fn(() => ({ modelId: 'gpt-4o' }))),
}));

function mockGenerateObjectResult(segments: Array<{ id: string; translatedText: string }>) {
  return {
    object: { segments },
    usage: {
      inputTokens: 100,
      outputTokens: 50,
    },
  };
}

describe('validateBatchResponse', () => {
  it('validates a correct batch response', () => {
    const result = validateBatchResponse(mockInput.segments, [
      { id: 'seg_0', translatedText: '你好世界' },
      { id: 'seg_1', translatedText: '你好吗？' },
      { id: 'seg_2', translatedText: '这是测试。' },
    ]);

    expect(result.valid).toBe(true);
    expect(result.validatedSegments).toHaveLength(3);
    expect(result.validatedSegments[0].startMs).toBe(0);
    expect(result.validatedSegments[1].startMs).toBe(5000);
    expect(result.validatedSegments[2].startMs).toBe(10000);
  });

  it('preserves timing from input', () => {
    const result = validateBatchResponse(mockInput.segments, [
      { id: 'seg_0', translatedText: 'a' },
      { id: 'seg_1', translatedText: 'b' },
      { id: 'seg_2', translatedText: 'c' },
    ]);

    expect(result.valid).toBe(true);
    expect(result.validatedSegments[0].startMs).toBe(0);
    expect(result.validatedSegments[0].endMs).toBe(5000);
  });

  it('rejects when segments are missing', () => {
    const result = validateBatchResponse(mockInput.segments, [
      { id: 'seg_0', translatedText: 'hello' },
      // Missing seg_1 and seg_2
    ]);

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('empty or missing');
  });

  it('rejects when extra segments appear', () => {
    const result = validateBatchResponse(mockInput.segments, [
      { id: 'seg_0', translatedText: 'hello' },
      { id: 'seg_1', translatedText: 'hello' },
      { id: 'seg_2', translatedText: 'hello' },
      { id: 'seg_99_extra', translatedText: 'extra' },
    ]);

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Unexpected segment IDs');
  });

  it('rejects when translations are empty', () => {
    const result = validateBatchResponse(mockInput.segments, [
      { id: 'seg_0', translatedText: 'hello' },
      { id: 'seg_1', translatedText: '' },
      { id: 'seg_2', translatedText: 'test' },
    ]);

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('empty or missing');
  });

  it('rejects when all segment IDs are wrong', () => {
    const result = validateBatchResponse(mockInput.segments, [
      { id: 'wrong_1', translatedText: 'a' },
      { id: 'wrong_2', translatedText: 'b' },
      { id: 'wrong_3', translatedText: 'c' },
    ]);

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Unexpected segment IDs');
  });

  it('rejects duplicate IDs in response', () => {
    const result = validateBatchResponse(mockInput.segments, [
      { id: 'seg_0', translatedText: 'hello' },
      { id: 'seg_0', translatedText: 'world' },
      { id: 'seg_1', translatedText: 'test' },
      { id: 'seg_2', translatedText: 'test2' },
    ]);

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Duplicate');
  });

  it('trims whitespace from translations', () => {
    const result = validateBatchResponse(mockInput.segments, [
      { id: 'seg_0', translatedText: '  hello  ' },
      { id: 'seg_1', translatedText: '\nworld\t' },
      { id: 'seg_2', translatedText: 'test' },
    ]);

    expect(result.valid).toBe(true);
    expect(result.validatedSegments[0].translatedText).toBe('hello');
    expect(result.validatedSegments[1].translatedText).toBe('world');
  });

  it('works as backward-compatible alias for validateTranslationResponse', () => {
    const result = validateTranslationResponse(mockInput.segments, [
      { id: 'seg_0', translatedText: '你好世界' },
      { id: 'seg_1', translatedText: '你好吗？' },
      { id: 'seg_2', translatedText: '这是测试。' },
    ]);

    expect(result.valid).toBe(true);
    expect(result.validatedSegments).toHaveLength(3);
  });
});

// ─── validateBatchResponseDetailed ─────────────────────────────────

describe('validateBatchResponseDetailed', () => {
  it('returns all valid for complete correct response', () => {
    const result = validateBatchResponseDetailed(mockInput.segments, [
      { id: 'seg_0', translatedText: '你好世界' },
      { id: 'seg_1', translatedText: '你好吗？' },
      { id: 'seg_2', translatedText: '这是测试。' },
    ]);

    expect(result.valid).toBe(true);
    expect(result.validSegments).toHaveLength(3);
    expect(result.invalidIds).toEqual([]);
    expect(result.isPartialFailure).toBe(false);
  });

  it('detects partial failure with one empty translation', () => {
    const result = validateBatchResponseDetailed(mockInput.segments, [
      { id: 'seg_0', translatedText: '你好世界' },
      { id: 'seg_1', translatedText: '' },
      { id: 'seg_2', translatedText: '这是测试。' },
    ]);

    expect(result.valid).toBe(false);
    expect(result.isPartialFailure).toBe(true);
    expect(result.validSegments).toHaveLength(2);
    expect(result.invalidIds).toEqual(['seg_1']);
    expect(result.validSegments[0].id).toBe('seg_0');
    expect(result.validSegments[1].id).toBe('seg_2');
  });

  it('detects partial failure with one missing segment', () => {
    const result = validateBatchResponseDetailed(mockInput.segments, [
      { id: 'seg_0', translatedText: '你好世界' },
      { id: 'seg_2', translatedText: '这是测试。' },
    ]);

    expect(result.valid).toBe(false);
    expect(result.isPartialFailure).toBe(true);
    expect(result.validSegments).toHaveLength(2);
    expect(result.invalidIds).toEqual(['seg_1']);
  });

  it('treats total failure as non-partial (all empty)', () => {
    const result = validateBatchResponseDetailed(mockInput.segments, [
      { id: 'seg_0', translatedText: '' },
      { id: 'seg_1', translatedText: '' },
      { id: 'seg_2', translatedText: '' },
    ]);

    expect(result.valid).toBe(false);
    expect(result.isPartialFailure).toBe(false);
    expect(result.validSegments).toHaveLength(0);
    expect(result.invalidIds).toEqual(['seg_0', 'seg_1', 'seg_2']);
  });

  it('treats duplicate IDs as total failure, not partial', () => {
    const result = validateBatchResponseDetailed(mockInput.segments, [
      { id: 'seg_0', translatedText: 'a' },
      { id: 'seg_0', translatedText: 'b' },
      { id: 'seg_1', translatedText: 'c' },
    ]);

    expect(result.valid).toBe(false);
    expect(result.isPartialFailure).toBe(false);
    expect(result.validSegments).toHaveLength(0);
  });

  it('treats extra IDs as total failure, not partial', () => {
    const result = validateBatchResponseDetailed(mockInput.segments, [
      { id: 'seg_0', translatedText: 'a' },
      { id: 'seg_1', translatedText: 'b' },
      { id: 'seg_2', translatedText: 'c' },
      { id: 'seg_99', translatedText: 'extra' },
    ]);

    expect(result.valid).toBe(false);
    expect(result.isPartialFailure).toBe(false);
    expect(result.validSegments).toHaveLength(0);
  });
});

describe('prepareTranslation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a valid TranslatedArtifact using AI SDK batch processing', async () => {
    vi.mocked(generateObject).mockResolvedValue(
      mockGenerateObjectResult([
        { id: 'seg_0', translatedText: '你好世界' },
        { id: 'seg_1', translatedText: '你好吗？' },
        { id: 'seg_2', translatedText: '这是测试。' },
      ]) as any
    );

    const artifact = await prepareTranslation(
      mockInput,
      { apiKey: 'test-key' },
      '12345',
      'en',
      'abc123hash',
      'openai'
    );

    expect(artifact.videoId).toBe('12345');
    expect(artifact.sourceLanguage).toBe('en');
    expect(artifact.targetLanguage).toBe('zh-CN');
    expect(artifact.sourceSubtitleHash).toBe('abc123hash');
    expect(artifact.provider).toBe('openai');
    expect(artifact.segments).toHaveLength(3);
    expect(artifact.preparedAt).toBeGreaterThan(0);
  });

  it('processes segments in batches of 100', async () => {
    const largeInput: CleanedTranslationInput = {
      targetLanguage: 'zh-CN',
      segments: Array.from({ length: 150 }, (_, index) => ({
        id: `seg_${index}`,
        startMs: index * 1000,
        endMs: index * 1000 + 900,
        sourceText: `Line ${index}`,
      })),
    };

    
    let callCount = 0;
    vi.mocked(generateObject).mockImplementation(async (options: any) => {
      callCount++;
      const userMsg = options.messages.find((m: any) => m.role === 'user');
      const content = userMsg?.content as string;
      // Extract IDs from [TRANSLATE] section only
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
      return mockGenerateObjectResult(
        ids.map((id) => ({ id, translatedText: `translated ${id}` }))
      ) as any;
    });

    const artifact = await prepareTranslation(
      largeInput,
      { apiKey: 'test-key' },
      '12345',
      'en',
      'abc123hash',
      'deepseek'
    );

    // 150 segments / 100 per batch = 2 batches
    expect(callCount).toBe(2);
    expect(artifact.segments).toHaveLength(150);
    expect(artifact.segments[0].translatedText).toBe('translated nt_seg_0');
    expect(artifact.segments[149].translatedText).toBe('translated nt_seg_149');
  });

  it('validates each batch independently', async () => {
    const largeInput: CleanedTranslationInput = {
      targetLanguage: 'zh-CN',
      segments: Array.from({ length: 150 }, (_, index) => ({
        id: `seg_${index}`,
        startMs: index * 1000,
        endMs: index * 1000 + 900,
        sourceText: `Line ${index}`,
      })),
    };

    
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
      // Second batch returns TOTAL failure (all empty) — parallel processing preserves first batch
      if (callCount === 2) {
        return mockGenerateObjectResult(
          ids.map((id) => ({ id, translatedText: '' }))
        ) as any;
      }
      return mockGenerateObjectResult(
        ids.map((id) => ({ id, translatedText: `translated ${id}` }))
      ) as any;
    });

    try {
      await prepareTranslation(
        largeInput,
        { apiKey: 'test-key' },
        '12345',
        'en',
        'abc123hash',
        'deepseek'
      );
      expect.fail('Should have thrown');
    } catch (err) {
      expect((err as Error).message).toContain('partially failed');
      // First batch succeeded — preserved in partial segments
      expect((err as Error & { partialSegments: unknown[] }).partialSegments).toHaveLength(100);
    }

    expect(callCount).toBe(2);
  });

  it('calls onBatchComplete after each successful batch', async () => {
    const largeInput: CleanedTranslationInput = {
      targetLanguage: 'zh-CN',
      segments: Array.from({ length: 150 }, (_, index) => ({
        id: `seg_${index}`,
        startMs: index * 1000,
        endMs: index * 1000 + 900,
        sourceText: `Line ${index}`,
      })),
    };

    
    vi.mocked(generateObject).mockImplementation(async (options: any) => {
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
      return mockGenerateObjectResult(
        ids.map((id) => ({ id, translatedText: `translated ${id}` }))
      ) as any;
    });

    const batchCompletions: Array<{ segments: number; progress: unknown }> = [];
    const artifact = await prepareTranslation(
      largeInput,
      { apiKey: 'test-key' },
      '12345',
      'en',
      'abc123hash',
      'deepseek',
      undefined,
      (segments, progress) => {
        batchCompletions.push({ segments: segments.length, progress });
      }
    );

    // 150 segments / 100 per batch = 2 batches
    expect(batchCompletions).toHaveLength(2);
    expect(batchCompletions[0].segments).toBe(100);
    expect(batchCompletions[1].segments).toBe(50);
    expect(artifact.segments).toHaveLength(150);
  });

  it('emits debug events for each batch', async () => {
    
    vi.mocked(generateObject).mockResolvedValue(
      mockGenerateObjectResult([
        { id: 'seg_0', translatedText: '你好世界' },
        { id: 'seg_1', translatedText: '你好吗？' },
        { id: 'seg_2', translatedText: '这是测试。' },
      ]) as any
    );

    const debugRecords: unknown[] = [];
    await prepareTranslation(
      mockInput,
      { apiKey: 'test-key' },
      '12345',
      'en',
      'abc123hash',
      'deepseek',
      (debug) => {
        debugRecords.push(debug);
      }
    );

    expect(debugRecords).toHaveLength(2); // started + completed
    expect(debugRecords[0]).toMatchObject({
      strategy: 'batch',
      requestPhase: 'started',
    });
    expect(debugRecords[1]).toMatchObject({
      strategy: 'batch',
      requestPhase: 'completed',
      validatedCount: 3,
    });
  });

  it('preserves partial segments on parallel batch failure', async () => {
    const largeInput: CleanedTranslationInput = {
      targetLanguage: 'zh-CN',
      segments: Array.from({ length: 150 }, (_, index) => ({
        id: `seg_${index}`,
        startMs: index * 1000,
        endMs: index * 1000 + 900,
        sourceText: `Line ${index}`,
      })),
    };

    
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
      // Second batch fails with provider error
      if (callCount === 2) {
        throw new Error('Provider error');
      }
      return mockGenerateObjectResult(
        ids.map((id) => ({ id, translatedText: `translated ${id}` }))
      ) as any;
    });

    try {
      await prepareTranslation(
        largeInput,
        { apiKey: 'test-key' },
        '12345',
        'en',
        'abc123hash',
        'deepseek'
      );
      expect.fail('Should have thrown');
    } catch (err) {
      expect((err as Error).message).toContain('partially failed');
      // Partial segments from first batch should be preserved (100 segments)
      expect((err as Error & { partialSegments: unknown[] }).partialSegments).toHaveLength(100);
    }
  });

  it('throws on provider failure', async () => {
    
    vi.mocked(generateObject).mockRejectedValue(new Error('Network error'));

    try {
      await prepareTranslation(
        mockInput,
        { apiKey: 'test-key' },
        '12345',
        'en',
        'abc123',
        'openai'
      );
      expect.fail('Should have thrown');
    } catch (err) {
      expect((err as Error).message).toContain('partially failed');
    }
  });

  it('retries a transient empty provider response once', async () => {
    vi.mocked(generateObject)
      .mockRejectedValueOnce(new Error('No object generated: the model did not return a response.'))
      .mockResolvedValueOnce(
        mockGenerateObjectResult([
          { id: 'nt_seg_0', translatedText: '你好世界' },
          { id: 'nt_seg_1', translatedText: '你好吗？' },
          { id: 'nt_seg_2', translatedText: '这是测试。' },
        ]) as any
      );

    const artifact = await prepareTranslation(
      mockInput,
      { apiKey: 'test-key' },
      '12345',
      'en',
      'abc123',
      'openai'
    );

    expect(vi.mocked(generateObject)).toHaveBeenCalledTimes(2);
    expect(artifact.segments).toHaveLength(3);
  });

  it('uses custom style profile when provided', async () => {
    
    vi.mocked(generateObject).mockResolvedValue(
      mockGenerateObjectResult([
        { id: 'seg_0', translatedText: '你好世界' },
        { id: 'seg_1', translatedText: '你好吗？' },
        { id: 'seg_2', translatedText: '这是测试。' },
      ]) as any
    );

    await prepareTranslation(
      mockInput,
      { apiKey: 'test-key' },
      '12345',
      'en',
      'abc123hash',
      'deepseek',
      undefined,
      undefined,
      {
        styleProfile: {
          targetLanguageName: 'Simplified Chinese',
          tone: 'Use casual tone.',
          namingConsistency: 'Keep names consistent.',
          brevity: 'Keep it short.',
          glossary: [{ term: 'Netflix', translation: '网飞' }],
        },
      }
    );

    
    const callArgs = vi.mocked(generateObject).mock.calls[0][0] as any;
    const systemPrompt = callArgs.messages[0].content as string;
    expect(systemPrompt).toContain('Use casual tone.');
    expect(systemPrompt).toContain('网飞');
  });

  it('uses custom context policy when provided', async () => {
    const largeInput: CleanedTranslationInput = {
      targetLanguage: 'zh-CN',
      segments: Array.from({ length: 150 }, (_, index) => ({
        id: `seg_${index}`,
        startMs: index * 1000,
        endMs: index * 1000 + 900,
        sourceText: `Line ${index}`,
      })),
    };

    
    vi.mocked(generateObject).mockImplementation(async (options: any) => {
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
      return mockGenerateObjectResult(
        ids.map((id) => ({ id, translatedText: `translated ${id}` }))
      ) as any;
    });

    await prepareTranslation(
      largeInput,
      { apiKey: 'test-key' },
      '12345',
      'en',
      'abc123hash',
      'deepseek',
      undefined,
      undefined,
      {
        contextPolicy: {
          contextBeforeCount: 5,
          contextAfterCount: 2,
        },
      }
    );

    // Second batch should have 5 context segments before (not default 3)
    const secondCallArgs = vi.mocked(generateObject).mock.calls[1][0] as any;
    const secondPrompt = secondCallArgs.messages[1].content as string;
    // Count context lines before [TRANSLATE]
    const contextLines = secondPrompt.split('\n').filter((l: string) => l.startsWith('[CONTEXT]'));
    expect(contextLines.length).toBeGreaterThan(0);
  });

  it('emits streaming progress events', async () => {
    
    vi.mocked(generateObject).mockResolvedValue(
      mockGenerateObjectResult([
        { id: 'seg_0', translatedText: '你好世界' },
        { id: 'seg_1', translatedText: '你好吗？' },
        { id: 'seg_2', translatedText: '这是测试。' },
      ]) as any
    );

    const streamEvents: Array<{ type: string; batchNumber: number }> = [];
    await prepareTranslation(
      mockInput,
      { apiKey: 'test-key' },
      '12345',
      'en',
      'abc123hash',
      'deepseek',
      undefined,
      undefined,
      {
        onStreamProgress: (event) => {
          streamEvents.push({ type: event.type, batchNumber: event.batchNumber });
        },
      }
    );

    expect(streamEvents).toHaveLength(2);
    expect(streamEvents[0].type).toBe('batch-start');
    expect(streamEvents[1].type).toBe('batch-complete');
  });

  it('processes all segments correctly with parallel batches', async () => {
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

      return mockGenerateObjectResult(
        ids.map((id) => ({ id, translatedText: `translated ${id}` }))
      ) as any;
    });

    const artifact = await prepareTranslation(
      mockInput,
      { apiKey: 'test-key' },
      '12345',
      'en',
      'abc123hash',
      'deepseek'
    );

    expect(artifact.segments).toHaveLength(3);
    expect(artifact.segments[0].translatedText).toBe('translated nt_seg_0');
    expect(artifact.segments[1].translatedText).toBe('translated nt_seg_1');
    expect(artifact.segments[2].translatedText).toBe('translated nt_seg_2');
  });

  it('preserves partial progress when one batch fails', async () => {
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

      // First call: partial failure (seg_1 empty)
      if (callCount === 1) {
        return mockGenerateObjectResult([
          { id: 'seg_0', translatedText: 'translated seg_0' },
          { id: 'seg_1', translatedText: '' },
          { id: 'seg_2', translatedText: 'translated seg_2' },
        ]) as any;
      }

      return mockGenerateObjectResult(
        ids.map((id) => ({ id, translatedText: `translated ${id}` }))
      ) as any;
    });

    try {
      await prepareTranslation(
        mockInput,
        { apiKey: 'test-key' },
        '12345',
        'en',
        'abc123hash',
        'deepseek'
      );
      expect.fail('Should have thrown');
    } catch (err) {
      // Parallel mode: partial failure is still a failure
      expect((err as Error).message).toContain('partially failed');
      // Preserved valid segments
      expect((err as Error & { partialSegments: unknown[] }).partialSegments).toHaveLength(2);
    }
  });

  it('calls onBatchComplete with valid segments from a partially failed batch', async () => {
    vi.mocked(generateObject).mockResolvedValue(
      mockGenerateObjectResult([
        { id: 'seg_0', translatedText: 'translated seg_0' },
        { id: 'seg_1', translatedText: '' },
        { id: 'seg_2', translatedText: 'translated seg_2' },
      ]) as any
    );

    const batchCompletions: Array<{ ids: string[]; failedBatches?: number }> = [];

    try {
      await prepareTranslation(
        mockInput,
        { apiKey: 'test-key' },
        '12345',
        'en',
        'abc123hash',
        'deepseek',
        undefined,
        (segments, progress) => {
          batchCompletions.push({
            ids: segments.map((s) => s.id),
            failedBatches: progress.failedBatches,
          });
        }
      );
      expect.fail('Should have thrown');
    } catch (err) {
      expect((err as Error).message).toContain('partially failed');
    }

    expect(batchCompletions).toHaveLength(1);
    expect(batchCompletions[0].ids).toEqual(['seg_0', 'seg_2']);
    expect(batchCompletions[0].failedBatches).toBe(1);
  });

  it('fails completely when validation rejects all segments', async () => {
    vi.mocked(generateObject).mockResolvedValue(
      mockGenerateObjectResult([
        { id: 'seg_0', translatedText: '' },
        { id: 'seg_1', translatedText: '' },
        { id: 'seg_2', translatedText: '' },
      ]) as any
    );

    try {
      await prepareTranslation(
        mockInput,
        { apiKey: 'test-key' },
        '12345',
        'en',
        'abc123hash',
        'deepseek'
      );
      expect.fail('Should have thrown');
    } catch (err) {
      expect((err as Error).message).toContain('partially failed');
      // No partial segments when all fail validation (no valid segments to preserve)
      expect((err as Error & { partialSegments: unknown[] }).partialSegments).toHaveLength(0);
    }
  });
});
