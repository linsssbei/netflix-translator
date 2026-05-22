// Netflix Translator - Content Script for Netflix
// Injected into Netflix pages to detect video, observe playback, and render subtitles

import { NetflixAdapter } from './netflix-adapter';
import type { VideoIdentity } from '../shared/types';

console.log('[Netflix Translator] Content script loaded on Netflix');

let adapter: NetflixAdapter;

function init(): void {
  console.log('[Netflix Translator] Initializing Netflix adapter');

  adapter = new NetflixAdapter({
    onVideoChange: (video: VideoIdentity | null) => {
      if (video) {
        console.log(`[Netflix Translator] Now watching video: ${video.videoId}`);
      } else {
        console.log('[Netflix Translator] No longer on a watch page');
      }
    },
    onSubtitleCandidate: (candidate) => {
      console.log(`[Netflix Translator] Subtitle discovered! Size: ${candidate.payload.length} chars`);
      console.log(`[Netflix Translator] Subtitle URL: ${candidate.url}`);
      // The candidate is already forwarded to service worker by the adapter
    },
  });

  adapter.start();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
