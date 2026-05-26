import type {
  CleanedTranslationInput,
  TranslatedSegment,
  TranslatedArtifact,
  TranslationProvider,
  TranslationDebugInfo,
  TranslationProgressInfo,
} from './types';
import {
  createLanguageModel,
  callAISDKProvider,
  buildDefaultStyleProfile,
  type AIProviderConfig,
  type TranslationStyleProfile,
  type ContextPolicy,
  type RawTranslatedSegment,
  type ProviderBatchResult,
  type OnStreamProgress,
} from './translation-provider';

const RETRY_CONTEXT_BEFORE = 5;
const RETRY_CONTEXT_AFTER = 5;

/**
 * Translation provider configuration (backward compatible)
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
  model: 'deepseek-v4-pro',
};

const TRANSLATION_BATCH_SIZE = 100;
const DEFAULT_CONTEXT_BEFORE = 3;
const DEFAULT_CONTEXT_AFTER = 3;

/**
 * Validation result for translation response
 */
export interface TranslationValidationResult {
  valid: boolean;
  reason: string;
  validatedSegments: TranslatedSegment[];
}

/**
 * Detailed validation result that separates valid from invalid segments
 */
export interface BatchValidationDetails {
  /** Whether the entire batch is valid */
  valid: boolean;
  /** Human-readable reason for failure */
  reason: string;
  /** Segments that passed validation */
  validSegments: TranslatedSegment[];
  /** IDs of segments that failed validation */
  invalidIds: string[];
  /** Whether this is a partial failure (some valid, some invalid) */
  isPartialFailure: boolean;
}

/**
 * Validate a batch response with detailed per-segment results.
 * Separates valid segments from invalid ones for smart retry.
 */
export function validateBatchResponseDetailed(
  inputSegments: CleanedTranslationInput['segments'],
  translatedSegments: RawTranslatedSegment[]
): BatchValidationDetails {
  const inputMap = new Map(inputSegments.map((s) => [s.id, s]));
  const translatedMap = new Map<string, RawTranslatedSegment>();
  const invalidIds: string[] = [];

  // Check for duplicate IDs in response
  for (const ts of translatedSegments) {
    if (translatedMap.has(ts.id)) {
      return {
        valid: false,
        reason: `Duplicate segment ID in response: ${ts.id}`,
        validSegments: [],
        invalidIds: inputSegments.map((s) => s.id),
        isPartialFailure: false,
      };
    }
    translatedMap.set(ts.id, ts);
  }

  // Check for extra IDs (translator added segments we didn't ask for)
  const extraIds = translatedSegments.map((s) => s.id).filter((id) => !inputMap.has(id));
  if (extraIds.length > 0) {
    return {
      valid: false,
      reason: `Unexpected segment IDs in response: ${extraIds.slice(0, 3).join(', ')}`,
      validSegments: [],
      invalidIds: inputSegments.map((s) => s.id),
      isPartialFailure: false,
    };
  }

  // Build validated segments and identify invalid ones
  const validSegments: TranslatedSegment[] = [];

  for (const inputSeg of inputSegments) {
    const ts = translatedMap.get(inputSeg.id);

    if (!ts) {
      invalidIds.push(inputSeg.id);
      continue;
    }

    if (!ts.translatedText?.trim()) {
      invalidIds.push(inputSeg.id);
      continue;
    }

    validSegments.push({
      id: inputSeg.id,
      startMs: inputSeg.startMs,
      endMs: inputSeg.endMs,
      translatedText: ts.translatedText.trim(),
    });
  }

  const isPartialFailure = validSegments.length > 0 && invalidIds.length > 0;

  if (invalidIds.length > 0) {
    return {
      valid: false,
      reason: `${invalidIds.length} segments have empty or missing translations`,
      validSegments,
      invalidIds,
      isPartialFailure,
    };
  }

  return {
    valid: true,
    reason: 'ok',
    validSegments,
    invalidIds: [],
    isPartialFailure: false,
  };
}

/**
 * Validate a single batch translation response against its input segments.
 * Checks: exact IDs match, no duplicates, no extras, non-empty text, preserved timing.
 */
export function validateBatchResponse(
  inputSegments: CleanedTranslationInput['segments'],
  translatedSegments: RawTranslatedSegment[]
): TranslationValidationResult {
  const detailed = validateBatchResponseDetailed(inputSegments, translatedSegments);
  return {
    valid: detailed.valid,
    reason: detailed.reason,
    validatedSegments: detailed.validSegments,
  };
}

/**
 * Validate translation response against input segments.
 * @deprecated Use validateBatchResponse for per-batch validation
 */
export function validateTranslationResponse(
  inputSegments: CleanedTranslationInput['segments'],
  translatedSegments: RawTranslatedSegment[]
): TranslationValidationResult {
  return validateBatchResponse(inputSegments, translatedSegments);
}

/**
 * Callback for saving incremental batch progress
 */
export type OnBatchComplete = (
  validatedSegments: TranslatedSegment[],
  progress: TranslationProgressInfo
) => void | Promise<void>;

/**
 * Resolve provider type from config
 */
function resolveProviderType(config: ProviderConfig): 'deepseek' | 'openai' | 'custom' {
  const endpoint = config.endpoint || DEFAULT_PROVIDER_CONFIG.endpoint;
  if (endpoint.includes('deepseek')) return 'deepseek';
  if (endpoint.includes('openai')) return 'openai';
  return 'custom';
}

/**
 * Create an AI SDK provider config from the legacy ProviderConfig
 */
function toAIProviderConfig(config: ProviderConfig): AIProviderConfig {
  return {
    apiKey: config.apiKey,
    provider: resolveProviderType(config),
    endpoint: config.endpoint,
    model: config.model,
  };
}

/**
 * Full translation preparation pipeline using AI SDK and incremental batch processing:
 * 1. Create AI SDK language model from config
 * 2. Split segments into batches of 20
 * 3. For each batch, call the AI SDK provider with style profile and context policy
 * 4. Validate each batch independently (domain validation after AI SDK schema validation)
 * 5. Append validated segments via callback
 * 6. Mark complete only after all batches succeed
 *
 * On failure, partial progress is preserved for diagnostics.
 */
export async function prepareTranslation(
  input: CleanedTranslationInput,
  config: ProviderConfig,
  videoId: string,
  sourceLanguage: string,
  sourceSubtitleHash: string,
  provider: TranslationProvider,
  onDebug?: (debug: TranslationDebugInfo) => void | Promise<void>,
  onBatchComplete?: OnBatchComplete,
  options?: {
    styleProfile?: TranslationStyleProfile;
    contextPolicy?: ContextPolicy;
    onStreamProgress?: OnStreamProgress;
  }
): Promise<TranslatedArtifact> {
  const aiConfig = toAIProviderConfig(config);
  const model = createLanguageModel(aiConfig);
  const styleProfile = options?.styleProfile || buildDefaultStyleProfile(input.targetLanguage);
  const contextPolicy: ContextPolicy = options?.contextPolicy || {
    contextBeforeCount: DEFAULT_CONTEXT_BEFORE,
    contextAfterCount: DEFAULT_CONTEXT_AFTER,
  };

  const totalSegments = input.segments.length;
  const totalBatches = Math.ceil(totalSegments / TRANSLATION_BATCH_SIZE);
  const allValidatedSegments: TranslatedSegment[] = [];
  const modelId = typeof model === 'string' ? model : (model as { modelId?: string }).modelId || aiConfig.model || 'unknown';

  console.log(
    `[Translator Agent] Starting AI SDK batch translation: segments=${totalSegments}, batches=${totalBatches}, batchSize=${TRANSLATION_BATCH_SIZE}, provider=${aiConfig.provider}`
  );

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const batchStart = batchIndex * TRANSLATION_BATCH_SIZE;
    const batchEnd = Math.min(batchStart + TRANSLATION_BATCH_SIZE, totalSegments);
    const batchSegments = input.segments.slice(batchStart, batchEnd);
    const batchNumber = batchIndex + 1;

    // Gather context from adjacent segments
    const contextStart = Math.max(0, batchStart - contextPolicy.contextBeforeCount);
    const contextBefore = input.segments.slice(contextStart, batchStart);
    const contextEnd = Math.min(totalSegments, batchEnd + contextPolicy.contextAfterCount);
    const contextAfter = input.segments.slice(batchEnd, contextEnd);

    // Build prior translation summary if available
    let priorSummary: string | undefined;
    if (allValidatedSegments.length > 0 && contextPolicy.priorTranslationSummary) {
      priorSummary = contextPolicy.priorTranslationSummary;
    }

    console.log(
      `[Translator Agent] Processing batch ${batchNumber}/${totalBatches}: segments=${batchSegments.length}, context=${contextBefore.length + contextAfter.length}`
    );

    await onDebug?.({
      videoId,
      model: modelId,
      strategy: 'batch',
      requestPhase: 'started',
      segmentCount: batchSegments.length,
      updatedAt: Date.now(),
    });

    let batchResult: ProviderBatchResult;
    try {
      batchResult = await callAISDKProvider(
        model,
        modelId,
        batchSegments,
        contextBefore,
        contextAfter,
        styleProfile,
        { ...contextPolicy, priorTranslationSummary: priorSummary },
        options?.onStreamProgress,
        batchNumber,
        totalBatches
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[Translator Agent] Batch ${batchNumber}/${totalBatches} failed: ${message}`);

      await onDebug?.({
        videoId,
        model: modelId,
        strategy: 'batch',
        requestPhase: 'failed',
        segmentCount: batchSegments.length,
        errorMessage: message,
        updatedAt: Date.now(),
      });

      // Throw with partial progress preserved in the error for diagnostics
      const partialError = new Error(
        `Batch ${batchNumber}/${totalBatches} failed: ${message}`
      ) as Error & { partialSegments?: TranslatedSegment[] };
      partialError.partialSegments = allValidatedSegments;
      throw partialError;
    }

    // Domain validation: exact IDs, no duplicates, no extras, non-empty text, preserved timing
    const batchValidation = validateBatchResponseDetailed(batchSegments, batchResult.segments);

    if (!batchValidation.valid) {
      // Partial failure: some segments valid, some invalid → smart retry
      if (batchValidation.isPartialFailure) {
        console.log(
          `[Translator Agent] Batch ${batchNumber}/${totalBatches} partial failure: ${batchValidation.reason}. Retrying ${batchValidation.invalidIds.length} failed segments with context.`
        );

        const retryResult = await retryFailedSegments({
          allInputSegments: input.segments,
          failedIds: batchValidation.invalidIds,
          validSegments: batchValidation.validSegments,
          model,
          modelId,
          styleProfile,
          contextPolicy,
          onStreamProgress: options?.onStreamProgress,
          batchNumber,
          totalBatches,
          videoId,
          onDebug,
        });

        if (retryResult.success) {
          console.log(
            `[Translator Agent] Retry succeeded for batch ${batchNumber}/${totalBatches}: recovered ${retryResult.recoveredSegments.length} segments`
          );
          // Merge valid segments from original response + recovered segments from retry
          allValidatedSegments.push(...batchValidation.validSegments);
          allValidatedSegments.push(...retryResult.recoveredSegments);
        } else {
          const retryMessage = `Batch ${batchNumber}/${totalBatches} validation failed after retry: ${retryResult.reason}`;
          console.error(`[Translator Agent] ${retryMessage}`);

          await onDebug?.({
            videoId,
            model: modelId,
            strategy: 'batch',
            requestPhase: 'failed',
            segmentCount: batchSegments.length,
            errorMessage: retryMessage,
            updatedAt: Date.now(),
            finishReason: batchResult.debug.finishReason,
            responseContentLength: batchResult.debug.responseContentLength,
            usage: batchResult.debug.usage,
          });

          const partialError = new Error(retryMessage) as Error & {
            partialSegments?: TranslatedSegment[];
          };
          partialError.partialSegments = allValidatedSegments;
          throw partialError;
        }
      } else {
        // Total batch failure (all invalid or structural error) → no retry, stop immediately
        const validationMessage = `Batch ${batchNumber}/${totalBatches} validation failed: ${batchValidation.reason}`;
        console.error(`[Translator Agent] ${validationMessage}`);

        await onDebug?.({
          videoId,
          model: modelId,
          strategy: 'batch',
          requestPhase: 'failed',
          segmentCount: batchSegments.length,
          errorMessage: validationMessage,
          updatedAt: Date.now(),
          finishReason: batchResult.debug.finishReason,
          responseContentLength: batchResult.debug.responseContentLength,
          usage: batchResult.debug.usage,
        });

        const partialError = new Error(validationMessage) as Error & {
          partialSegments?: TranslatedSegment[];
        };
        partialError.partialSegments = allValidatedSegments;
        throw partialError;
      }
    } else {
      // Full success — append all valid segments
      allValidatedSegments.push(...batchValidation.validSegments);
    }

    const progress: TranslationProgressInfo = {
      currentBatch: batchNumber,
      totalBatches,
      validatedSegmentCount: allValidatedSegments.length,
      totalSegmentCount: totalSegments,
      providerModel: modelId,
    };

    console.log(
      `[Translator Agent] Batch ${batchNumber}/${totalBatches} validated: ${allValidatedSegments.length}/${totalSegments} segments complete`
    );

    // Persist incremental progress
    if (onBatchComplete) {
      await onBatchComplete(batchValidation.validSegments, progress);
    }

    await onDebug?.({
      videoId,
      model: modelId,
      strategy: 'batch',
      requestPhase: 'completed',
      segmentCount: batchSegments.length,
      validatedCount: batchValidation.validSegments.length,
      updatedAt: Date.now(),
      finishReason: batchResult.debug.finishReason,
      responseContentLength: batchResult.debug.responseContentLength,
      usage: batchResult.debug.usage,
    });
  }

    // All batches validated successfully
    // Sort segments by start time to ensure correct ordering
    const sortedSegments = allValidatedSegments.sort((a, b) => a.startMs - b.startMs);

    return {
      videoId,
      sourceLanguage,
      targetLanguage: input.targetLanguage,
      sourceSubtitleHash,
      preparedAt: Date.now(),
      provider,
      segments: sortedSegments,
    };
}

// ─── Smart Retry for Partial Batch Failures ────────────────────────

interface RetryResult {
  success: boolean;
  recoveredSegments: TranslatedSegment[];
  reason: string;
}

interface RetryOptions {
  allInputSegments: CleanedTranslationInput['segments'];
  failedIds: string[];
  validSegments: TranslatedSegment[];
  model: ReturnType<typeof createLanguageModel>;
  modelId: string;
  styleProfile: TranslationStyleProfile;
  contextPolicy: ContextPolicy;
  onStreamProgress?: OnStreamProgress;
  batchNumber: number;
  totalBatches: number;
  videoId: string;
  onDebug?: (debug: TranslationDebugInfo) => void | Promise<void>;
}

/**
 * Retry only failed segments from a partial batch failure.
 * Includes adjacent context segments for better translation quality.
 * The context segments are marked as read-only and excluded from the response.
 */
async function retryFailedSegments(options: RetryOptions): Promise<RetryResult> {
  const {
    allInputSegments,
    failedIds,
    validSegments,
    model,
    modelId,
    styleProfile,
    contextPolicy,
    onStreamProgress,
    batchNumber,
    totalBatches,
    videoId,
    onDebug,
  } = options;

  const failedIdSet = new Set(failedIds);

  // Collect failed segments in order
  const failedSegments = allInputSegments.filter((s) => failedIdSet.has(s.id));

  if (failedSegments.length === 0) {
    return { success: true, recoveredSegments: [], reason: 'No failed segments to retry' };
  }

  // Build context: find indices of failed segments and gather surrounding context
  const failedIndices = failedSegments.map((s) => allInputSegments.findIndex((seg) => seg.id === s.id));
  const minIndex = Math.min(...failedIndices);
  const maxIndex = Math.max(...failedIndices);

  const contextStart = Math.max(0, minIndex - RETRY_CONTEXT_BEFORE);
  const contextEnd = Math.min(allInputSegments.length, maxIndex + RETRY_CONTEXT_AFTER + 1);

  // Context segments = surrounding segments that are NOT in the failed set
  const contextBefore = allInputSegments
    .slice(contextStart, minIndex)
    .filter((s) => !failedIdSet.has(s.id));
  const contextAfter = allInputSegments
    .slice(maxIndex + 1, contextEnd)
    .filter((s) => !failedIdSet.has(s.id));

  // Prior translation summary: include already-validated translations as context
  let priorSummary: string | undefined;
  if (validSegments.length > 0) {
    const recentValid = validSegments.slice(-RETRY_CONTEXT_BEFORE);
    priorSummary = recentValid.map((s) => `[${s.id}] ${s.translatedText}`).join('\n');
  }

  console.log(
    `[Translator Agent] Retrying ${failedSegments.length} segments with ${contextBefore.length + contextAfter.length} context segments`
  );

  await onDebug?.({
    videoId,
    model: modelId,
    strategy: 'batch',
    requestPhase: 'started',
    segmentCount: failedSegments.length,
    updatedAt: Date.now(),
  });

  let retryResult: ProviderBatchResult;
  try {
    retryResult = await callAISDKProvider(
      model,
      modelId,
      failedSegments,
      contextBefore,
      contextAfter,
      styleProfile,
      { ...contextPolicy, priorTranslationSummary: priorSummary },
      onStreamProgress,
      batchNumber,
      totalBatches
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, recoveredSegments: [], reason: `Retry API call failed: ${message}` };
  }

  // Validate retry response — must recover ALL failed segments
  const retryValidation = validateBatchResponseDetailed(failedSegments, retryResult.segments);

  if (!retryValidation.valid) {
    return {
      success: false,
      recoveredSegments: [],
      reason: `Retry validation failed: ${retryValidation.reason}`,
    };
  }

  await onDebug?.({
    videoId,
    model: modelId,
    strategy: 'batch',
    requestPhase: 'completed',
    segmentCount: failedSegments.length,
    validatedCount: retryValidation.validSegments.length,
    updatedAt: Date.now(),
    finishReason: retryResult.debug.finishReason,
    responseContentLength: retryResult.debug.responseContentLength,
    usage: retryResult.debug.usage,
  });

  return {
    success: true,
    recoveredSegments: retryValidation.validSegments,
    reason: 'ok',
  };
}
