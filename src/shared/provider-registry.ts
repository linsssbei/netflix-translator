/**
 * Stable LLM provider identifiers
 */
export type ProviderId = 'deepseek' | 'openai' | 'gemini' | 'anthropic' | 'openai-compatible';

/**
 * Provider families for model creation dispatch
 */
export type ProviderFamily = 'openai-compatible' | 'gemini' | 'anthropic';

/**
 * Capabilities a provider may declare support for
 */
export interface ProviderCapabilities {
  /** Whether the provider supports schema-backed structured output (generateObject) */
  structuredOutput: boolean;
}

/**
 * Endpoint visibility policy for UI rendering
 */
export type EndpointPolicy = 'required' | 'optional' | 'hidden';

/**
 * A single provider definition in the registry
 */
export interface ProviderDefinition {
  /** Stable provider identifier */
  id: ProviderId;
  /** Display label for UI */
  label: string;
  /** Provider family for model creation dispatch */
  family: ProviderFamily;
  /** Default model name */
  defaultModel: string;
  /** Default base URL (without API-path suffixes) */
  defaultEndpoint?: string;
  /** Whether the endpoint field is required, optional, or hidden in UI */
  endpointPolicy: EndpointPolicy;
  /** Placeholder text for the model field */
  modelPlaceholder: string;
  /** Declared capabilities */
  capabilities: ProviderCapabilities;
}

/**
 * Registry of all supported provider definitions.
 * Adding a new provider is additive — only this array needs to change.
 */
export const PROVIDER_REGISTRY: ProviderDefinition[] = [
  {
    id: 'deepseek',
    label: 'DeepSeek',
    family: 'openai-compatible',
    defaultModel: 'deepseek-chat',
    defaultEndpoint: 'https://api.deepseek.com/v1',
    endpointPolicy: 'optional',
    modelPlaceholder: 'deepseek-chat',
    capabilities: { structuredOutput: true },
  },
  {
    id: 'openai',
    label: 'OpenAI',
    family: 'openai-compatible',
    defaultModel: 'gpt-4o',
    defaultEndpoint: 'https://api.openai.com/v1',
    endpointPolicy: 'optional',
    modelPlaceholder: 'gpt-4o',
    capabilities: { structuredOutput: true },
  },
  {
    id: 'gemini',
    label: 'Gemini',
    family: 'gemini',
    defaultModel: 'gemini-2.0-flash',
    endpointPolicy: 'hidden',
    modelPlaceholder: 'gemini-2.0-flash',
    capabilities: { structuredOutput: true },
  },
  {
    id: 'anthropic',
    label: 'Claude (Anthropic)',
    family: 'anthropic',
    defaultModel: 'claude-3-5-sonnet-latest',
    defaultEndpoint: 'https://api.anthropic.com/v1',
    endpointPolicy: 'optional',
    modelPlaceholder: 'claude-3-5-sonnet-latest',
    capabilities: { structuredOutput: true },
  },
  {
    id: 'openai-compatible',
    label: 'Custom Endpoint',
    family: 'openai-compatible',
    defaultModel: '',
    endpointPolicy: 'required',
    modelPlaceholder: 'Enter model name',
    capabilities: { structuredOutput: true },
  },
];

/**
 * Lookup map: provider ID → definition
 */
const registryMap = new Map<ProviderId, ProviderDefinition>();
for (const def of PROVIDER_REGISTRY) {
  registryMap.set(def.id, def);
}

/**
 * Get a provider definition by ID, or undefined if unsupported
 */
export function getProviderDefinition(id: string): ProviderDefinition | undefined {
  return registryMap.get(id as ProviderId);
}

/**
 * Get a provider definition by ID, throwing if unsupported
 */
export function requireProviderDefinition(id: string): ProviderDefinition {
  const def = getProviderDefinition(id);
  if (!def) {
    throw new Error(`Unsupported provider: ${id}`);
  }
  return def;
}

/**
 * List all supported provider IDs
 */
export function listProviderIds(): ProviderId[] {
  return PROVIDER_REGISTRY.map((d) => d.id);
}
