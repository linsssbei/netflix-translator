// Netflix Translator - Page World Network Observer
// Runs in the Netflix page context (not the extension isolated world)
// Intercepts fetch() and XMLHttpRequest to discover subtitle resources
// Cannot use chrome.* APIs

(function () {
  'use strict';

  // Prevent double-injection
  if (window.__ntObserverInstalled) {
    return;
  }
  window.__ntObserverInstalled = true;

  const ORIGIN = 'netflix-translator';

  // Subtitle-related URL patterns to watch for
  const SUBTITLE_URL_PATTERNS = [
    /subtitle/i,
    /caption/i,
    /timed[-_]?text/i,
    /sub[-_]?track/i,
    /\bsub\b.*\btext\b/i,
    /\bcaption\b.*\btrack\b/i,
  ];

  // Subtitle content types
  const SUBTITLE_CONTENT_TYPES = [
    'text/vtt',
    'application/ttml',
    'application/xml',
    'text/xml',
    'application/json',
    'text/plain',
  ];

  // File extension hints
  const SUBTITLE_EXTENSIONS = ['.vtt', '.ttml', '.srt', '.xml', '.json', '.dfxp'];

  /**
   * Check if a URL looks like a subtitle request
   */
  function looksLikeSubtitleUrl(url: string): boolean {
    // Check URL patterns
    for (const pattern of SUBTITLE_URL_PATTERNS) {
      if (pattern.test(url)) {
        return true;
      }
    }
    // Check file extensions
    for (const ext of SUBTITLE_EXTENSIONS) {
      if (url.toLowerCase().includes(ext)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if content type suggests subtitle data
   */
  function looksLikeSubtitleContentType(contentType: string): boolean {
    if (!contentType) return false;
    const ct = contentType.toLowerCase();
    return SUBTITLE_CONTENT_TYPES.some((st) => ct.includes(st));
  }

  /**
   * Extract language code from URL if present
   */
  function extractLanguage(url: string): string | undefined {
    // Common patterns: lang=en, language=zh, l=en, tlang=ja, etc.
    const patterns = [
      /[?&]lang(?:uage)?=([^&]+)/i,
      /[?&]l(?:ang)?=([^&]+)/i,
      /[?&]tlang=([^&]+)/i,
      /[?&]oc=([^&]+)/i, // Netflix often uses "oc" for original content language
      /[?&]sub(?:title)?_lang(?:uage)?=([^&]+)/i,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return match[1];
      }
    }
    return undefined;
  }

  /**
   * Notify the content script (isolated world) about a discovered subtitle
   */
  function notifySubtitleCandidate(
    url: string,
    contentType: string,
    payload: string,
    method: string,
    source: 'fetch' | 'xhr'
  ): void {
    const event = new CustomEvent('nt-subtitle-candidate', {
      detail: {
        url,
        contentType,
        payload,
        method,
        source,
        language: extractLanguage(url),
        timestamp: Date.now(),
      },
    });
    window.dispatchEvent(event);
  }

  /**
   * Notify content script about URL changes (SPA navigation)
   */
  function notifyUrlChange(): void {
    const event = new CustomEvent('nt-url-changed', {
      detail: {
        url: window.location.href,
        timestamp: Date.now(),
      },
    });
    window.dispatchEvent(event);
  }

  // ==================== FETCH INTERCEPTION ====================

  const originalFetch = window.fetch;

  window.fetch = async function (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = request.url;
    const method = request.method || 'GET';

    // Make the original request
    const response = await originalFetch.call(window, request);

    // Check if this looks like a subtitle request
    const contentType = response.headers.get('content-type') || '';
    const isSubtitleUrl = looksLikeSubtitleUrl(url);
    const isSubtitleContent = looksLikeSubtitleContentType(contentType);

    if (isSubtitleUrl || isSubtitleContent) {
      try {
        // Clone the response to read the body without consuming it
        const clonedResponse = response.clone();
        const text = await clonedResponse.text();

        // Only report if the payload looks like subtitle data (not too large, contains text)
        if (text && text.length > 0 && text.length < 5 * 1024 * 1024) {
          // Max 5MB
          notifySubtitleCandidate(url, contentType, text, method, 'fetch');
        }
      } catch (err) {
        // Silently fail - we don't want to break Netflix
        console.debug('[NT Observer] Failed to process fetch response:', err);
      }
    }

    return response;
  };

  // ==================== XMLHttpRequest INTERCEPTION ====================

  const OriginalXHR = window.XMLHttpRequest;

  window.XMLHttpRequest = function () {
    const xhr = new OriginalXHR();
    const realOpen = xhr.open.bind(xhr);
    const realSend = xhr.send.bind(xhr);

    let requestUrl = '';
    let requestMethod = 'GET';

    // Override open to capture URL and method
    xhr.open = function (
      method: string,
      url: string | URL,
      async?: boolean,
      username?: string | null,
      password?: string | null
    ): void {
      requestMethod = method;
      requestUrl = url.toString();
      return realOpen(method, url, async ?? true, username, password);
    };

    // Override send to intercept response
    xhr.send = function (body?: Document | XMLHttpRequestBodyInit | null): void {
      // Listen for load event to capture response
      const onLoad = (): void => {
        try {
          const contentType = xhr.getResponseHeader('content-type') || '';
          const isSubtitleUrl = looksLikeSubtitleUrl(requestUrl);
          const isSubtitleContent = looksLikeSubtitleContentType(contentType);

          if ((isSubtitleUrl || isSubtitleContent) && xhr.responseText) {
            const text = xhr.responseText;
            if (text.length > 0 && text.length < 5 * 1024 * 1024) {
              notifySubtitleCandidate(
                requestUrl,
                contentType,
                text,
                requestMethod,
                'xhr'
              );
            }
          }
        } catch (err) {
          console.debug('[NT Observer] Failed to process XHR response:', err);
        }
      };

      xhr.addEventListener('load', onLoad);
      return realSend(body);
    };

    return xhr;
  } as typeof XMLHttpRequest;

  // Copy static properties
  Object.setPrototypeOf(window.XMLHttpRequest, OriginalXHR);
  Object.defineProperty(window.XMLHttpRequest, 'name', { value: 'XMLHttpRequest' });

  // ==================== HISTORY API INTERCEPTION ====================

  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function (
    data: unknown,
    unused: string,
    url?: string | URL | null
  ): void {
    originalPushState.apply(this, [data, unused, url]);
    if (url) {
      notifyUrlChange();
    }
  };

  history.replaceState = function (
    data: unknown,
    unused: string,
    url?: string | URL | null
  ): void {
    originalReplaceState.apply(this, [data, unused, url]);
    if (url) {
      notifyUrlChange();
    }
  };

  window.addEventListener('popstate', () => {
    notifyUrlChange();
  });

  // Notify initial URL
  notifyUrlChange();

  console.log('[Netflix Translator] Page-world network observer active');
})();
