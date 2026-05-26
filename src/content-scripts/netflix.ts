// Netflix Translator - Content Script for Netflix
// Injected into Netflix pages to detect video, observe playback, and render subtitles

import { NetflixAdapter } from './netflix-adapter';
import { SubtitleRenderer } from './subtitle-renderer';
import type { VideoIdentity } from '../shared/types';

console.log('[Netflix Translator] Content script loaded on Netflix');

let adapter: NetflixAdapter;
let renderer: SubtitleRenderer;

function init(): void {
  console.log('[Netflix Translator] Initializing Netflix adapter');

  renderer = new SubtitleRenderer();

  adapter = new NetflixAdapter({
    onVideoChange: (video: VideoIdentity | null) => {
      if (video) {
        console.log(`[Netflix Translator] Now watching video: ${video.videoId}`);
      } else {
        console.log('[Netflix Translator] No longer on a watch page');
        // Disable rendering when leaving watch page
        renderer.disable();
      }
    },
    onSubtitleCandidate: (candidate) => {
      console.log(`[Netflix Translator] Subtitle discovered! Size: ${candidate.payload.length} chars`);
      console.log(`[Netflix Translator] Subtitle URL: ${candidate.url}`);
      // The candidate is already forwarded to service worker by the adapter
    },
  });

  adapter.start();

  // Listen for messages from popup/service worker
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'TOGGLE_TRANSLATION') {
      handleToggleTranslation(message.enabled, message.videoId, message.targetLanguage)
        .then(() => sendResponse({ status: 'ok' }))
        .catch((err) => sendResponse({ status: 'error', message: err.message }));
      return true; // Async
    }

    if (message.type === 'GET_RENDERING_STATUS') {
      sendResponse({
        status: 'ok',
        enabled: renderer.isEnabled(),
      });
      return true;
    }

    sendResponse({ status: 'unknown_type' });
    return false;
  });
}

async function handleToggleTranslation(
  enabled: boolean,
  videoId: string,
  targetLanguage: string
): Promise<void> {
  if (!enabled) {
    renderer.disable();
    console.log('[Netflix Translator] Translation rendering disabled');
    return;
  }

  // Load ready translations for this video
  const segments = await loadReadySegments(videoId, targetLanguage);
  if (segments.length === 0) {
    console.warn('[Netflix Translator] No ready translations to render');
    return;
  }

  renderer.enable(segments);
  console.log(`[Netflix Translator] Translation rendering enabled with ${segments.length} segments`);
}

async function loadReadySegments(
  videoId: string,
  targetLanguage: string
): Promise<Array<{ id: string; startMs: number; endMs: number; translatedText: string }>> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'GET_SEGMENTS', videoId, targetLanguage },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response || response.status === 'error') {
          reject(new Error(response?.message || 'Failed to load segments'));
          return;
        }
        resolve(response.segments || []);
      }
    );
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
