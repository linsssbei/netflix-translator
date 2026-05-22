import type { VideoIdentity } from '../shared/types';
import { extractVideoId } from '../shared/url-utils';
import {
  validateSubtitlePayload,
  createSubtitleResource,
} from '../shared/subtitle-acquisition';
import { parseTtml } from '../shared/subtitle-parser';
import {
  saveSourceSubtitle,
  detectStaleTranslations,
  getEntriesForVideo,
} from '../shared/subtitle-library';
import { DebugOverlay } from './debug-overlay';

function formatMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const millis = ms % 1000;
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`;
}

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
  private overlay: DebugOverlay;

  constructor(options?: {
    onVideoChange?: (video: VideoIdentity | null) => void;
    onSubtitleCandidate?: (candidate: SubtitleCandidate) => void;
  }) {
    this.onVideoChange = options?.onVideoChange;
    this.onSubtitleCandidate = options?.onSubtitleCandidate;
    this.overlay = new DebugOverlay();
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
      script.onerror = () => {
        this.overlay.addError('Failed to inject page-world observer');
      };
      (document.head || document.documentElement).appendChild(script);
      this.overlay.setStatus('Observer injected, monitoring network...');
    } catch (err) {
      this.overlay.addError('Error injecting observer: ' + (err as Error).message);
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
      const validation = validateSubtitlePayload(candidate.payload);
      if (!validation.valid) {
        this.overlay.addRejectedPayload(
          candidate.url,
          validation.reason,
          validation.preview
        );
        return;
      }

      // Notify callback
      this.onSubtitleCandidate?.(candidate);

      // Process candidate: use page-world cloned payload
      this.processSubtitleCandidate(candidate);
    }) as EventListener);
  }

  /**
   * Process a subtitle candidate: validate and store
   */
  private async processSubtitleCandidate(candidate: SubtitleCandidate): Promise<void> {
    const acquisitionMethod = 'page-world-clone';

    // Create subtitle resource (Task 3.2)
    const resource = await createSubtitleResource(
      candidate.url,
      candidate.contentType,
      candidate.payload,
      this.currentVideoId,
      acquisitionMethod
    );

    // Override language if detected from URL
    if (candidate.language) {
      resource.sourceLanguage = candidate.language;
    }

    // Update debug overlay
    this.overlay.addSubtitleCandidate(
      candidate.url,
      resource.format,
      candidate.payload.length
    );
    this.overlay.setStatus(
      `Subtitle acquired via ${acquisitionMethod} (${resource.format})`
    );

    // Parse the subtitle payload (Task 4.1-4.2)
    if (resource.format === 'ttml' || resource.format === 'dfxp') {
      try {
        const segments = parseTtml(candidate.payload);
        const firstSegments = segments.slice(0, 3).map((s) => ({
          id: s.id,
          start: formatMs(s.startMs),
          end: formatMs(s.endMs),
          text: s.sourceText.length > 60 ? s.sourceText.substring(0, 57) + '...' : s.sourceText,
        }));
        const totalDuration = formatMs(
          segments.length > 0 ? segments[segments.length - 1].endMs : 0
        );
        this.overlay.setParsedInfo({
          segmentCount: segments.length,
          totalDuration,
          firstSegments,
        });
        console.log(`[Netflix Translator] Parsed ${segments.length} segments, total duration: ${totalDuration}`);
      } catch (parseErr) {
        console.warn('[Netflix Translator] Parse error:', parseErr);
        this.overlay.addError('TTML parse failed: ' + (parseErr as Error).message);
      }
    }

    // Save to subtitle library (Task 5.3)
    try {
      const targetLang = await this.getTargetLanguage();
      await saveSourceSubtitle(resource, targetLang);

      // Detect stale translations for this video (Task 5.6)
      if (resource.contentHash) {
        const stale = await detectStaleTranslations(
          resource.videoId,
          resource.sourceLanguage,
          targetLang,
          resource.contentHash
        );
        if (stale.length > 0) {
          this.overlay.addError(`${stale.length} stale translation(s) detected`);
        }
      }

      // Update overlay with library state
      const entries = await getEntriesForVideo(resource.videoId);
      const ready = entries.filter((e) => e.status === 'translation-ready').length;
      this.overlay.setLibraryStatus(
        `${entries.length} saved (${ready} ready, ${entries.length - ready} pending)`
      );

      this.overlay.setStatus(
        `Subtitle acquired & saved (${resource.format}, ${targetLang})`
      );
    } catch (saveErr) {
      console.warn('[Netflix Translator] Library save error:', saveErr);
    }

    // Forward to service worker
    chrome.runtime
      .sendMessage({
        type: 'SUBTITLE_CANDIDATE',
        resource,
      })
      .catch((err) => {
        this.overlay.addError('Failed to forward resource: ' + (err as Error).message);
      });
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
    this.overlay.updateVideoId(video.videoId);
    this.overlay.setStatus('Video detected, monitoring for subtitles...');

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
        this.overlay.addError('Failed to report video: ' + (err as Error).message);
      });
  }

  /**
   * Report that user left a watch page
   */
  private reportVideoLeft(): void {
    this.overlay.updateVideoId(null);
    this.overlay.setStatus('Left watch page');

    this.onVideoChange?.(null);

    chrome.runtime
      .sendMessage({
        type: 'VIDEO_CHANGED',
        videoId: null,
        url: window.location.href,
      })
      .catch((err) => {
        this.overlay.addError('Failed to report left: ' + (err as Error).message);
      });
  }

  /**
   * Get the currently selected target language from extension settings
   */
  private async getTargetLanguage(): Promise<string> {
    try {
      const result = await chrome.storage.local.get('targetLanguage');
      return (result.targetLanguage as string) || 'zh-CN';
    } catch {
      return 'zh-CN';
    }
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
