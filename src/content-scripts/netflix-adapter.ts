import type { VideoIdentity } from '../shared/types';
import { extractVideoId } from '../shared/url-utils';

/**
 * Netflix-specific page adapter.
 * Responsible for SPA navigation detection, video ID extraction,
 * and reporting video state changes to the extension service worker.
 */
export class NetflixAdapter {
  private currentVideoId: string | null = null;
  private observerInjected = false;
  private onVideoChange?: (video: VideoIdentity | null) => void;

  constructor(options?: { onVideoChange?: (video: VideoIdentity | null) => void }) {
    this.onVideoChange = options?.onVideoChange;
  }

  /**
   * Start the adapter: inject page-world observer and begin listening
   */
  start(): void {
    this.injectPageWorldObserver();
    this.listenForUrlChanges();
    this.checkCurrentUrl(); // Check initial URL
  }

  /**
   * Inject the page-world observer script into the Netflix page context
   */
  private injectPageWorldObserver(): void {
    if (this.observerInjected) return;
    this.observerInjected = true;

    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('page-world-observer.js');
    script.onload = () => {
      script.remove(); // Clean up after injection
    };
    (document.head || document.documentElement).appendChild(script);
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
   * Handle URL changes and detect video transitions
   */
  private handleUrlChange(url: string): void {
    const videoId = extractVideoId(url);

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
