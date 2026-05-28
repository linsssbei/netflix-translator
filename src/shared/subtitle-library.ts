import type {
  SubtitleLibraryEntry,
  SubtitleResource,
  TranslatedArtifact,
  TranslatedSegment,
  PreparationStatus,
  TranslationDebugInfo,
  TranslationProgressInfo,
  NetflixVideoContext,
} from './types';

const STORAGE_PREFIX = 'nt_lib_';

function confidenceRank(confidence: NetflixVideoContext['confidence']): number {
  if (confidence === 'high') return 3;
  if (confidence === 'medium') return 2;
  if (confidence === 'low') return 1;
  return 0;
}

function shouldApplyMetadata(
  existing: NetflixVideoContext | undefined,
  incoming: NetflixVideoContext | undefined
): boolean {
  return confidenceRank(incoming?.confidence) >= confidenceRank(existing?.confidence);
}

function isPersistableMetadata(context: NetflixVideoContext | undefined): boolean {
  return confidenceRank(context?.confidence) >= 2 || !context?.confidence;
}

/**
 * Build a storage key from identifying fields
 * Format: videoId:sourceLanguage:targetLanguage:sourceSubtitleHash
 */
export function buildLibraryKey(
  videoId: string,
  sourceLanguage: string,
  targetLanguage: string,
  sourceSubtitleHash: string
): string {
  return `${videoId}:${sourceLanguage}:${targetLanguage}:${sourceSubtitleHash}`;
}

/**
 * Parse a library key back into its components
 */
export function parseLibraryKey(
  key: string
): {
  videoId: string;
  sourceLanguage: string;
  targetLanguage: string;
  sourceSubtitleHash: string;
} | null {
  const parts = key.split(':');
  if (parts.length !== 4) return null;
  return {
    videoId: parts[0],
    sourceLanguage: parts[1],
    targetLanguage: parts[2],
    sourceSubtitleHash: parts[3],
  };
}

/**
 * Save source subtitle metadata after acquisition.
 * Creates or updates a library entry with 'source-ready' status.
 */
export async function saveSourceSubtitle(
  resource: SubtitleResource,
  targetLanguage: string,
  payload?: string
): Promise<void> {
  if (!resource.contentHash) {
    throw new Error('Cannot save source subtitle: missing content hash');
  }

  const key = buildLibraryKey(
    resource.videoId,
    resource.sourceLanguage,
    targetLanguage,
    resource.contentHash
  );
  const storageKey = STORAGE_PREFIX + key;

  // Read existing entry to preserve translation data on re-acquisition
  const result = await chrome.storage.local.get(storageKey);
  const existing = result[storageKey] as SubtitleLibraryEntry | undefined;

  if (existing) {
    // Same hash → update source fields only, preserve translation data
    existing.subtitleResource = resource;
    existing.sourcePayload = payload;
    if (isPersistableMetadata(resource.netflixContext)) {
      if (resource.videoTitle) existing.videoTitle = resource.videoTitle;
      if (resource.netflixContext) existing.netflixContext = resource.netflixContext;
    }
    existing.updatedAt = Date.now();
    await chrome.storage.local.set({ [storageKey]: existing });
  } else {
    // New entry (first time seeing this hash)
    const entry: SubtitleLibraryEntry = {
      key,
      videoId: resource.videoId,
      sourceLanguage: resource.sourceLanguage,
      targetLanguage,
      sourceSubtitleHash: resource.contentHash,
      status: 'source-ready',
      updatedAt: Date.now(),
      videoTitle: isPersistableMetadata(resource.netflixContext) ? resource.videoTitle : undefined,
      netflixContext: isPersistableMetadata(resource.netflixContext) ? resource.netflixContext : undefined,
      subtitleResource: resource,
      sourcePayload: payload,
    };
    await chrome.storage.local.set({ [storageKey]: entry });
  }
}

/**
 * Update title/context metadata for all entries belonging to a video.
 * Used when Netflix renders title metadata after subtitle acquisition.
 */
export async function updateEntriesVideoMetadata(
  videoId: string,
  videoTitle?: string,
  netflixContext?: NetflixVideoContext
): Promise<void> {
  if (!videoTitle && !netflixContext) return;

  const all = await chrome.storage.local.get(null);
  const updates: Record<string, SubtitleLibraryEntry> = {};

  for (const [storageKey, value] of Object.entries(all)) {
    if (!storageKey.startsWith(STORAGE_PREFIX)) continue;

    const entry = value as SubtitleLibraryEntry;
    if (entry.videoId !== videoId) continue;
    if (!shouldApplyMetadata(entry.netflixContext, netflixContext)) continue;

    if (videoTitle) {
      entry.videoTitle = videoTitle;
      if (entry.subtitleResource) {
        entry.subtitleResource.videoTitle = videoTitle;
      }
    }
    if (netflixContext) {
      entry.netflixContext = netflixContext;
      if (entry.subtitleResource) {
        entry.subtitleResource.netflixContext = netflixContext;
      }
    }
    entry.updatedAt = Date.now();
    updates[storageKey] = entry;
  }

  if (Object.keys(updates).length > 0) {
    await chrome.storage.local.set(updates);
  }
}

/**
 * Save a validated translated subtitle artifact after preparation succeeds.
 * Finds the existing library entry and updates status to 'translation-ready'.
 */
export async function saveTranslatedArtifact(
  videoId: string,
  sourceLanguage: string,
  targetLanguage: string,
  sourceSubtitleHash: string,
  artifact: TranslatedArtifact
): Promise<void> {
  const key = buildLibraryKey(videoId, sourceLanguage, targetLanguage, sourceSubtitleHash);
  const storageKey = STORAGE_PREFIX + key;

  const result = await chrome.storage.local.get(storageKey);
  const existing = result[storageKey] as SubtitleLibraryEntry | undefined;

  if (!existing) {
    throw new Error(`No library entry found for key: ${key}`);
  }

  existing.status = 'translation-ready';
  existing.translatedArtifact = artifact;
  delete existing.partialSegments;
  delete existing.errorMessage;
  if (existing.translationProgress) {
    delete existing.translationProgress.latestError;
  }
  existing.updatedAt = Date.now();

  await chrome.storage.local.set({ [storageKey]: existing });
}

/**
 * Update a library entry with partial translation progress for diagnostics.
 * Preserves partial segments but does NOT mark as translation-ready.
 */
export async function updatePartialArtifact(
  videoId: string,
  sourceLanguage: string,
  targetLanguage: string,
  sourceSubtitleHash: string,
  partialSegments: TranslatedSegment[],
  progress: TranslationProgressInfo,
  errorMessage?: string
): Promise<void> {
  const key = buildLibraryKey(videoId, sourceLanguage, targetLanguage, sourceSubtitleHash);
  const storageKey = STORAGE_PREFIX + key;

  const result = await chrome.storage.local.get(storageKey);
  const existing = result[storageKey] as SubtitleLibraryEntry | undefined;

  if (!existing) {
    throw new Error(`No library entry found for key: ${key}`);
  }

  existing.translationProgress = progress;
  existing.partialSegments = partialSegments;
  existing.updatedAt = Date.now();
  if (errorMessage) {
    existing.errorMessage = errorMessage;
  }

  await chrome.storage.local.set({ [storageKey]: existing });
}

/**
 * Load ready translated subtitle artifacts for the active video and target language.
 * Returns all matching entries with 'translation-ready' status.
 */
export async function loadReadyTranslations(
  videoId: string,
  targetLanguage: string
): Promise<SubtitleLibraryEntry[]> {
  const all = await chrome.storage.local.get(null);
  const entries: SubtitleLibraryEntry[] = [];

  for (const [storageKey, value] of Object.entries(all)) {
    if (!storageKey.startsWith(STORAGE_PREFIX)) continue;

    const entry = value as SubtitleLibraryEntry;
    if (
      entry.videoId === videoId &&
      entry.targetLanguage === targetLanguage &&
      entry.status === 'translation-ready'
    ) {
      entries.push(entry);
    }
  }

  return entries;
}

/**
 * Detect stale translations: find entries matching videoId + targetLanguage
 * but whose source subtitle hash differs from the current hash.
 * Marks stale entries as 'stale-translation'.
 */
export async function detectStaleTranslations(
  videoId: string,
  sourceLanguage: string,
  targetLanguage: string,
  currentSourceHash: string
): Promise<SubtitleLibraryEntry[]> {
  const all = await chrome.storage.local.get(null);
  const stale: SubtitleLibraryEntry[] = [];
  const updates: Record<string, SubtitleLibraryEntry> = {};

  for (const [storageKey, value] of Object.entries(all)) {
    if (!storageKey.startsWith(STORAGE_PREFIX)) continue;

    const entry = value as SubtitleLibraryEntry;
    if (
      entry.videoId === videoId &&
      entry.sourceLanguage === sourceLanguage &&
      entry.targetLanguage === targetLanguage &&
      entry.sourceSubtitleHash !== currentSourceHash &&
      entry.status !== 'stale-translation'
    ) {
      entry.status = 'stale-translation';
      entry.updatedAt = Date.now();
      stale.push(entry);
      updates[storageKey] = entry;
    }
  }

  if (stale.length > 0) {
    await chrome.storage.local.set(updates);
  }

  return stale;
}

/**
 * Update preparation status for a library entry
 */
export async function updatePreparationStatus(
  videoId: string,
  sourceLanguage: string,
  targetLanguage: string,
  sourceSubtitleHash: string,
  status: PreparationStatus,
  errorMessage?: string
): Promise<void> {
  const key = buildLibraryKey(videoId, sourceLanguage, targetLanguage, sourceSubtitleHash);
  const storageKey = STORAGE_PREFIX + key;

  const result = await chrome.storage.local.get(storageKey);
  const existing = result[storageKey] as SubtitleLibraryEntry | undefined;

  if (!existing) {
    throw new Error(`No library entry found for key: ${key}`);
  }

  existing.status = status;
  existing.updatedAt = Date.now();
  if (status === 'preparing') {
    existing.preparingSince = Date.now();
    delete existing.errorMessage;
    if (existing.translationProgress) {
      delete existing.translationProgress.latestError;
    }
  } else {
    delete existing.preparingSince;
  }
  if (status === 'translation-ready') {
    delete existing.errorMessage;
    if (existing.translationProgress) {
      delete existing.translationProgress.latestError;
    }
  }
  if (errorMessage) {
    existing.errorMessage = errorMessage;
  }

  await chrome.storage.local.set({ [storageKey]: existing });
}

/**
 * Save the latest translation provider debug summary for a library entry.
 */
export async function saveTranslationDebugInfo(
  videoId: string,
  sourceLanguage: string,
  targetLanguage: string,
  sourceSubtitleHash: string,
  debug: TranslationDebugInfo
): Promise<void> {
  const key = buildLibraryKey(videoId, sourceLanguage, targetLanguage, sourceSubtitleHash);
  const storageKey = STORAGE_PREFIX + key;

  const result = await chrome.storage.local.get(storageKey);
  const existing = result[storageKey] as SubtitleLibraryEntry | undefined;

  if (!existing) {
    throw new Error(`No library entry found for key: ${key}`);
  }

  existing.translationDebug = debug;
  existing.updatedAt = Date.now();
  await chrome.storage.local.set({ [storageKey]: existing });
}

/**
 * Get a specific library entry by key components
 */
export async function getLibraryEntry(
  videoId: string,
  sourceLanguage: string,
  targetLanguage: string,
  sourceSubtitleHash: string
): Promise<SubtitleLibraryEntry | null> {
  const key = buildLibraryKey(videoId, sourceLanguage, targetLanguage, sourceSubtitleHash);
  const storageKey = STORAGE_PREFIX + key;

  const result = await chrome.storage.local.get(storageKey);
  return (result[storageKey] as SubtitleLibraryEntry) || null;
}

/**
 * Get all library entries for a video (any language, any status)
 */
export async function getEntriesForVideo(videoId: string): Promise<SubtitleLibraryEntry[]> {
  const all = await chrome.storage.local.get(null);
  const entries: SubtitleLibraryEntry[] = [];

  for (const [storageKey, value] of Object.entries(all)) {
    if (!storageKey.startsWith(STORAGE_PREFIX)) continue;
    const entry = value as SubtitleLibraryEntry;
    if (entry.videoId === videoId) {
      entries.push(entry);
    }
  }

  return entries;
}

/**
 * Remove all library entries for a video (cleanup)
 */
export async function removeEntriesForVideo(videoId: string): Promise<void> {
  const all = await chrome.storage.local.get(null);
  const keysToRemove: string[] = [];

  for (const [storageKey, value] of Object.entries(all)) {
    if (!storageKey.startsWith(STORAGE_PREFIX)) continue;
    const entry = value as SubtitleLibraryEntry;
    if (entry.videoId === videoId) {
      keysToRemove.push(storageKey);
    }
  }

  if (keysToRemove.length > 0) {
    await chrome.storage.local.remove(keysToRemove);
  }
}

/**
 * List all local subtitle library entries sorted by updated time (newest first)
 */
export async function listAllEntries(): Promise<SubtitleLibraryEntry[]> {
  const all = await chrome.storage.local.get(null);
  const entries: SubtitleLibraryEntry[] = [];

  for (const [storageKey, value] of Object.entries(all)) {
    if (!storageKey.startsWith(STORAGE_PREFIX)) continue;
    entries.push(value as SubtitleLibraryEntry);
  }

  entries.sort((a, b) => b.updatedAt - a.updatedAt);
  return entries;
}

/**
 * Delete one library entry
 */
export async function removeEntry(
  videoId: string,
  sourceLanguage: string,
  targetLanguage: string,
  sourceSubtitleHash: string
): Promise<boolean> {
  const key = buildLibraryKey(videoId, sourceLanguage, targetLanguage, sourceSubtitleHash);
  const storageKey = STORAGE_PREFIX + key;

  const result = await chrome.storage.local.get(storageKey);
  if (!result[storageKey]) return false;

  await chrome.storage.local.remove(storageKey);
  return true;
}
