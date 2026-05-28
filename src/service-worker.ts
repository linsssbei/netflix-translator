import {
  getEntriesForVideo,
  getLibraryEntry,
  loadReadyTranslations,
  saveSourceSubtitle,
  saveTranslatedArtifact,
  saveTranslationDebugInfo,
  updateEntriesVideoMetadata,
  updatePreparationStatus,
  updatePartialArtifact,
  detectStaleTranslations,
} from './shared/subtitle-library';
import { parseTtmlWithRegex, generateTranslationInput } from './shared/subtitle-parser';
import { prepareTranslation } from './shared/translator-agent';
import type {
  SubtitleLibraryEntry,
  DetailedStatusResponse,
  TranslatedSegment,
  AutoFillResult,
  TranslationProvider,
  SubtitleResource,
  NetflixVideoContext,
} from './shared/types';
import type { ProviderConfig } from './shared/translator-agent';
import { loadContextProfile, saveContextProfile } from './shared/context-profile';
import { performAutoFill } from './shared/auto-fill';

const STALE_PREPARING_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

const RETRYABLE_PREPARATION_STATUSES = new Set<SubtitleLibraryEntry['status']>([
  'source-ready',
  'preparing',
  'translation-failed',
]);

async function getProviderConfig(): Promise<ProviderConfig | null> {
  const result = await chrome.storage.local.get(['provider', 'apiKey', 'model', 'customEndpoint']);
  if (!result.apiKey) return null;
  return {
    apiKey: result.apiKey,
    provider: result.provider || undefined,
    model: result.model || undefined,
    endpoint: result.customEndpoint || undefined,
  };
}

export function resolveAutoFillProviderType(config: {
  provider?: TranslationProvider | string;
  endpoint?: string;
}): 'deepseek' | 'openai' {
  if (config.endpoint?.includes('deepseek')) return 'deepseek';
  if (config.endpoint?.includes('openai')) return 'openai';
  if (config.provider === 'deepseek') return 'deepseek';
  return 'openai';
}

async function translateEntry(
  entry: SubtitleLibraryEntry,
  config: ProviderConfig
): Promise<void> {
  if (!entry.sourcePayload) {
    throw new Error('No source payload available for translation');
  }

  // Load context profile for this entry
  const contextProfile = await loadContextProfile(
    entry.videoId,
    entry.sourceLanguage,
    entry.targetLanguage,
    entry.sourceSubtitleHash
  );

  // Parse the subtitle
  const segments = parseTtmlWithRegex(entry.sourcePayload);

  // Check for previously translated segments (from partials OR completed artifact)
  const existingTranslations = [
    ...(entry.partialSegments ?? []),
    ...(entry.translatedArtifact?.segments ?? []),
  ];
  const translatedIds = new Set(existingTranslations.map((s) => s.id));

  // Filter to only untranslated segments
  const untranslatedSegments = segments.filter((s) => !translatedIds.has(s.id));

  let finalSegments: TranslatedSegment[];

  if (untranslatedSegments.length === 0) {
    // All segments already translated from a previous run — skip API call
    console.log(
      `[Service Worker] All ${existingTranslations.length} segments already translated. Skipping API call.`
    );
    finalSegments = existingTranslations;
  } else {
    if (existingTranslations.length > 0) {
      console.log(
        `[Service Worker] Resuming translation: ${existingTranslations.length} already done, ${untranslatedSegments.length} remaining`
      );
    }

    // Generate cleaned translation input for remaining segments only
    const input = generateTranslationInput(untranslatedSegments, entry.targetLanguage);

    // Mutable accumulator for partial segments during this run
    let accumulated = [...existingTranslations];

    // Call translation API with incremental batch persistence
    const artifact = await prepareTranslation(
      input,
      config,
      entry.videoId,
      entry.sourceLanguage,
      entry.sourceSubtitleHash,
      'deepseek',
      async (debug) => {
        console.log('[Service Worker] Translation debug:', {
          strategy: debug.strategy,
          requestPhase: debug.requestPhase,
          model: debug.model,
          finishReason: debug.finishReason,
          requestId: debug.requestId,
          usage: debug.usage,
          responseContentLength: debug.responseContentLength,
          validatedCount: debug.validatedCount,
          errorMessage: debug.errorMessage,
          responsePreview: debug.responsePreview,
        });
        await saveTranslationDebugInfo(
          entry.videoId,
          entry.sourceLanguage,
          entry.targetLanguage,
          entry.sourceSubtitleHash,
          debug
        );
      },
      async (validatedSegments, progress) => {
        console.log('[Service Worker] Batch progress:', progress);
        // Grow accumulator with each batch from THIS run
        accumulated = mergeSegments(accumulated, validatedSegments);
        await updatePartialArtifact(
          entry.videoId,
          entry.sourceLanguage,
          entry.targetLanguage,
          entry.sourceSubtitleHash,
          accumulated,
          progress
        );
      },
      {
        contextProfile: contextProfile || undefined,
      }
    );

    // Merge new results with existing translations
    finalSegments = mergeSegments(existingTranslations, artifact.segments);
  }

  // Build final artifact from merged segments
  const finalArtifact = {
    videoId: entry.videoId,
    sourceLanguage: entry.sourceLanguage,
    targetLanguage: entry.targetLanguage,
    sourceSubtitleHash: entry.sourceSubtitleHash,
    preparedAt: Date.now(),
    provider: 'deepseek' as const,
    segments: finalSegments,
  };

  // Save complete artifact to library (marks as translation-ready)
  await saveTranslatedArtifact(
    entry.videoId,
    entry.sourceLanguage,
    entry.targetLanguage,
    entry.sourceSubtitleHash,
    finalArtifact
  );
}

function mergeSegments(
  existing: TranslatedSegment[],
  newlyValidated: TranslatedSegment[]
): TranslatedSegment[] {
  const map = new Map(existing.map((s) => [s.id, s]));
  for (const s of newlyValidated) {
    map.set(s.id, s);
  }
  return Array.from(map.values()).sort((a, b) => a.startMs - b.startMs);
}

const PENDING_PREFIX = 'nt_pending_';
const VIDEO_CONTEXT_PREFIX = 'nt_video_context_';

async function storePendingSubtitle(
  videoId: string,
  resource: SubtitleResource,
  payload: string
): Promise<void> {
  const key = PENDING_PREFIX + videoId;
  await chrome.storage.local.set({
    [key]: {
      resource,
      payload,
      detectedAt: Date.now(),
    },
  });
}

async function getPendingSubtitle(videoId: string): Promise<{
  resource: SubtitleResource;
  payload: string;
  detectedAt: number;
} | null> {
  const key = PENDING_PREFIX + videoId;
  const result = await chrome.storage.local.get(key);
  return result[key] || null;
}

async function storeVideoContext(
  videoId: string,
  videoTitle?: string,
  netflixContext?: NetflixVideoContext
): Promise<void> {
  if (!videoTitle && !netflixContext) return;
  const confidence = netflixContext?.confidence;
  if (confidence === 'low') {
    console.log('[Service Worker] Ignoring low-confidence video title metadata:', {
      videoId,
      videoTitle,
      source: netflixContext?.source,
    });
    return;
  }
  await chrome.storage.local.set({
    [VIDEO_CONTEXT_PREFIX + videoId]: {
      videoTitle,
      netflixContext,
      updatedAt: Date.now(),
    },
  });
  await updateEntriesVideoMetadata(videoId, videoTitle, netflixContext);
}

async function getVideoContext(videoId: string): Promise<{
  videoTitle?: string;
  netflixContext?: NetflixVideoContext;
} | null> {
  const result = await chrome.storage.local.get(VIDEO_CONTEXT_PREFIX + videoId);
  return result[VIDEO_CONTEXT_PREFIX + videoId] || null;
}

async function clearPendingSubtitle(videoId: string): Promise<void> {
  const key = PENDING_PREFIX + videoId;
  await chrome.storage.local.remove(key);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'PREPARE_SUBTITLES') {
    handlePrepareSubtitles(message.videoId, message.targetLanguage)
      .then(() => sendResponse({ status: 'ok' }))
      .catch((err) => sendResponse({ status: 'error', message: err.message }));
    return true; // Keep channel open for async
  }

  if (message.type === 'SUBTITLE_CANDIDATE') {
    console.log('[Service Worker] Subtitle candidate:', message.resource.format);
    // Store as pending instead of saving to library immediately
    storePendingSubtitle(message.resource.videoId, message.resource, message.payload || '')
      .then(() => sendResponse({ status: 'acknowledged' }))
      .catch(() => sendResponse({ status: 'error', message: 'Failed to store pending subtitle' }));
    return true;
  }

  if (message.type === 'VIDEO_DETECTED') {
    console.log('[Service Worker] Video detected:', {
      videoId: message.videoId,
      videoTitle: message.videoTitle,
      hasNetflixContext: Boolean(message.netflixContext),
    });
    storeVideoContext(message.videoId, message.videoTitle, message.netflixContext)
      .then(() => sendResponse({ status: 'acknowledged' }))
      .catch((err) => sendResponse({ status: 'error', message: err.message }));
    return true;
  }

  if (message.type === 'GET_STATUS') {
    handleGetStatus(message.videoId)
      .then((status) => sendResponse(status))
      .catch((err) => sendResponse({ status: 'error', message: err.message }));
    return true;
  }

  if (message.type === 'GET_DETECTION_STATUS') {
    handleGetDetectionStatus(message.videoId)
      .then((status) => sendResponse(status))
      .catch((err) => sendResponse({ status: 'error', message: err.message }));
    return true;
  }

  if (message.type === 'GET_SEGMENTS') {
    handleGetSegments(message.videoId, message.targetLanguage)
      .then((segments) => sendResponse(segments))
      .catch((err) => sendResponse({ status: 'error', message: err.message }));
    return true;
  }

  if (message.type === 'DELETE_SEGMENT') {
    handleDeleteSegment(message)
      .then(() => sendResponse({ status: 'ok' }))
      .catch((err) => sendResponse({ status: 'error', message: err.message }));
    return true;
  }

  if (message.type === 'RETRANSLATE_SEGMENT') {
    handleRetranslateSegment(message)
      .then(() => sendResponse({ status: 'ok' }))
      .catch((err) => sendResponse({ status: 'error', message: err.message }));
    return true;
  }

  if (message.type === 'GET_CONTEXT_PROFILE') {
    loadContextProfile(message.videoId, message.sourceLanguage, message.targetLanguage, message.sourceSubtitleHash)
      .then((profile) => sendResponse({ type: 'CONTEXT_PROFILE_RESPONSE', profile }))
      .catch((err) => sendResponse({ type: 'CONTEXT_PROFILE_RESPONSE', profile: null, error: err.message }));
    return true;
  }

  if (message.type === 'SAVE_CONTEXT_PROFILE') {
    saveContextProfile(message.profile)
      .then(() => sendResponse({ status: 'ok' }))
      .catch((err) => sendResponse({ status: 'error', message: err.message }));
    return true;
  }

  if (message.type === 'AUTOFILL_CONTEXT_PROFILE') {
    handleAutoFill(message.videoId, message.videoTitle, message.sourceLanguage, message.targetLanguage, message.sourceSubtitleHash)
      .then((result) => sendResponse({ result }))
      .catch((err) => sendResponse({ result: null, error: err.message }));
    return true;
  }

  if (message.type === 'TOGGLE_TRANSLATION') {
    (async () => {
      await chrome.storage.local.set({
        translationEnabled: message.enabled,
        currentVideoId: message.videoId,
        currentTargetLanguage: message.targetLanguage,
      });

      // Forward to the active Netflix tab's content script
      const tabs = await chrome.tabs.query({ url: '*://*.netflix.com/*' });
      for (const tab of tabs) {
        if (tab.id) {
          try {
            await chrome.tabs.sendMessage(tab.id, {
              type: 'TOGGLE_TRANSLATION',
              enabled: message.enabled,
              videoId: message.videoId,
              targetLanguage: message.targetLanguage,
            });
          } catch {
            // Tab may not have content script, ignore
          }
        }
      }

      sendResponse({ status: 'ok' });
    })().catch((err) => sendResponse({ status: 'error', message: err.message }));
    return true;
  }

  sendResponse({ status: 'unknown_type' });
  return false;
});

async function handleGetDetectionStatus(videoId: string) {
  const pending = await getPendingSubtitle(videoId);
  const entries = await getEntriesForVideo(videoId);

  if (!pending) {
    // No pending subtitle detected
    if (entries.length === 0) {
      return { status: 'no-subtitle', videoId };
    }
    // We have saved entries but no recent detection
    return { status: 'already-saved', videoId, savedHash: entries[0].sourceSubtitleHash };
  }

  // Check if there's a saved entry with the same hash
  const matchingEntry = entries.find(
    (e) => e.sourceSubtitleHash === pending.resource.contentHash
  );

  if (matchingEntry) {
    return {
      status: 'already-saved',
      videoId,
      savedHash: matchingEntry.sourceSubtitleHash,
      detectedHash: pending.resource.contentHash,
      sourceLanguage: pending.resource.sourceLanguage,
    };
  }

  // Check if there's a saved entry with a different hash
  const differentHashEntry = entries.find(
    (e) => e.sourceSubtitleHash !== pending.resource.contentHash
  );

  if (differentHashEntry) {
    return {
      status: 'new-hash-detected',
      videoId,
      savedHash: differentHashEntry.sourceSubtitleHash,
      detectedHash: pending.resource.contentHash,
      sourceLanguage: pending.resource.sourceLanguage,
    };
  }

  // No saved entry at all — fresh detection
  return {
    status: 'subtitle-detected',
    videoId,
    detectedHash: pending.resource.contentHash,
    sourceLanguage: pending.resource.sourceLanguage,
  };
}

async function handlePrepareSubtitles(
  videoId: string,
  targetLanguage: string
): Promise<void> {
  const config = await getProviderConfig();
  if (!config) {
    throw new Error(
      'No API key configured. Open extension options to set your API key.'
    );
  }

  // Step 1: If there's a pending subtitle for this video, save it to library now
  const pending = await getPendingSubtitle(videoId);
  if (pending) {
    const storedContext = await getVideoContext(videoId);
    if (storedContext?.videoTitle) {
      pending.resource.videoTitle = storedContext.videoTitle;
    }
    if (storedContext?.netflixContext) {
      pending.resource.netflixContext = storedContext.netflixContext;
    }
    await saveSourceSubtitle(pending.resource, targetLanguage, pending.payload);
    await clearPendingSubtitle(videoId);

    // Detect stale translations if hash changed
    if (pending.resource.contentHash) {
      await detectStaleTranslations(
        videoId,
        pending.resource.sourceLanguage,
        targetLanguage,
        pending.resource.contentHash
      );
    }
  }

  const entries = await getEntriesForVideo(videoId);
  const readyEntries = selectEntriesForPreparation(entries, targetLanguage);

  if (readyEntries.length === 0) {
    const availableTargets = entries
      .filter((e) => e.sourcePayload)
      .map((e) => `${e.targetLanguage}:${e.status}`)
      .join(', ');
    throw new Error(
      `No source-ready subtitles for video ${videoId}. ` +
      (availableTargets
        ? `Found entries: ${availableTargets}`
        : 'Make sure subtitles have been acquired first.')
    );
  }

  for (const entry of readyEntries) {
    // Update status to preparing
    await updatePreparationStatus(
      entry.videoId,
      entry.sourceLanguage,
      entry.targetLanguage,
      entry.sourceSubtitleHash,
      'preparing'
    );

    try {
      await translateEntry(entry, config);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[Service Worker] Translation failed:', msg);

      // Check if we have partial progress for diagnostics
      const partialSegments = err instanceof Error && 'partialSegments' in err
        ? (err as Error & { partialSegments: unknown[] }).partialSegments
        : undefined;

      if (partialSegments && partialSegments.length > 0) {
        console.log(
          `[Service Worker] Preserving ${partialSegments.length} partial segments for diagnostics`
        );
      }

      await updatePreparationStatus(
        entry.videoId,
        entry.sourceLanguage,
        entry.targetLanguage,
        entry.sourceSubtitleHash,
        'translation-failed',
        msg
      );
      throw err; // Re-throw to notify caller
    }
  }
}

export function selectEntriesForPreparation(
  entries: SubtitleLibraryEntry[],
  targetLanguage: string
): SubtitleLibraryEntry[] {
  const retryable = entries.filter(
    (e) => RETRYABLE_PREPARATION_STATUSES.has(e.status) && Boolean(e.sourcePayload)
  );

  const matchingTarget = retryable.filter((e) => e.targetLanguage === targetLanguage);
  const candidates = matchingTarget.length > 0 ? matchingTarget : retryable;

  // Sort by most recently discovered source subtitle (prefer latest)
  return candidates.sort((a, b) => {
    const aTime = a.subtitleResource?.discoveredAt ?? 0;
    const bTime = b.subtitleResource?.discoveredAt ?? 0;
    return bTime - aTime;
  });
}

async function handleGetStatus(videoId: string): Promise<DetailedStatusResponse> {
  const entries = await getEntriesForVideo(videoId);
  const ready = entries.filter((e) => e.status === 'translation-ready');
  const preparing = entries.filter((e) => e.status === 'preparing');
  const failed = entries.filter((e) => e.status === 'translation-failed');

  let status: SubtitleLibraryEntry['status'] =
    ready.length > 0 ? 'translation-ready' : entries.length > 0 ? entries[0]!.status : 'video-detected';
  const activeEntry =
    status === 'translation-ready'
      ? ready[0]
      : preparing[0] || failed[0] || entries[0];

  // Detect stale preparing entries
  let isRetryable = RETRYABLE_PREPARATION_STATUSES.has(status);
  if (status === 'preparing' && activeEntry?.preparingSince) {
    const elapsed = Date.now() - activeEntry.preparingSince;
    if (elapsed > STALE_PREPARING_THRESHOLD_MS) {
      status = 'translation-failed';
      isRetryable = true;
    }
  }

  return {
    status,
    videoId,
    entryCount: entries.length,
    readyCount: ready.length,
    isRetryable,
    progress: activeEntry?.translationProgress,
    errorMessage: activeEntry?.errorMessage,
    debugInfo: activeEntry?.translationDebug,
    preparingSince: activeEntry?.preparingSince,
    partialSegments: activeEntry?.partialSegments,
  };
}

async function handleGetSegments(videoId: string, targetLanguage: string) {
  const entries = await loadReadyTranslations(videoId, targetLanguage);
  if (entries.length === 0) {
    return { segments: [], count: 0 };
  }

  // Get the most recent ready entry
  const entry = entries.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0];
  const segments = entry.translatedArtifact?.segments ?? [];

  // Build a source text lookup from the stored source payload if available
  const sourceMap = new Map<string, string>();
  if (entry.sourcePayload) {
    try {
      const sourceSegments = parseTtmlWithRegex(entry.sourcePayload);
      for (const s of sourceSegments) {
        sourceMap.set(s.id, s.sourceText);
      }
    } catch {
      // Ignore parse errors, source text will just be empty
    }
  }

  return {
    segments: segments.map((s) => ({
      id: s.id,
      startMs: s.startMs,
      endMs: s.endMs,
      sourceText: sourceMap.get(s.id) ?? '',
      translatedText: s.translatedText,
    })),
    count: segments.length,
  };
}

async function handleDeleteSegment(message: {
  videoId: string;
  sourceLanguage: string;
  targetLanguage: string;
  sourceSubtitleHash: string;
  segmentId: string;
}) {
  const entry = await getLibraryEntry(
    message.videoId,
    message.sourceLanguage,
    message.targetLanguage,
    message.sourceSubtitleHash
  );
  if (!entry) {
    throw new Error('Entry not found');
  }

  // Remove from artifact if present
  if (entry.translatedArtifact?.segments) {
    entry.translatedArtifact.segments = entry.translatedArtifact.segments.filter(
      (s) => s.id !== message.segmentId
    );
    entry.translatedSegmentCount = entry.translatedArtifact.segments.length;
  }

  // Remove from partials if present
  if (entry.partialSegments) {
    entry.partialSegments = entry.partialSegments.filter(
      (s) => s.id !== message.segmentId
    );
  }

  // Update status: if we had a complete artifact and removed a segment,
  // it's no longer translation-ready
  if (entry.status === 'translation-ready') {
    const remainingCount = entry.translatedArtifact?.segments.length ?? 0;
    const sourceCount = entry.sourceSegmentCount ?? 0;
    if (remainingCount < sourceCount) {
      entry.status = 'preparing';
      entry.preparingSince = Date.now();
    }
  }

  entry.updatedAt = Date.now();

  const key = `${message.videoId}:${message.sourceLanguage}:${message.targetLanguage}:${message.sourceSubtitleHash}`;
  const storageKey = `nt_lib_${key}`;
  await chrome.storage.local.set({ [storageKey]: entry });
}

async function handleRetranslateSegment(message: {
  videoId: string;
  sourceLanguage: string;
  targetLanguage: string;
  sourceSubtitleHash: string;
  segmentId: string;
}) {
  // Step 1: Delete the segment translation (same as delete handler)
  await handleDeleteSegment(message);

  // Step 2: Trigger translation for the entry (service worker will deduplicate)
  const config = await getProviderConfig();
  if (!config) {
    throw new Error('No API key configured');
  }

  const entry = await getLibraryEntry(
    message.videoId,
    message.sourceLanguage,
    message.targetLanguage,
    message.sourceSubtitleHash
  );
  if (!entry) {
    throw new Error('Entry not found after deletion');
  }

  // Update status to preparing so the popup shows progress
  await updatePreparationStatus(
    entry.videoId,
    entry.sourceLanguage,
    entry.targetLanguage,
    entry.sourceSubtitleHash,
    'preparing'
  );

  // Start translation in background (fire-and-forget)
  translateEntry(entry, config).catch((err: Error) => {
    console.error('[Service Worker] Retranslation failed:', err.message);
  });
}

async function handleAutoFill(
  videoId: string,
  videoTitle: string | undefined,
  sourceLanguage: string,
  targetLanguage: string,
  sourceSubtitleHash: string
): Promise<AutoFillResult | null> {
  console.log('[Service Worker] Auto-fill context profile started:', {
    videoId,
    videoTitle,
    sourceLanguage,
    targetLanguage,
    sourceSubtitleHash,
  });

  const config = await getProviderConfig();
  if (!config) {
    console.warn('[Service Worker] Auto-fill skipped: no API key configured');
    throw new Error('No API key configured. Open extension options to set your API key.');
  }

  const providerType = resolveAutoFillProviderType(config);
  const entry = await getLibraryEntry(videoId, sourceLanguage, targetLanguage, sourceSubtitleHash);
  const storedContext = await getVideoContext(videoId);
  const resolvedTitle = videoTitle || entry?.videoTitle || entry?.subtitleResource?.videoTitle || storedContext?.videoTitle;
  const netflixContext =
    entry?.netflixContext ||
    entry?.subtitleResource?.netflixContext ||
    storedContext?.netflixContext;

  try {
    const result = await performAutoFill(
      videoId,
      resolvedTitle,
      sourceLanguage,
      targetLanguage,
      config.apiKey,
      providerType,
      config.endpoint,
      config.model,
      netflixContext
    );
    console.log('[Service Worker] Auto-fill context profile completed:', {
      videoId,
      provider: providerType,
      titleUsed: resolvedTitle,
      characterCount: result.characterNames.length,
      glossaryCount: result.glossary.length,
      sourceURLCount: result.sourceURLs.length,
    });
    return result;
  } catch (err) {
    console.error('[Service Worker] Auto-fill context profile failed:', err);
    throw err;
  }
}
