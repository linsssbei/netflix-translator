import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  callTranslationAPI,
  validateTranslationResponse,
  prepareTranslation,
  DEFAULT_PROVIDER_CONFIG,
} from '../shared/translator-agent';
import type {
  CleanedTranslationInput,
} from '../shared/types';

const mockInput: CleanedTranslationInput = {
  targetLanguage: 'zh-CN',
  segments: [
    { id: 'seg_0_0_5000', startMs: 0, endMs: 5000, sourceText: 'Hello world' },
    { id: 'seg_1_5000_10000', startMs: 5000, endMs: 10000, sourceText: 'How are you?' },
    { id: 'seg_2_10000_15000', startMs: 10000, endMs: 15000, sourceText: 'This is a test.' },
  ],
};

function mockApiResponse(segments: Array<{ id: string; translatedText: string }>) {
  return {
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        choices: [
          {
            message: {
              content: JSON.stringify({ segments }),
            },
          },
        ],
      }),
    text: () => Promise.resolve(''),
  };
}

describe('callTranslationAPI', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('calls the API with correct format', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockApiResponse([
        { id: 'seg_0_0_5000', translatedText: '你好世界' },
        { id: 'seg_1_5000_10000', translatedText: '你好吗？' },
        { id: 'seg_2_10000_15000', translatedText: '这是测试。' },
      ]) as Response
    );

    const result = await callTranslationAPI(mockInput, {
      apiKey: 'test-key',
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const callArgs = fetchSpy.mock.calls[0];
    expect(callArgs[0]).toBe(DEFAULT_PROVIDER_CONFIG.endpoint);

    const body = JSON.parse((callArgs[1] as RequestInit).body as string);
    expect(body.model).toBe(DEFAULT_PROVIDER_CONFIG.model);
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[1].role).toBe('user');
    expect(body.response_format).toEqual({ type: 'json_object' });

    expect(result).toHaveLength(3);
    expect(result[0].translatedText).toBe('你好世界');
  });

  it('uses custom endpoint and model when provided', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockApiResponse([{ id: 'seg_0_0_5000', translatedText: 'test' }]) as Response
    );

    await callTranslationAPI(mockInput, {
      apiKey: 'test-key',
      endpoint: 'https://custom.api/v1/chat/completions',
      model: 'custom-model',
    });

    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.model).toBe('custom-model');
    expect(fetchSpy.mock.calls[0][0]).toBe('https://custom.api/v1/chat/completions');
  });

  it('throws on API error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Unauthorized'),
    } as Response);

    await expect(
      callTranslationAPI(mockInput, { apiKey: 'bad-key' })
    ).rejects.toThrow('Translation API error (401)');
  });

  it('throws on empty response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [] }),
    } as Response);

    await expect(
      callTranslationAPI(mockInput, { apiKey: 'test-key' })
    ).rejects.toThrow('empty response');
  });

  it('throws on invalid JSON response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: 'not json' } }],
        }),
    } as Response);

    await expect(
      callTranslationAPI(mockInput, { apiKey: 'test-key' })
    ).rejects.toThrow('Failed to parse');
  });

  it('throws when segments array is missing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: '{"other": "data"}' } }],
        }),
    } as Response);

    await expect(
      callTranslationAPI(mockInput, { apiKey: 'test-key' })
    ).rejects.toThrow('missing segments array');
  });
});

describe('validateTranslationResponse', () => {
  it('validates a correct response', () => {
    const result = validateTranslationResponse(mockInput.segments, [
      { id: 'seg_0_0_5000', translatedText: '你好世界' },
      { id: 'seg_1_5000_10000', translatedText: '你好吗？' },
      { id: 'seg_2_10000_15000', translatedText: '这是测试。' },
    ]);

    expect(result.valid).toBe(true);
    expect(result.validatedSegments).toHaveLength(3);
    expect(result.validatedSegments[0].startMs).toBe(0);
    expect(result.validatedSegments[1].startMs).toBe(5000);
    expect(result.validatedSegments[2].startMs).toBe(10000);
  });

  it('preserves timing from input', () => {
    const result = validateTranslationResponse(mockInput.segments, [
      { id: 'seg_0_0_5000', translatedText: 'a' },
      { id: 'seg_1_5000_10000', translatedText: 'b' },
      { id: 'seg_2_10000_15000', translatedText: 'c' },
    ]);

    expect(result.valid).toBe(true);
    expect(result.validatedSegments[0].startMs).toBe(0);
    expect(result.validatedSegments[0].endMs).toBe(5000);
  });

  it('rejects when segments are missing', () => {
    const result = validateTranslationResponse(mockInput.segments, [
      { id: 'seg_0_0_5000', translatedText: 'hello' },
      // Missing seg_1 and seg_2
    ]);

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Missing translated segments');
  });

  it('rejects when extra segments appear', () => {
    const result = validateTranslationResponse(mockInput.segments, [
      { id: 'seg_0_0_5000', translatedText: 'hello' },
      { id: 'seg_1_5000_10000', translatedText: 'hello' },
      { id: 'seg_2_10000_15000', translatedText: 'hello' },
      { id: 'seg_99_extra', translatedText: 'extra' },
    ]);

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Unexpected segment IDs');
  });

  it('rejects when translations are empty', () => {
    const result = validateTranslationResponse(mockInput.segments, [
      { id: 'seg_0_0_5000', translatedText: 'hello' },
      { id: 'seg_1_5000_10000', translatedText: '' },
      { id: 'seg_2_10000_15000', translatedText: 'test' },
    ]);

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('empty translations');
  });

  it('rejects when all segment IDs are wrong', () => {
    const result = validateTranslationResponse(mockInput.segments, [
      { id: 'wrong_1', translatedText: 'a' },
      { id: 'wrong_2', translatedText: 'b' },
      { id: 'wrong_3', translatedText: 'c' },
    ]);

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Missing');
  });

  it('trims whitespace from translations', () => {
    const result = validateTranslationResponse(mockInput.segments, [
      { id: 'seg_0_0_5000', translatedText: '  hello  ' },
      { id: 'seg_1_5000_10000', translatedText: '\nworld\t' },
      { id: 'seg_2_10000_15000', translatedText: 'test' },
    ]);

    expect(result.valid).toBe(true);
    expect(result.validatedSegments[0].translatedText).toBe('hello');
    expect(result.validatedSegments[1].translatedText).toBe('world');
  });
});

describe('prepareTranslation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a valid TranslatedArtifact on success', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockApiResponse([
        { id: 'seg_0_0_5000', translatedText: '你好世界' },
        { id: 'seg_1_5000_10000', translatedText: '你好吗？' },
        { id: 'seg_2_10000_15000', translatedText: '这是测试。' },
      ]) as Response
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

  it('throws on validation failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockApiResponse([
        { id: 'seg_0_0_5000', translatedText: 'hello' },
        // Missing seg_1 and seg_2
      ]) as Response
    );

    await expect(
      prepareTranslation(
        mockInput,
        { apiKey: 'test-key' },
        '12345',
        'en',
        'abc123',
        'openai'
      )
    ).rejects.toThrow('Translation validation failed');
  });

  it('throws on API failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

    await expect(
      prepareTranslation(
        mockInput,
        { apiKey: 'test-key' },
        '12345',
        'en',
        'abc123',
        'openai'
      )
    ).rejects.toThrow('Network error');
  });

  it('throws on HTTP error status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve('Rate limited'),
    } as Response);

    await expect(
      prepareTranslation(
        mockInput,
        { apiKey: 'test-key' },
        '12345',
        'en',
        'abc123',
        'openai'
      )
    ).rejects.toThrow('Translation API error (429)');
  });
});
