// Netflix Translator - Content Script for Netflix
// Injected into Netflix pages to detect video, observe playback, and render subtitles

console.log('[Netflix Translator] Content script loaded on Netflix');

// TODO: Implement video detection, SPA navigation observation, subtitle rendering

function init(): void {
  console.log('[Netflix Translator] Initializing Netflix adapter');
  
  // Placeholder: report page load to service worker
  chrome.runtime.sendMessage({
    type: 'PAGE_LOADED',
    url: window.location.href,
    timestamp: Date.now(),
  }).catch(err => {
    console.error('[Netflix Translator] Failed to send page load message:', err);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
