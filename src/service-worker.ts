import {
  getEntriesForVideo,
  saveTranslatedArtifact,
  updatePreparationStatus,
} from './shared/subtitle-library';
import { parseTtml, generateTranslationInput } from './shared/subtitle-parser';
import { prepareTranslation } from './shared/translator-agent';
import type { SubtitleLibraryEntry } from './shared/types';
import type { ProviderConfig } from './shared/translator-agent';

async function getProviderConfig(): Promise<ProviderConfig | null> {
  const result = await chrome.storage.local.get(['apiKey', 'model', 'customEndpoint']);
  if (!result.apiKey) return null;
  return {
    apiKey: result.apiKey,
    model: result.model || undefined,
    endpoint: result.customEndpoint || undefined,
  };
}

async function translateEntry(
  entry: SubtitleLibraryEntry,
  config: ProviderConfig
): Promise<void> {
  if (!entry.sourcePayload) {
    throw new Error('No source payload available for translation');
  }

  // Parse the subtitle
  const segments = parseTtml(entry.sourcePayload);

  // Generate cleaned translation input
  const input = generateTranslationInput(segments, entry.targetLanguage);

  // Call translation API
  const artifact = await prepareTranslation(
    input,
    config,
    entry.videoId,
    entry.sourceLanguage,
    entry.sourceSubtitleHash,
    'deepseek'
  );

  // Save artifact to library
  await saveTranslatedArtifact(
    entry.videoId,
    entry.sourceLanguage,
    entry.targetLanguage,
    entry.sourceSubtitleHash,
    artifact
  );
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
    sendResponse({ status: 'acknowledged' });
    return true;
  }

  if (message.type === 'VIDEO_DETECTED') {
    console.log('[Service Worker] Video detected:', message.videoId);
    sendResponse({ status: 'acknowledged' });
    return true;
  }

  if (message.type === 'GET_STATUS') {
    handleGetStatus(message.videoId)
      .then((status) => sendResponse(status))
      .catch((err) => sendResponse({ status: 'error', message: err.message }));
    return true;
  }

  sendResponse({ status: 'unknown_type' });
  return false;
});

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

  const entries = await getEntriesForVideo(videoId);

  let readyEntries = entries.filter(
    (e) => e.status === 'source-ready' && e.targetLanguage === targetLanguage
  );

  // Fallback: if no entries match the requested target language,
  // use any source-ready entry for this video
  if (readyEntries.length === 0) {
    readyEntries = entries.filter((e) => e.status === 'source-ready');
  }

  if (readyEntries.length === 0) {
    const availableTargets = entries
      .filter((e) => e.status === 'source-ready')
      .map((e) => e.targetLanguage)
      .join(', ');
    throw new Error(
      `No source-ready subtitles for video ${videoId}. ` +
      (availableTargets
        ? `Found languages: ${availableTargets}`
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

async function handleGetStatus(videoId: string) {
  const entries = await getEntriesForVideo(videoId);
  const ready = entries.filter((e) => e.status === 'translation-ready');
  return {
    status: ready.length > 0 ? 'translation-ready' : 'pending',
    videoId,
    entryCount: entries.length,
    readyCount: ready.length,
  };
}
