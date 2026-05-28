import { generateObject, type LanguageModel } from 'ai';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import type { CleanedTranslationInput, TranslationDebugInfo, TranslationContextProfile } from './types';

/**
 * Raw segment returned by provider before domain validation
 */
export interface RawTranslatedSegment {
  id: string;
  translatedText: string;
}

/**
 * Result from a provider batch call
 */
export interface ProviderBatchResult {
  segments: RawTranslatedSegment[];
  debug: Omit<TranslationDebugInfo, 'videoId' | 'strategy' | 'segmentCount' | 'updatedAt'>;
}

/**
 * Translation style profile for consistent prompt construction
 */
export interface TranslationStyleProfile {
  /** Target language name (e.g., "Simplified Chinese") */
  targetLanguageName: string;
  /** Tone instructions */
  tone: string;
  /** Naming consistency rules */
  namingConsistency: string;
  /** Subtitle brevity instructions */
  brevity: string;
  /** Optional glossary terms */
  glossary?: Array<{ term: string; translation: string }>;
}

/**
 * Bounded context policy for batch requests
 */
export interface ContextPolicy {
  /** Number of adjacent source segments before the batch */
  contextBeforeCount: number;
  /** Number of adjacent source segments after the batch */
  contextAfterCount: number;
  /** Optional capped summary of prior validated translations */
  priorTranslationSummary?: string;
}

/**
 * Provider configuration for creating AI SDK models
 */
export interface AIProviderConfig {
  apiKey: string;
  provider: 'deepseek' | 'openai' | 'custom';
  endpoint?: string;
  model?: string;
}

/**
 * Default provider configurations
 */
const DEFAULT_CONFIGS: Record<string, { endpoint: string; model: string }> = {
  deepseek: {
    endpoint: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
  },
  openai: {
    endpoint: 'https://api.openai.com/v1',
    model: 'gpt-4o',
  },
};

/**
 * Create an AI SDK language model from provider configuration
 */
export function createLanguageModel(config: AIProviderConfig): LanguageModel {
  const defaults = DEFAULT_CONFIGS[config.provider] || DEFAULT_CONFIGS.openai;

  switch (config.provider) {
    case 'deepseek': {
      const provider = createDeepSeek({
        apiKey: config.apiKey,
        baseURL: config.endpoint || defaults.endpoint,
      });
      return provider(config.model || defaults.model);
    }
    case 'openai':
    case 'custom': {
      const provider = createOpenAI({
        apiKey: config.apiKey,
        baseURL: config.endpoint || defaults.endpoint,
      });
      return provider(config.model || defaults.model);
    }
    default:
      throw new Error(`Unsupported provider: ${config.provider}`);
  }
}

/**
 * Zod schema for batch translation output
 */
const batchTranslationSchema = z.object({
  segments: z.array(
    z.object({
      id: z.string().describe('Segment ID matching the request exactly'),
      translatedText: z.string().describe('Translated subtitle text'),
    })
  ),
});

const PROVIDER_ID_PREFIX = 'nt_';

export function toProviderSegmentId(segmentId: string): string {
  return `${PROVIDER_ID_PREFIX}${segmentId}`;
}

export function normalizeProviderSegments(
  segments: RawTranslatedSegment[],
  batchSegments: CleanedTranslationInput['segments'],
  contextBefore: CleanedTranslationInput['segments'],
  contextAfter: CleanedTranslationInput['segments']
): RawTranslatedSegment[] {
  const idMap = new Map<string, string>();
  for (const segment of [...batchSegments, ...contextBefore, ...contextAfter]) {
    idMap.set(toProviderSegmentId(segment.id), segment.id);

    const numericMatch = segment.id.match(/^seg_(\d+)$/);
    if (numericMatch) {
      idMap.set(numericMatch[1], segment.id);
    }
  }

  return segments.map((segment) => ({
    ...segment,
    id: idMap.get(segment.id) ?? segment.id,
  }));
}

/**
 * Build the default translation style profile
 */
export function buildDefaultStyleProfile(
  targetLanguage: string,
  glossary?: Array<{ term: string; translation: string }>
): TranslationStyleProfile {
  const languageNames: Record<string, string> = {
    'zh-CN': 'Simplified Chinese',
    'zh-TW': 'Traditional Chinese',
    ja: 'Japanese',
    ko: 'Korean',
    fr: 'French',
    de: 'German',
    es: 'Spanish',
    pt: 'Portuguese',
    it: 'Italian',
    ru: 'Russian',
    ar: 'Arabic',
    th: 'Thai',
    vi: 'Vietnamese',
  };

  return {
    targetLanguageName: languageNames[targetLanguage] || targetLanguage,
    tone: 'Preserve the tone (formal, casual, emotional) of the original.',
    namingConsistency:
      'Keep character names, place names, and proper nouns consistent across all segments.',
    brevity: 'Keep translations concise — subtitles must fit on screen.',
    glossary,
  };
}

/**
 * Build system prompt from a style profile and optional context profile
 */
export function buildSystemPromptFromProfile(
  profile: TranslationStyleProfile,
  contextProfile?: TranslationContextProfile
): string {
  let prompt = `You are a professional subtitle translator. Translate the following subtitles into ${profile.targetLanguageName}.

Rules:
1. Translate each segment individually while maintaining natural context flow.
2. Preserve the exact segment IDs — do not change, reorder, or merge them.
3. ${profile.brevity}
4. ${profile.tone}
5. ${profile.namingConsistency}
6. Do NOT add explanations, notes, or commentary.
7. Respond ONLY with a JSON object containing a "segments" array.
8. Only translate segments marked with [TRANSLATE]. Do NOT include segments marked with [CONTEXT] in your response.
9. Your response must contain exactly the requested output segments — no more, no less.
10. Segment IDs are opaque strings such as "nt_seg_123"; copy them exactly, including the "nt_" prefix.`;

  if (profile.glossary && profile.glossary.length > 0) {
    prompt += '\n\nGlossary (use these translations consistently):\n';
    for (const entry of profile.glossary) {
      prompt += `- "${entry.term}" → "${entry.translation}"\n`;
    }
  }

  if (contextProfile) {
    if (contextProfile.tone) {
      prompt += `\n\nTone Instructions: ${contextProfile.tone}`;
    }
    if (contextProfile.backgroundNotes) {
      prompt += `\n\nBackground: ${contextProfile.backgroundNotes}`;
    }
    if (contextProfile.characterNames.length > 0) {
      prompt += '\n\nCharacter Names (use these consistently):\n';
      for (const name of contextProfile.characterNames) {
        prompt += `- "${name.original}" → "${name.translation}"\n`;
      }
    }
    if (contextProfile.glossary.length > 0) {
      prompt += '\n\nTitle-Specific Glossary:\n';
      for (const entry of contextProfile.glossary) {
        prompt += `- "${entry.term}" → "${entry.translation}"\n`;
      }
    }
  }

  return prompt;
}

/**
 * Build user prompt for a batch with bounded context
 */
export function buildBatchPrompt(
  batchSegments: CleanedTranslationInput['segments'],
  contextBefore: CleanedTranslationInput['segments'],
  contextAfter: CleanedTranslationInput['segments'],
  priorSummary?: string
): string {
  const lines: string[] = [];

  if (priorSummary) {
    lines.push('[PRIOR CONTEXT] (read only, for reference):');
    lines.push(priorSummary);
    lines.push('');
  }

  if (contextBefore.length > 0) {
    lines.push('[CONTEXT] (read only, do not translate):');
    for (const s of contextBefore) {
      lines.push(`[${toProviderSegmentId(s.id)}] ${s.startMs}ms-${s.endMs}ms: ${s.sourceText}`);
    }
    lines.push('');
  }

  lines.push('[TRANSLATE] (translate these segments):');
  for (const s of batchSegments) {
    lines.push(`[${toProviderSegmentId(s.id)}] ${s.startMs}ms-${s.endMs}ms: ${s.sourceText}`);
  }

  if (contextAfter.length > 0) {
    lines.push('');
    lines.push('[CONTEXT] (read only, do not translate):');
    for (const s of contextAfter) {
      lines.push(`[${toProviderSegmentId(s.id)}] ${s.startMs}ms-${s.endMs}ms: ${s.sourceText}`);
    }
  }

  lines.push('');
  lines.push(`Return exactly ${batchSegments.length} translated segments as a JSON object.`);

  return lines.join('\n');
}

/**
 * Streaming progress callback
 */
export type OnStreamProgress = (event: {
  type: 'batch-start' | 'batch-progress' | 'batch-complete' | 'batch-error';
  batchNumber: number;
  totalBatches: number;
  detail?: string;
}) => void | Promise<void>;

/**
 * Call the AI SDK provider to translate a batch of segments
 */
export async function callAISDKProvider(
  model: LanguageModel,
  modelName: string,
  batchSegments: CleanedTranslationInput['segments'],
  contextBefore: CleanedTranslationInput['segments'],
  contextAfter: CleanedTranslationInput['segments'],
  profile: TranslationStyleProfile,
  contextPolicy: ContextPolicy,
  onStreamProgress?: OnStreamProgress,
  batchNumber?: number,
  totalBatches?: number,
  contextProfile?: TranslationContextProfile
): Promise<ProviderBatchResult> {
  const systemPrompt = buildSystemPromptFromProfile(profile, contextProfile);
  const userPrompt = buildBatchPrompt(
    batchSegments,
    contextBefore,
    contextAfter,
    contextPolicy.priorTranslationSummary
  );

  const batchNum = batchNumber ?? 1;
  const totalNum = totalBatches ?? 1;

  await onStreamProgress?.({
    type: 'batch-start',
    batchNumber: batchNum,
    totalBatches: totalNum,
  });

  try {
    const result = await generateObjectWithRetry({
      model,
      systemPrompt,
      userPrompt,
    });

    const segments = normalizeProviderSegments(
      result.object.segments as RawTranslatedSegment[],
      batchSegments,
      contextBefore,
      contextAfter
    );

    await onStreamProgress?.({
      type: 'batch-complete',
      batchNumber: batchNum,
      totalBatches: totalNum,
    });

    return {
      segments,
      debug: {
        model: modelName,
        finishReason: 'stop',
        responseContentLength: JSON.stringify(result.object).length,
        usage: {
          promptTokens: result.usage?.inputTokens,
          completionTokens: result.usage?.outputTokens,
          totalTokens:
            (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0),
        },
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    await onStreamProgress?.({
      type: 'batch-error',
      batchNumber: batchNum,
      totalBatches: totalNum,
      detail: message,
    });

    throw err;
  }
}

async function generateObjectWithRetry({
  model,
  systemPrompt,
  userPrompt,
}: {
  model: LanguageModel;
  systemPrompt: string;
  userPrompt: string;
}): ReturnType<typeof generateObject<typeof batchTranslationSchema>> {
  try {
    return await generateObject({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      schema: batchTranslationSchema,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!isTransientEmptyResponseError(message)) {
      throw err;
    }

    return generateObject({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      schema: batchTranslationSchema,
    });
  }
}

function isTransientEmptyResponseError(message: string): boolean {
  return message.includes('No object generated') ||
    message.includes('model did not return a response');
}
