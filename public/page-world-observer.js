// Netflix Translator - Page World Observer
// Injected into the Netflix page context
// This script runs in the page world, NOT the extension isolated world
// It cannot use chrome.* APIs

(function () {
  'use strict';

  // Prevent double-injection
  if (window.__netflixTranslatorObserverInstalled) {
    return;
  }
  window.__netflixTranslatorObserverInstalled = true;

  console.log('[Netflix Translator] Page world observer injected');

  const ORIGIN = 'netflix-translator';

  /**
   * Notify the content script (isolated world) that the URL changed
   */
  function notifyUrlChange(url: string): void {
    window.dispatchEvent(
      new CustomEvent('nt-url-changed', {
        detail: { url, timestamp: Date.now() },
      })
    );
  }

  // Intercept history.pushState
  const originalPushState = history.pushState;
  history.pushState = function (
    data: unknown,
    unused: string,
    url?: string | URL | null
  ): void {
    originalPushState.apply(this, [data, unused, url]);
    if (url) {
      notifyUrlChange(window.location.href);
    }
  };

  // Intercept history.replaceState
  const originalReplaceState = history.replaceState;
  history.replaceState = function (
    data: unknown,
    unused: string,
    url?: string | URL | null
  ): void {
    originalReplaceState.apply(this, [data, unused, url]);
    if (url) {
      notifyUrlChange(window.location.href);
    }
  };

  // Listen for popstate (back/forward buttons)
  window.addEventListener('popstate', () => {
    notifyUrlChange(window.location.href);
  });

  // Notify initial URL
  notifyUrlChange(window.location.href);
})();
