import type { NetflixMetadataConfidence, NetflixVideoContext, VideoIdentity } from '../shared/types';
import { extractVideoId } from '../shared/url-utils';
import {
  validateSubtitlePayload,
  createSubtitleResource,
} from '../shared/subtitle-acquisition';
import { parseTtml } from '../shared/subtitle-parser';

import { DebugOverlay } from './debug-overlay';

function formatMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const millis = ms % 1000;
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`;
}

function cleanText(text: string | null | undefined): string | undefined {
  const cleaned = text?.replace(/\s+/g, ' ').trim();
  return cleaned || undefined;
}

function readMetaContent(selector: string): string | undefined {
  return cleanText(document.querySelector<HTMLMetaElement>(selector)?.content);
}

function cleanNetflixTitle(title: string | undefined): string | undefined {
  const cleaned = cleanText(title)
    ?.replace(/\s*[-|]\s*Netflix\s*$/i, '')
    .replace(/\s*\|\s*Official Netflix Site\s*$/i, '')
    .trim();
  return cleaned && !/^(netflix|browse|home|search)$/i.test(cleaned) ? cleaned : undefined;
}

function normalizeTitleCandidate(candidate: string | undefined): string | undefined {
  const cleaned = cleanNetflixTitle(candidate)
    ?.replace(/^(watch|play|resume|continue watching)\s+/i, '')
    .replace(/\s+(on netflix|trailer|preview)$/i, '')
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .trim();

  if (!cleaned) return undefined;
  if (cleaned.length < 2 || cleaned.length > 120) return undefined;
  if (/^(play|pause|resume|back|close|browse|home|search|audio|subtitles|episodes|more info)$/i.test(cleaned)) return undefined;
  return cleaned;
}

function findInObject(value: unknown, keys: string[]): string | undefined {
  if (!value || typeof value !== 'object') return undefined;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findInObject(item, keys);
      if (found) return found;
    }
    return undefined;
  }

  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const direct = record[key];
    if (typeof direct === 'string') return cleanText(direct);
  }

  for (const nested of Object.values(record)) {
    const found = findInObject(nested, keys);
    if (found) return found;
  }

  return undefined;
}

function readJsonLdContext(): Partial<NetflixVideoContext> {
  const scripts = Array.from(document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]'));

  for (const script of scripts) {
    try {
      const parsed = JSON.parse(script.textContent || '');
      const title = normalizeTitleCandidate(findInObject(parsed, ['name', 'headline', 'title']));
      const synopsis = cleanText(findInObject(parsed, ['description', 'synopsis']));
      if (title || synopsis) {
        return { title, synopsis };
      }
    } catch {
      // Ignore malformed page metadata.
    }
  }

  return {};
}

function readScriptStateContext(): Partial<NetflixVideoContext> {
  const scripts = Array.from(document.querySelectorAll<HTMLScriptElement>('script'));
  const titlePatterns = [
    /"videoTitle"\s*:\s*"((?:\\.|[^"\\])+)"/,
    /"titleName"\s*:\s*"((?:\\.|[^"\\])+)"/,
    /"title"\s*:\s*"((?:\\.|[^"\\])+)"/,
  ];
  const synopsisPatterns = [
    /"synopsis"\s*:\s*"((?:\\.|[^"\\])+)"/,
    /"description"\s*:\s*"((?:\\.|[^"\\])+)"/,
  ];

  for (const script of scripts) {
    const text = script.textContent || '';
    if (!/videoTitle|titleName|synopsis|description/.test(text)) continue;

    const titleMatch = titlePatterns.map((pattern) => text.match(pattern)?.[1]).find(Boolean);
    const synopsisMatch = synopsisPatterns.map((pattern) => text.match(pattern)?.[1]).find(Boolean);
    const title = normalizeTitleCandidate(decodeScriptString(titleMatch));
    const synopsis = cleanText(decodeScriptString(synopsisMatch));
    if (title || synopsis) {
      return { title, synopsis };
    }
  }

  return {};
}

function decodeScriptString(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return JSON.parse(`"${value}"`);
  } catch {
    return cleanText(value.replace(/\\"/g, '"').replace(/\\\\/g, '\\'));
  }
}

export function extractNetflixVideoContext(): NetflixVideoContext {
  const titleSelectors = [
    '[data-uia="video-title"]',
    '[data-uia="title"]',
    '.video-title',
    'h1',
  ];

  const visibleTitle = titleSelectors
    .map((selector) => normalizeTitleCandidate(document.querySelector(selector)?.textContent || undefined))
    .find(Boolean);
  const jsonLdContext = readJsonLdContext();
  const scriptContext = readScriptStateContext();
  const title = cleanNetflixTitle(
    visibleTitle ||
    jsonLdContext.title ||
    scriptContext.title ||
    readMetaContent('meta[property="og:title"]') ||
    readMetaContent('meta[name="twitter:title"]') ||
    document.title
  );

  const synopsisSelectors = [
    '[data-uia="video-description"]',
    '[data-uia="title-info-synopsis"]',
    '.synopsis',
    '.title-info-synopsis',
  ];
  const visibleSynopsis = synopsisSelectors
    .map((selector) => cleanText(document.querySelector(selector)?.textContent))
    .find(Boolean);
  const synopsis =
    visibleSynopsis ||
    jsonLdContext.synopsis ||
    scriptContext.synopsis ||
    readMetaContent('meta[name="description"]') ||
    readMetaContent('meta[property="og:description"]');

  const maturityRating = cleanText(
    document.querySelector('[data-uia="maturity-rating"], .maturity-rating')?.textContent
  );

  const source = visibleTitle
    ? 'dom-title-selector'
    : jsonLdContext.title
      ? 'json-ld'
      : scriptContext.title
        ? 'script-state'
        : readMetaContent('meta[property="og:title"]') || readMetaContent('meta[name="twitter:title"]')
          ? 'meta-tag'
          : title
            ? 'document-title'
            : undefined;
  const confidence: NetflixMetadataConfidence | undefined =
    source === 'dom-title-selector' || source === 'json-ld' || source === 'meta-tag'
      ? 'medium'
      : source === 'script-state'
        ? 'medium'
        : source
          ? 'low'
          : undefined;

  return {
    title,
    synopsis,
    maturityRating,
    source,
    confidence,
  };
}

interface VideoMetadataEventDetail {
  videoId: string;
  title?: string;
  synopsis?: string;
  maturityRating?: string;
  genres?: string[];
  source?: string;
  confidence?: NetflixMetadataConfidence;
  timestamp: number;
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
  private metadataRetryTimer: number | null = null;
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
    this.listenForVideoMetadata();
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

  private listenForVideoMetadata(): void {
    window.addEventListener('nt-video-metadata', ((event: Event) => {
      const customEvent = event as CustomEvent<VideoMetadataEventDetail>;
      const metadata = customEvent.detail;
      if (!metadata.videoId || metadata.videoId !== this.currentVideoId) return;

      const title = normalizeTitleCandidate(metadata.title);
      const netflixContext: NetflixVideoContext = {
        title,
        synopsis: cleanText(metadata.synopsis),
        maturityRating: cleanText(metadata.maturityRating),
        genres: metadata.genres,
        source: metadata.source || 'metadata-response',
        confidence: metadata.confidence || 'high',
      };

      if (!title && !netflixContext.synopsis) return;

      this.reportVideoDetected({
        videoId: metadata.videoId,
        url: window.location.href,
        detectedAt: Date.now(),
        videoTitle: title,
        netflixContext,
      });
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

    const netflixContext = extractNetflixVideoContext();
    resource.videoTitle = netflixContext.title;
    resource.netflixContext = netflixContext;

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

    // Forward to service worker as a pending subtitle (do NOT save to library yet)
    chrome.runtime
      .sendMessage({
        type: 'SUBTITLE_CANDIDATE',
        resource,
        payload: candidate.payload,
      })
      .then(() => {
        this.overlay.setStatus(
          `Subtitle detected (${resource.format}). Open popup and click Prepare to save.`
        );
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
        ...this.buildVideoMetadata(),
      };
      this.reportVideoDetected(videoIdentity);
      this.scheduleMetadataRefresh(videoId, url);
    } else if (!videoId && this.currentVideoId) {
      // Left a watch page
      this.currentVideoId = null;
      this.clearMetadataRefresh();
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
        videoTitle: video.videoTitle,
        netflixContext: video.netflixContext,
      })
      .catch((err) => {
        this.overlay.addError('Failed to report video: ' + (err as Error).message);
      });
  }

  private scheduleMetadataRefresh(videoId: string, url: string, attempt = 1): void {
    this.clearMetadataRefresh();
    if (attempt > 10) return;

    this.metadataRetryTimer = window.setTimeout(() => {
      if (this.currentVideoId !== videoId) return;

      const metadata = this.buildVideoMetadata();
      if (metadata.videoTitle) {
        this.reportVideoDetected({
          videoId,
          url,
          detectedAt: Date.now(),
          ...metadata,
        });
        this.clearMetadataRefresh();
        return;
      }

      this.scheduleMetadataRefresh(videoId, url, attempt + 1);
    }, 1000);
  }

  private clearMetadataRefresh(): void {
    if (this.metadataRetryTimer !== null) {
      window.clearTimeout(this.metadataRetryTimer);
      this.metadataRetryTimer = null;
    }
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
   * Get the currently detected video ID
   */
  getCurrentVideoId(): string | null {
    return this.currentVideoId;
  }

  private buildVideoMetadata(): Pick<VideoIdentity, 'videoTitle' | 'netflixContext'> {
    const netflixContext = extractNetflixVideoContext();
    return {
      videoTitle: netflixContext.title,
      netflixContext,
    };
  }

  /**
   * Check if currently on a watch page
   */
  isOnWatchPage(): boolean {
    return this.currentVideoId !== null;
  }
}
