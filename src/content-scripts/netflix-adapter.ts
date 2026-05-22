import type { VideoIdentity } from '../shared/types';
import { extractVideoId } from '../shared/url-utils';
import {
  isValidSubtitlePayload,
  createSubtitleResource,
  refetchSubtitle,
} from '../shared/subtitle-acquisition';

/**
 * Raw subtitle candidate from the page-world observer
 */
export interface SubtitleCandidate {
  url: string;
  contentType: string;
  payload: string;
  method: string;
  source: 'fetch' | 'xhr';
  language?: string;
  timestamp: number;
}

/**
 * Netflix-specific page adapter.
 * Responsible for SPA navigation detection, video ID extraction,
 * subtitle discovery, and reporting to the extension service worker.
 */
export class NetflixAdapter {
  private currentVideoId: string | null = null;
  private observerInjected = false;
  private onVideoChange?: (video: VideoIdentity | null) => void;
  private onSubtitleCandidate?: (candidate: SubtitleCandidate) => void;

  constructor(options?: {
    onVideoChange?: (video: VideoIdentity | null) => void;
    onSubtitleCandidate?: (candidate: SubtitleCandidate) => void;
  }) {
    this.onVideoChange = options?.onVideoChange;
    this.onSubtitleCandidate = options?.onSubtitleCandidate;
  }

  /**
   * Start the adapter: inject page-world observer and begin listening
   */
  start(): void {
    console.log('[Netflix Translator] Adapter start() called');
    this.injectPageWorldObserver();
    this.listenForUrlChanges();
    this.listenForSubtitleCandidates();
    console.log('[Netflix Translator] Checking current URL:', window.location.href);
    this.checkCurrentUrl(); // Check initial URL
  }

  /**
   * Inject the page-world observer script into the Netflix page context
   */
  private injectPageWorldObserver(): void {
    if (this.observerInjected) return;
    this.observerInjected = true;

    try {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('page-world-observer.js');
      script.onload = () => {
        script.remove(); // Clean up after injection
      };
      script.onerror = (err) => {
        console.error('[Netflix Translator] Failed to inject page-world observer:', err);
      };
      (document.head || document.documentElement).appendChild(script);
      console.log('[Netflix Translator] Page-world observer injected');
    } catch (err) {
      console.error('[Netflix Translator] Error injecting observer:', err);
    }
  }

  /**
   * Listen for URL change events from the page-world observer
   */
  private listenForUrlChanges(): void {
    window.addEventListener('nt-url-changed', ((event: Event) => {
      const customEvent = event as CustomEvent<{ url: string; timestamp: number }>;
      this.handleUrlChange(customEvent.detail.url);
    }) as EventListener);
  }

  /**
   * Listen for subtitle candidate events from the page-world observer
   */
  private listenForSubtitleCandidates(): void {
    window.addEventListener('nt-subtitle-candidate', ((event: Event) => {
      const customEvent = event as CustomEvent<SubtitleCandidate>;
      const candidate = customEvent.detail;

      console.log('[Netflix Translator] Subtitle candidate discovered:', {
        url: candidate.url,
        contentType: candidate.contentType,
        language: candidate.language,
        source: candidate.source,
        payloadSize: candidate.payload.length,
      });

      // Validate payload (Task 3.5)
      if (!isValidSubtitlePayload(candidate.payload)) {
        console.log('[Netflix Translator] Invalid subtitle payload, ignoring');
        return;
      }

      // Notify callback
      this.onSubtitleCandidate?.(candidate);

      // Process candidate: try re-fetch first (Task 3.3), fallback to cloned payload (Task 3.4)
      this.processSubtitleCandidate(candidate);
    }) as EventListener);
  }

  /**
   * Process a subtitle candidate: validate, try re-fetch, store
   */
  private async processSubtitleCandidate(candidate: SubtitleCandidate): Promise<void> {
    let payload = candidate.payload;
    let acquisitionMethod: 'refetch' | 'page-world-clone' = 'page-world-clone';

    // Try primary acquisition: re-fetch from extension context (Task 3.3)
    try {
      const refetched = await refetchSubtitle(candidate.url);
      if (refetched && isValidSubtitlePayload(refetched)) {
        console.log('[Netflix Translator] Re-fetch succeeded');
        payload = refetched;
        acquisitionMethod = 'refetch';
      } else {
        console.log('[Netflix Translator] Re-fetch failed or invalid, using cloned payload');
      }
    } catch (err) {
      console.log('[Netflix Translator] Re-fetch error, using cloned payload:', err);
    }

    // Create subtitle resource (Task 3.2)
    const resource = await createSubtitleResource(
      candidate.url,
      candidate.contentType,
      payload,
      this.currentVideoId,
      acquisitionMethod
    );

    // Override language if detected from URL
    if (candidate.language) {
      resource.sourceLanguage = candidate.language;
    }

    console.log('[Netflix Translator] Subtitle resource created:', {
      id: resource.id,
      format: resource.format,
      hash: resource.contentHash?.substring(0, 16) + '...',
      method: resource.acquisitionMethod,
    });

    // Forward to service worker
    chrome.runtime
      .sendMessage({
        type: 'SUBTITLE_CANDIDATE',
        resource,
      })
      .catch((err) => {
        console.error('[Netflix Translator] Failed to forward subtitle resource:', err);
      });
  }

  /**
   * Handle URL changes and detect video transitions
   */
  private handleUrlChange(url: string): void {
    console.log('[Netflix Translator] handleUrlChange called with:', url);
    const videoId = extractVideoId(url);
    console.log('[Netflix Translator] extractVideoId result:', videoId);

    if (videoId && videoId !== this.currentVideoId) {
      // Entered a new watch page or changed videos
      this.currentVideoId = videoId;
      const videoIdentity: VideoIdentity = {
        videoId,
        url,
        detectedAt: Date.now(),
      };
      this.reportVideoDetected(videoIdentity);
    } else if (!videoId && this.currentVideoId) {
      // Left a watch page
      this.currentVideoId = null;
      this.reportVideoLeft();
    }
  }

  /**
   * Check the current URL on initial load
   */
  private checkCurrentUrl(): void {
    this.handleUrlChange(window.location.href);
  }

  /**
   * Report video detected to service worker and callback
   */
  private reportVideoDetected(video: VideoIdentity): void {
    console.log('[Netflix Translator] Video detected:', video.videoId);

    // Notify callback (e.g., content script)
    this.onVideoChange?.(video);

    // Send message to service worker
    chrome.runtime
      .sendMessage({
        type: 'VIDEO_DETECTED',
        videoId: video.videoId,
        url: video.url,
      })
      .catch((err) => {
        console.error('[Netflix Translator] Failed to report video detection:', err);
      });
  }

  /**
   * Report that user left a watch page
   */
  private reportVideoLeft(): void {
    console.log('[Netflix Translator] Left watch page');

    this.onVideoChange?.(null);

    chrome.runtime
      .sendMessage({
        type: 'VIDEO_CHANGED',
        videoId: null,
        url: window.location.href,
      })
      .catch((err) => {
        console.error('[Netflix Translator] Failed to report video left:', err);
      });
  }

  /**
   * Get the currently detected video ID
   */
  getCurrentVideoId(): string | null {
    return this.currentVideoId;
  }

  /**
   * Check if currently on a watch page
   */
  isOnWatchPage(): boolean {
    return this.currentVideoId !== null;
  }
}
