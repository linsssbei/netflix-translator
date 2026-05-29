import type {
  CleanedTranslationInput,
  TranslatedSegment,
  TranslatedArtifact,
  TranslationProvider,
  TranslationDebugInfo,
  TranslationProgressInfo,
  TranslationContextProfile,
} from './types';
import {
  callAISDKProvider,
  buildDefaultStyleProfile,
  type TranslationStyleProfile,
  type ContextPolicy,
  type RawTranslatedSegment,
  type ProviderBatchResult,
  type OnStreamProgress,
} from './translation-provider';
import { createLanguageModel, resolveProviderConfig } from './provider-factory';

export interface ProviderConfig {
  apiKey: string;
  provider?: TranslationProvider;
  endpoint?: string;
  model?: string;
}

const TRANSLATION_BATCH_SIZE = 100;
const DEFAULT_CONTEXT_BEFORE = 20;
const DEFAULT_CONTEXT_AFTER = 20;
const DEFAULT_MAX_CONCURRENCY = 10;

export interface BatchPlan {
  batchIndex: number;
  batchNumber: number;
  outputStart: number;
  outputEnd: number;
  outputSegments: CleanedTranslationInput['segments'];
  contextBefore: CleanedTranslationInput['segments'];
  contextAfter: CleanedTranslationInput['segments'];
  outputIds: Set<string>;
  contextIds: Set<string>;
}

export function planBatches(
  segments: CleanedTranslationInput['segments'],
  batchSize: number,
  contextBeforeCount: number,
  contextAfterCount: number
): BatchPlan[] {
  const totalSegments = segments.length;
  const totalBatches = Math.ceil(totalSegments / batchSize);
  const batches: BatchPlan[] = [];

  for (let i = 0; i < totalBatches; i++) {
    const outputStart = i * batchSize;
    const outputEnd = Math.min(outputStart + batchSize, totalSegments);
    const outputSegments = segments.slice(outputStart, outputEnd);

    const contextBeforeStart = Math.max(0, outputStart - contextBeforeCount);
    const contextBefore = segments.slice(contextBeforeStart, outputStart);

    const contextAfterEnd = Math.min(totalSegments, outputEnd + contextAfterCount);
    const contextAfter = segments.slice(outputEnd, contextAfterEnd);

    const outputIds = new Set(outputSegments.map((s) => s.id));
    const contextIds = new Set([
      ...contextBefore.map((s) => s.id),
      ...contextAfter.map((s) => s.id),
    ]);

    batches.push({
      batchIndex: i,
      batchNumber: i + 1,
      outputStart,
      outputEnd,
      outputSegments,
      contextBefore,
      contextAfter,
      outputIds,
      contextIds,
    });
  }

  return batches;
}

export interface TranslationValidationResult {
  valid: boolean;
  reason: string;
  validatedSegments: TranslatedSegment[];
}

export interface BatchValidationDetails {
  valid: boolean;
  reason: string;
  validSegments: TranslatedSegment[];
  invalidIds: string[];
  isPartialFailure: boolean;
}

export function validateBatchResponseDetailed(
  inputSegments: CleanedTranslationInput['segments'],
  translatedSegments: RawTranslatedSegment[],
  contextIds?: Set<string>
): BatchValidationDetails {
  const inputMap = new Map(inputSegments.map((s) => [s.id, s]));
  const translatedMap = new Map<string, RawTranslatedSegment>();
  const invalidIds: string[] = [];

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

  if (contextIds && contextIds.size > 0) {
    const contextIdsInResponse = translatedSegments.filter((ts) => contextIds.has(ts.id));
    if (contextIdsInResponse.length > 0) {
      return {
        valid: false,
        reason: `Response contains context-only segment IDs: ${contextIdsInResponse.map((s) => s.id).slice(0, 5).join(', ')}`,
        validSegments: [],
        invalidIds: inputSegments.map((s) => s.id),
        isPartialFailure: false,
      };
    }
  }

  const extraIds = translatedSegments.map((s) => s.id).filter((id) => !inputMap.has(id) && !(contextIds && contextIds.has(id)));
  if (extraIds.length > 0) {
    return {
      valid: false,
      reason: `Unexpected segment IDs in response: ${extraIds.slice(0, 3).join(', ')}`,
      validSegments: [],
      invalidIds: inputSegments.map((s) => s.id),
      isPartialFailure: false,
    };
  }

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

export function validateBatchResponse(
  inputSegments: CleanedTranslationInput['segments'],
  translatedSegments: RawTranslatedSegment[],
  contextIds?: Set<string>
): TranslationValidationResult {
  const detailed = validateBatchResponseDetailed(inputSegments, translatedSegments, contextIds);
  return {
    valid: detailed.valid,
    reason: detailed.reason,
    validatedSegments: detailed.validSegments,
  };
}

export function validateTranslationResponse(
  inputSegments: CleanedTranslationInput['segments'],
  translatedSegments: RawTranslatedSegment[]
): TranslationValidationResult {
  return validateBatchResponse(inputSegments, translatedSegments);
}

export type OnBatchComplete = (
  validatedSegments: TranslatedSegment[],
  progress: TranslationProgressInfo
) => void | Promise<void>;

export interface ParallelBatchResult {
  batchIndex: number;
  batchNumber: number;
  validatedSegments: TranslatedSegment[];
  progress: TranslationProgressInfo;
  failed: boolean;
  errorMessage?: string;
}

async function processBatch(
  batch: BatchPlan,
  model: ReturnType<typeof createLanguageModel>,
  modelId: string,
  styleProfile: TranslationStyleProfile,
  contextPolicy: ContextPolicy,
  totalBatches: number,
  totalSegmentCount: number,
  videoId: string,
  _provider: TranslationProvider,
  onDebug?: (debug: TranslationDebugInfo) => void | Promise<void>,
  onStreamProgress?: OnStreamProgress,
  contextProfile?: TranslationContextProfile
): Promise<ParallelBatchResult> {
  const batchSegments = batch.outputSegments;
  const batchNumber = batch.batchNumber;

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
      batch.contextBefore,
      batch.contextAfter,
      styleProfile,
      contextPolicy,
      onStreamProgress,
      batchNumber,
      totalBatches,
      contextProfile
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

    return {
      batchIndex: batch.batchIndex,
      batchNumber,
      validatedSegments: [],
      progress: {
        currentBatch: batchNumber,
        totalBatches,
        validatedSegmentCount: 0,
        totalSegmentCount,
        providerModel: modelId,
        latestError: message,
      },
      failed: true,
      errorMessage: message,
    };
  }

  const batchValidation = validateBatchResponseDetailed(
    batchSegments,
    batchResult.segments,
    batch.contextIds
  );

  if (!batchValidation.valid) {
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

    return {
      batchIndex: batch.batchIndex,
      batchNumber,
      validatedSegments: batchValidation.validSegments,
      progress: {
        currentBatch: batchNumber,
        totalBatches,
        validatedSegmentCount: batchValidation.validSegments.length,
        totalSegmentCount,
        providerModel: modelId,
        latestError: validationMessage,
      },
      failed: true,
      errorMessage: validationMessage,
    };
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

  return {
    batchIndex: batch.batchIndex,
    batchNumber,
    validatedSegments: batchValidation.validSegments,
    progress: {
      currentBatch: batchNumber,
      totalBatches,
      validatedSegmentCount: batchValidation.validSegments.length,
      totalSegmentCount,
      providerModel: modelId,
    },
    failed: false,
  };
}

export async function prepareTranslation(
  input: CleanedTranslationInput,
  config: ProviderConfig,
  videoId: string,
  sourceLanguage: string,
  sourceSubtitleHash: string,
  onDebug?: (debug: TranslationDebugInfo) => void | Promise<void>,
  onBatchComplete?: OnBatchComplete,
  options?: {
    styleProfile?: TranslationStyleProfile;
    contextPolicy?: ContextPolicy;
    onStreamProgress?: OnStreamProgress;
    contextProfile?: TranslationContextProfile;
    maxConcurrency?: number;
  }
): Promise<TranslatedArtifact> {
  const resolved = resolveProviderConfig(config);
  const model = createLanguageModel(resolved);
  const resolvedProvider = resolved.providerId as TranslationProvider;
  const resolvedModel = resolved.model;
  const styleProfile = options?.styleProfile || buildDefaultStyleProfile(input.targetLanguage);
  const contextBeforeCount = options?.contextPolicy?.contextBeforeCount ?? DEFAULT_CONTEXT_BEFORE;
  const contextAfterCount = options?.contextPolicy?.contextAfterCount ?? DEFAULT_CONTEXT_AFTER;
  const contextPolicy: ContextPolicy = {
    contextBeforeCount,
    contextAfterCount,
    priorTranslationSummary: options?.contextPolicy?.priorTranslationSummary,
  };
  const maxConcurrency = options?.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY;

  const totalSegments = input.segments.length;
  const batches = planBatches(input.segments, TRANSLATION_BATCH_SIZE, contextBeforeCount, contextAfterCount);
  const totalBatches = batches.length;
  const modelId = typeof model === 'string' ? model : (model as { modelId?: string }).modelId || resolvedModel || 'unknown';


  console.log(
    `[Translator Agent] Starting parallel batch translation: segments=${totalSegments}, batches=${totalBatches}, batchSize=${TRANSLATION_BATCH_SIZE}, concurrency=${maxConcurrency}, provider=${resolvedProvider}`
  );

  const allValidatedSegments: TranslatedSegment[] = [];
  const batchResults = new Map<number, TranslatedSegment[]>();
  let completedBatches = 0;
  let failedBatches = 0;
  const inFlightBatches: number[] = [];

  const trackedProgress: TranslationProgressInfo = {
    currentBatch: 0,
    totalBatches,
    validatedSegmentCount: 0,
    totalSegmentCount: totalSegments,
    providerModel: modelId,
  };

  const pool = new Set<Promise<void>>();

  async function runBatch(batch: BatchPlan): Promise<void> {
    inFlightBatches.push(batch.batchNumber);

    const result = await processBatch(
      batch,
      model,
      modelId,
      styleProfile,
      contextPolicy,
      totalBatches,
      totalSegments,
      videoId,
      resolvedProvider,
      onDebug,
      options?.onStreamProgress,
      options?.contextProfile
    );

    const inFlightIdx = inFlightBatches.indexOf(batch.batchNumber);
    if (inFlightIdx !== -1) inFlightBatches.splice(inFlightIdx, 1);

    if (result.failed) {
      failedBatches++;
      batchResults.set(batch.batchIndex, result.validatedSegments);
      allValidatedSegments.push(...result.validatedSegments);
    } else {
      completedBatches++;
      batchResults.set(batch.batchIndex, result.validatedSegments);
      allValidatedSegments.push(...result.validatedSegments);
    }

    trackedProgress.currentBatch = result.progress.currentBatch;
    trackedProgress.validatedSegmentCount = allValidatedSegments.length;
    trackedProgress.completedBatches = completedBatches;
    trackedProgress.failedBatches = failedBatches;
    trackedProgress.inFlightBatches = [...inFlightBatches];
    if (result.errorMessage) trackedProgress.latestError = result.errorMessage;

    if (onBatchComplete && result.validatedSegments.length > 0) {
      await onBatchComplete(result.validatedSegments, { ...trackedProgress });
    }
  }

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const promise = runBatch(batch).then(() => {
      pool.delete(promise);
    });
    pool.add(promise);

    if (pool.size >= maxConcurrency) {
      await Promise.race(pool);
    }
  }

  await Promise.all(pool);

  if (failedBatches > 0) {
    const failedIndices = Array.from(batchResults.entries())
      .filter(([idx]) => {
        const batch = batches[idx];
        const segments = batchResults.get(idx);
        const validatedCount = segments?.length ?? 0;
        return validatedCount < batch.outputSegments.length;
      })
      .map(([idx]) => idx);

    console.log(
      `[Translator Agent] Translation completed with ${failedBatches} failed batch(es). ` +
      `${allValidatedSegments.length}/${totalSegments} segments validated. ` +
      `Failed batch indices: ${failedIndices.join(', ')}`
    );

    const partialError = new Error(
      `Translation partially failed: ${failedBatches}/${totalBatches} batch(es) failed. ` +
      `${allValidatedSegments.length}/${totalSegments} segments validated.`
    ) as Error & { partialSegments?: TranslatedSegment[] };
    partialError.partialSegments = [...allValidatedSegments].sort((a, b) => a.startMs - b.startMs);
    throw partialError;
  }

  const sortedSegments = allValidatedSegments.sort((a, b) => a.startMs - b.startMs);

  return {
    videoId,
    sourceLanguage,
    targetLanguage: input.targetLanguage,
    sourceSubtitleHash,
    preparedAt: Date.now(),
    provider: resolvedProvider as TranslationProvider,
    model: resolvedModel,
    segments: sortedSegments,
  };
}
