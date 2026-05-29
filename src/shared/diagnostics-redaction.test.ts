import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('ai', () => ({
  generateObject: vi.fn(),
}));

vi.mock('@ai-sdk/deepseek', () => ({
  createDeepSeek: vi.fn(() => vi.fn(() => ({ modelId: 'deepseek-chat' }))),
}));

import { resolveProviderConfig } from '../shared/provider-factory';

describe('Provider diagnostics and secret redaction', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('resolveProviderConfig', () => {
    it('does not include API key in error messages', () => {
      try {
        resolveProviderConfig({
          apiKey: '',
          provider: 'deepseek',
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        expect(message).not.toContain('sk-');
        expect(message).toContain('API key');
      }
    });

    it('does not include API key in unsupported provider error', () => {
      try {
        resolveProviderConfig({
          apiKey: 'sk-secret-do-not-leak',
          provider: 'unknown-vendor',
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        expect(message).not.toContain('sk-secret-do-not-leak');
        expect(message).toContain('Unsupported provider');
      }
    });

    it('does not include API key in missing endpoint error', () => {
      try {
        resolveProviderConfig({
          apiKey: 'sk-very-secret-key',
          provider: 'openai-compatible',
          model: 'my-model',
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        expect(message).not.toContain('sk-very-secret-key');
        expect(message).toContain('endpoint URL is required');
      }
    });

    it('resolved config includes the provider ID', () => {
      const config = resolveProviderConfig({
        apiKey: 'test-key',
        provider: 'openai',
        model: 'gpt-4o',
      });
      expect(config.providerId).toBe('openai');
    });

    it('resolved config includes the model', () => {
      const config = resolveProviderConfig({
        apiKey: 'test-key',
        provider: 'deepseek',
        model: 'deepseek-chat',
      });
      expect(config.model).toBe('deepseek-chat');
    });

    it('fills default model when not provided', () => {
      const config = resolveProviderConfig({
        apiKey: 'test-key',
        provider: 'openai',
      });
      expect(config.model).toBe('gpt-4o');
    });

    it('fills default model for deepseek when not provided', () => {
      const config = resolveProviderConfig({
        apiKey: 'test-key',
        provider: 'deepseek',
      });
      expect(config.model).toBe('deepseek-chat');
    });

    it('fills default provider when none specified', () => {
      const config = resolveProviderConfig({
        apiKey: 'test-key',
      });
      expect(config.providerId).toBe('deepseek');
    });

    it('rejects empty model for openai-compatible', () => {
      expect(() =>
        resolveProviderConfig({
          apiKey: 'test-key',
          provider: 'openai-compatible',
          endpoint: 'https://example.com/v1',
        })
      ).toThrow('model is required');
    });

    it('resolves anthropic to anthropic family', () => {
      const config = resolveProviderConfig({
        apiKey: 'test-key',
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-latest',
      });
      expect(config.providerId).toBe('anthropic');
    });

    it('resolves gemini to gemini family', () => {
      const config = resolveProviderConfig({
        apiKey: 'test-key',
        provider: 'gemini',
        model: 'gemini-2.0-flash',
      });
      expect(config.providerId).toBe('gemini');
    });

    it('does not expose endpoint URL in errors', () => {
      try {
        resolveProviderConfig({
          apiKey: '',
          provider: 'openai-compatible',
          endpoint: 'https://my-secret-endpoint.internal/v1',
          model: 'my-model',
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        expect(message).not.toContain('my-secret-endpoint');
        expect(message).not.toContain('.internal');
      }
    });
  });
});
