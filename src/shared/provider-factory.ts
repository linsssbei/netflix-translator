import type { LanguageModel } from 'ai';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { requireProviderDefinition, type ProviderDefinition } from './provider-registry';

/**
 * Resolved runtime configuration for model creation.
 * All optional fields are resolved to concrete values.
 */
export interface ResolvedProviderConfig {
  apiKey: string;
  providerId: string;
  model: string;
  endpoint?: string;
}

/**
 * Create an AI SDK LanguageModel from a resolved provider config and registry definition.
 * Provider family determines which AI SDK package is used.
 */
export function createLanguageModel(
  config: ResolvedProviderConfig
): LanguageModel {
  const def = requireProviderDefinition(config.providerId);
  return createModelForFamily(def, config);
}

function createModelForFamily(
  def: ProviderDefinition,
  config: ResolvedProviderConfig
): LanguageModel {
  switch (def.family) {
    case 'openai-compatible': {
      if (def.id === 'deepseek') {
        const provider = createDeepSeek({
          apiKey: config.apiKey,
          baseURL: config.endpoint || def.defaultEndpoint,
        });
        return provider(config.model);
      }
      const provider = createOpenAI({
        apiKey: config.apiKey,
        baseURL: config.endpoint || def.defaultEndpoint || 'https://api.openai.com/v1',
      });
      return provider(config.model);
    }
    case 'anthropic': {
      const provider = createAnthropic({
        apiKey: config.apiKey,
        baseURL: config.endpoint || def.defaultEndpoint || 'https://api.anthropic.com/v1',
      });
      return provider(config.model);
    }
    case 'gemini': {
      const provider = createGoogleGenerativeAI({
        apiKey: config.apiKey,
      });
      return provider(config.model);
    }
    default:
      throw new Error(`Unsupported provider family: ${(def as ProviderDefinition).family}`);
  }
}

/**
 * Resolve a provider config: fill defaults from the registry and validate.
 * Returns a ResolvedProviderConfig or throws on invalid/missing values.
 */
export function resolveProviderConfig(raw: {
  apiKey: string;
  provider?: string;
  model?: string;
  endpoint?: string;
}): ResolvedProviderConfig {
  if (!raw.apiKey) {
    throw new Error('Provider configuration error: API key is required');
  }

  const providerId = raw.provider || 'deepseek';
  const def = requireProviderDefinition(providerId);

  const model = raw.model || def.defaultModel;
  if (!model) {
    throw new Error(
      `Provider configuration error: model is required for provider "${def.label}". Please specify a model.`
    );
  }

  if (def.endpointPolicy === 'required' && !raw.endpoint) {
    throw new Error(
      `Provider configuration error: endpoint URL is required for provider "${def.label}". Please specify an endpoint.`
    );
  }

  return {
    apiKey: raw.apiKey,
    providerId: def.id,
    model,
    endpoint: raw.endpoint,
  };
}
