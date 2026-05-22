import type {
  CleanedTranslationInput,
  TranslatedSegment,
  TranslatedArtifact,
  TranslationProvider,
} from './types';

/**
 * Segment translated by the provider, before validation
 */
interface RawTranslatedSegment {
  id: string;
  translatedText: string;
}

/**
 * Translation provider configuration
 */
export interface ProviderConfig {
  apiKey: string;
  endpoint?: string;
  model?: string;
}

/**
 * Default provider configuration
 */
export const DEFAULT_PROVIDER_CONFIG: Pick<Required<ProviderConfig>, 'endpoint' | 'model'> = {
  endpoint: 'https://api.deepseek.com/v1/chat/completions',
  model: 'deepseek-chat',
};

/**
 * Build the system prompt for subtitle translation
 */
function buildSystemPrompt(targetLanguage: string): string {
  const languageNames: Record<string, string> = {
    'zh-CN': 'Simplified Chinese',
    'zh-TW': 'Traditional Chinese',
    'ja': 'Japanese',
    'ko': 'Korean',
    'fr': 'French',
    'de': 'German',
    'es': 'Spanish',
    'pt': 'Portuguese',
    'it': 'Italian',
    'ru': 'Russian',
    'ar': 'Arabic',
    'th': 'Thai',
    'vi': 'Vietnamese',
  };

  const langName = languageNames[targetLanguage] || targetLanguage;

  return `You are a professional subtitle translator. Translate the following subtitles into ${langName}.

Rules:
1. Translate each segment individually while maintaining natural context flow.
2. Preserve the exact segment IDs — do not change, reorder, or merge them.
3. Keep translations concise — subtitles must fit on screen.
4. Preserve the tone (formal, casual, emotional) of the original.
5. Do NOT add explanations, notes, or commentary.
6. Respond ONLY with a JSON object containing a "segments" array.

Example response format:
{
  "segments": [
    {"id": "seg_0_0_5000", "translatedText": "翻译文本"}
  ]
}`;
}

/**
 * Build the user prompt from cleaned translation input
 */
function buildUserPrompt(input: CleanedTranslationInput): string {
  const segmentLines = input.segments.map(
    (s) => `[${s.id}] ${s.startMs}ms-${s.endMs}ms: ${s.sourceText}`
  );

  return `Translate these ${input.segments.length} subtitle segments:

${segmentLines.join('\n')}

Return the translations as a JSON object with the same IDs.`;
}

/**
 * Call the OpenAI-compatible API to translate segments
 */
export async function callTranslationAPI(
  input: CleanedTranslationInput,
  config: ProviderConfig
): Promise<RawTranslatedSegment[]> {
  const endpoint = config.endpoint || DEFAULT_PROVIDER_CONFIG.endpoint;
  const model = config.model || DEFAULT_PROVIDER_CONFIG.model;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: buildSystemPrompt(input.targetLanguage) },
        { role: 'user', content: buildUserPrompt(input) },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Translation API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();

  // Parse the response - expect { segments: [...] }
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Translation API returned empty response');
  }

  let parsed: { segments?: RawTranslatedSegment[] };
  try {
    parsed = typeof content === 'string' ? JSON.parse(content) : content;
  } catch {
    throw new Error('Failed to parse translation response JSON');
  }

  if (!parsed.segments || !Array.isArray(parsed.segments)) {
    throw new Error('Translation response missing segments array');
  }

  return parsed.segments;
}

/**
 * Validation result for translation response
 */
export interface TranslationValidationResult {
  valid: boolean;
  reason: string;
  validatedSegments: TranslatedSegment[];
}

/**
 * Validate translation response against input segments.
 * Checks: all IDs present, no extra IDs, timing preserved.
 */
export function validateTranslationResponse(
  inputSegments: CleanedTranslationInput['segments'],
  translatedSegments: RawTranslatedSegment[]
): TranslationValidationResult {
  const inputMap = new Map(inputSegments.map((s) => [s.id, s]));
  const translatedMap = new Map(translatedSegments.map((s) => [s.id, s]));

  // Check for missing IDs
  const missingIds = inputSegments
    .map((s) => s.id)
    .filter((id) => !translatedMap.has(id));

  if (missingIds.length > 0) {
    return {
      valid: false,
      reason: `Missing translated segments: ${missingIds.slice(0, 3).join(', ')}${missingIds.length > 3 ? '...' : ''}`,
      validatedSegments: [],
    };
  }

  // Check for extra IDs (translator added segments we didn't ask for)
  const extraIds = translatedSegments
    .map((s) => s.id)
    .filter((id) => !inputMap.has(id));

  if (extraIds.length > 0) {
    return {
      valid: false,
      reason: `Unexpected segment IDs in response: ${extraIds.slice(0, 3).join(', ')}`,
      validatedSegments: [],
    };
  }

  // Check all segments have non-empty translations
  const emptyTranslations = translatedSegments.filter((s) => !s.translatedText?.trim());
  if (emptyTranslations.length > 0) {
    return {
      valid: false,
      reason: `${emptyTranslations.length} segments have empty translations`,
      validatedSegments: [],
    };
  }

  // Build validated segments with timing from input
  const validatedSegments: TranslatedSegment[] = translatedSegments.map((ts) => {
    const input = inputMap.get(ts.id)!;
    return {
      id: ts.id,
      startMs: input.startMs,
      endMs: input.endMs,
      translatedText: ts.translatedText.trim(),
    };
  });

  return {
    valid: true,
    reason: 'ok',
    validatedSegments,
  };
}

/**
 * Full translation preparation pipeline:
 * 1. Call the translation API
 * 2. Validate the response
 * 3. Return a TranslatedArtifact
 */
export async function prepareTranslation(
  input: CleanedTranslationInput,
  config: ProviderConfig,
  videoId: string,
  sourceLanguage: string,
  sourceSubtitleHash: string,
  provider: TranslationProvider
): Promise<TranslatedArtifact> {
  // Split into batches if segment count exceeds safe token limit
  // For now, send all at once (most episodes are <500 segments)
  const rawSegments = await callTranslationAPI(input, config);

  const validation = validateTranslationResponse(input.segments, rawSegments);

  if (!validation.valid) {
    throw new Error(`Translation validation failed: ${validation.reason}`);
  }

  return {
    videoId,
    sourceLanguage,
    targetLanguage: input.targetLanguage,
    sourceSubtitleHash,
    preparedAt: Date.now(),
    provider,
    segments: validation.validatedSegments,
  };
}
