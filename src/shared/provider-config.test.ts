import { describe, it, expect } from 'vitest';
import { resolveProviderConfig } from '../shared/provider-factory';

describe('resolveProviderConfig', () => {
  it('resolves DeepSeek provider with all fields filled', () => {
    const config = resolveProviderConfig({
      apiKey: 'sk-deepseek-key',
      provider: 'deepseek',
      model: 'deepseek-chat',
      endpoint: 'https://api.deepseek.com/v1',
    });
    expect(config.providerId).toBe('deepseek');
    expect(config.apiKey).toBe('sk-deepseek-key');
    expect(config.model).toBe('deepseek-chat');
    expect(config.endpoint).toBe('https://api.deepseek.com/v1');
  });

  it('fills DeepSeek defaults when fields are omitted', () => {
    const config = resolveProviderConfig({
      apiKey: 'sk-deepseek-key',
      provider: 'deepseek',
    });
    expect(config.providerId).toBe('deepseek');
    expect(config.model).toBe('deepseek-chat');
  });

  it('defaults to DeepSeek when no provider is specified', () => {
    const config = resolveProviderConfig({
      apiKey: 'sk-legacy-key',
    });
    expect(config.providerId).toBe('deepseek');
    expect(config.model).toBe('deepseek-chat');
  });

  it('resolves OpenAI provider correctly', () => {
    const config = resolveProviderConfig({
      apiKey: 'sk-openai-key',
      provider: 'openai',
    });
    expect(config.providerId).toBe('openai');
    expect(config.model).toBe('gpt-4o');
  });

  it('resolves Gemini provider correctly', () => {
    const config = resolveProviderConfig({
      apiKey: 'gemini-key',
      provider: 'gemini',
      model: 'gemini-2.0-flash',
    });
    expect(config.providerId).toBe('gemini');
    expect(config.model).toBe('gemini-2.0-flash');
  });

  it('resolves Anthropic provider correctly', () => {
    const config = resolveProviderConfig({
      apiKey: 'anthropic-key',
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-latest',
    });
    expect(config.providerId).toBe('anthropic');
    expect(config.model).toBe('claude-3-5-sonnet-latest');
  });

  it('throws on missing API key', () => {
    expect(() =>
      resolveProviderConfig({
        apiKey: '',
        provider: 'deepseek',
      })
    ).toThrow('API key is required');
  });

  it('throws on unsupported provider ID', () => {
    expect(() =>
      resolveProviderConfig({
        apiKey: 'some-key',
        provider: 'unknown-vendor',
      })
    ).toThrow('Unsupported provider: unknown-vendor');
  });

  it('throws when endpoint is required but missing', () => {
    expect(() =>
      resolveProviderConfig({
        apiKey: 'some-key',
        provider: 'openai-compatible',
        model: 'my-model',
      })
    ).toThrow('endpoint URL is required');
  });

  it('resolves openai-compatible with endpoint and model', () => {
    const config = resolveProviderConfig({
      apiKey: 'some-key',
      provider: 'openai-compatible',
      model: 'custom-model',
      endpoint: 'https://my-llm.example.com/v1',
    });
    expect(config.providerId).toBe('openai-compatible');
    expect(config.model).toBe('custom-model');
    expect(config.endpoint).toBe('https://my-llm.example.com/v1');
  });

  it('throws when model is empty for openai-compatible', () => {
    expect(() =>
      resolveProviderConfig({
        apiKey: 'some-key',
        provider: 'openai-compatible',
        endpoint: 'https://my-llm.example.com/v1',
      })
    ).toThrow('model is required');
  });

  it('legacy custom provider ID is rejected (use openai-compatible)', () => {
    // 'custom' is the old value, now superseded by 'openai-compatible'
    expect(() =>
      resolveProviderConfig({
        apiKey: 'some-key',
        provider: 'custom',
      })
    ).toThrow('Unsupported provider: custom');
  });

  it('resolves endpoint when provided explicitly', () => {
    const config = resolveProviderConfig({
      apiKey: 'some-key',
      provider: 'deepseek',
      model: 'deepseek-chat',
      endpoint: 'https://custom-deepseek.example.com/v1',
    });
    expect(config.endpoint).toBe('https://custom-deepseek.example.com/v1');
  });

  it('uses registry default model for deepseek when no model specified', () => {
    const config = resolveProviderConfig({
      apiKey: 'some-key',
      provider: 'deepseek',
    });
    expect(config.model).toBe('deepseek-chat');
  });

  it('uses registry default model for openai when no model specified', () => {
    const config = resolveProviderConfig({
      apiKey: 'some-key',
      provider: 'openai',
    });
    expect(config.model).toBe('gpt-4o');
  });
});
