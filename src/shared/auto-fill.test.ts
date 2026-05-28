import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('ai', () => ({
  generateObject: vi.fn(),
}));

vi.mock('@ai-sdk/deepseek', () => ({
  createDeepSeek: vi.fn(() => vi.fn(() => ({ modelId: 'deepseek-chat' }))),
}));

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => vi.fn(() => ({ modelId: 'gpt-4o' }))),
}));

import { performAutoFill } from '../shared/auto-fill';
import { generateObject } from 'ai';

describe('Auto-fill', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns structured profile suggestions from provider', async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        tone: 'Casual and humorous',
        backgroundNotes: 'A sci-fi thriller series about time travel',
        characterNames: [
          { original: '主人公', translation: 'Hero' },
          { original: '先生', translation: 'Teacher' },
        ],
        glossary: [
          { term: '時間旅行', translation: 'Time travel' },
          { term: '未来', translation: 'Future' },
        ],
        sourceURLs: [
          { url: 'https://example.com/wiki/show', label: 'Show Wiki' },
        ],
      },
      usage: { inputTokens: 100, outputTokens: 50 },
    } as any);

    const result = await performAutoFill(
      '12345',
      'Time Travel Adventure',
      'ja',
      'en',
      'test-api-key',
      'deepseek'
    );

    expect(result.tone).toBe('Casual and humorous');
    expect(result.backgroundNotes).toBe('A sci-fi thriller series about time travel');
    expect(result.characterNames).toHaveLength(2);
    expect(result.characterNames[0]).toEqual({ original: '主人公', translation: 'Hero' });
    expect(result.glossary).toHaveLength(2);
    expect(result.sourceURLs).toHaveLength(1);
    expect(result.sourceURLs[0].url).toBe('https://example.com/wiki/show');
  });

  it('handles provider failure gracefully', async () => {
    vi.mocked(generateObject).mockRejectedValue(new Error('API rate limit exceeded'));

    await expect(
      performAutoFill('12345', undefined, 'en', 'zh-CN', 'test-key', 'openai')
    ).rejects.toThrow('API rate limit exceeded');
  });

  it('passes video title to prompt when available', async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        tone: 'Dramatic',
        backgroundNotes: 'Crime drama',
        characterNames: [],
        glossary: [],
        sourceURLs: [],
      },
      usage: { inputTokens: 50, outputTokens: 20 },
    } as any);

    await performAutoFill('12345', 'Breaking Bad', 'en', 'es', 'test-key', 'openai');

    const callArgs = vi.mocked(generateObject).mock.calls[0][0] as any;
    expect(callArgs.prompt).toContain('Breaking Bad');
  });

  it('passes Netflix context hints to the prompt when available', async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        tone: 'Grounded',
        backgroundNotes: 'Family drama',
        characterNames: [],
        glossary: [],
        sourceURLs: [],
      },
      usage: { inputTokens: 50, outputTokens: 20 },
    } as any);

    await performAutoFill(
      '12345',
      'My Show',
      'en',
      'zh-CN',
      'test-key',
      'deepseek',
      undefined,
      undefined,
      {
        synopsis: 'A Netflix-provided synopsis.',
        maturityRating: 'TV-14',
      }
    );

    const callArgs = vi.mocked(generateObject).mock.calls[0][0] as any;
    expect(callArgs.prompt).toContain('A Netflix-provided synopsis.');
    expect(callArgs.prompt).toContain('TV-14');
  });

  it('uses video ID when title is not available', async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        tone: '',
        backgroundNotes: '',
        characterNames: [],
        glossary: [],
        sourceURLs: [],
      },
      usage: { inputTokens: 50, outputTokens: 20 },
    } as any);

    await performAutoFill('99999', undefined, 'en', 'zh-CN', 'test-key', 'deepseek');

    const callArgs = vi.mocked(generateObject).mock.calls[0][0] as any;
    expect(callArgs.prompt).toContain('99999');
  });
});
