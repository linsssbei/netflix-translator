import { describe, it, expect } from 'vitest';
import {
  getProviderDefinition,
  requireProviderDefinition,
  listProviderIds,
  PROVIDER_REGISTRY,
} from '../shared/provider-registry';

describe('ProviderRegistry', () => {
  it('contains all required first-class providers', () => {
    const ids = listProviderIds();
    expect(ids).toContain('deepseek');
    expect(ids).toContain('openai');
    expect(ids).toContain('gemini');
    expect(ids).toContain('anthropic');
    expect(ids).toContain('openai-compatible');
  });

  it('each provider definition has required fields', () => {
    for (const def of PROVIDER_REGISTRY) {
      expect(def.id).toBeTruthy();
      expect(def.label).toBeTruthy();
      expect(def.family).toBeTruthy();
      expect(def.capabilities).toBeDefined();
      expect(typeof def.capabilities.structuredOutput).toBe('boolean');
      expect(['required', 'optional', 'hidden']).toContain(def.endpointPolicy);
    }
  });

  it('getProviderDefinition returns definition for valid ID', () => {
    const def = getProviderDefinition('deepseek');
    expect(def).toBeDefined();
    expect(def!.id).toBe('deepseek');
    expect(def!.label).toBe('DeepSeek');
    expect(def!.family).toBe('openai-compatible');
  });

  it('getProviderDefinition returns undefined for unknown ID', () => {
    expect(getProviderDefinition('unknown-provider')).toBeUndefined();
  });

  it('requireProviderDefinition throws for unknown ID', () => {
    expect(() => requireProviderDefinition('unknown-provider')).toThrow(
      'Unsupported provider: unknown-provider'
    );
  });

  it('requireProviderDefinition returns definition for valid ID', () => {
    const def = requireProviderDefinition('openai');
    expect(def).toBeDefined();
    expect(def.id).toBe('openai');
  });

  it('openai-compatible provider has required endpoint policy', () => {
    const def = getProviderDefinition('openai-compatible');
    expect(def).toBeDefined();
    expect(def!.endpointPolicy).toBe('required');
    expect(def!.defaultModel).toBe('');
  });

  it('first-class providers have optional or hidden endpoint', () => {
    for (const id of ['deepseek', 'openai', 'gemini', 'anthropic'] as const) {
      const def = getProviderDefinition(id);
      expect(def).toBeDefined();
      if (id === 'gemini') {
        expect(def!.endpointPolicy).toBe('hidden');
      } else {
        expect(def!.endpointPolicy).toBe('optional');
      }
    }
  });

  it('gemini has hidden endpoint', () => {
    const def = getProviderDefinition('gemini');
    expect(def).toBeDefined();
    expect(def!.endpointPolicy).toBe('hidden');
  });

  it('deepseek and openai use openai-compatible family', () => {
    expect(getProviderDefinition('deepseek')!.family).toBe('openai-compatible');
    expect(getProviderDefinition('openai')!.family).toBe('openai-compatible');
  });

  it('anthropic uses anthropic family', () => {
    expect(getProviderDefinition('anthropic')!.family).toBe('anthropic');
  });

  it('gemini uses gemini family', () => {
    expect(getProviderDefinition('gemini')!.family).toBe('gemini');
  });
});
