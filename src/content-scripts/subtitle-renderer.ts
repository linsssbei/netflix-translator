// Netflix Translator - Subtitle Overlay Renderer
// Renders translated subtitle text over Netflix playback



export interface RenderedSegment {
  id: string;
  startMs: number;
  endMs: number;
  translatedText: string;
}

/**
 * Manages an extension-owned subtitle overlay on the Netflix video player.
 * Synchronizes translated subtitle display with video playback time.
 */
export class SubtitleRenderer {
  private overlay: HTMLDivElement | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private segments: RenderedSegment[] = [];
  private currentSegmentId: string | null = null;
  private enabled = false;
  private hideNativeSubtitles = true;

  // Event listeners (stored for cleanup)
  private timeUpdateHandler: (() => void) | null = null;
  private playHandler: (() => void) | null = null;
  private pauseHandler: (() => void) | null = null;
  private seekHandler: (() => void) | null = null;

  // Native subtitle observer
  private nativeSubtitleObserver: MutationObserver | null = null;

  /**
   * Enable the subtitle renderer with a set of translated segments.
   */
  enable(segments: RenderedSegment[]): void {
    this.segments = segments.sort((a, b) => a.startMs - b.startMs);
    this.enabled = true;
    this.findVideoElement();
    this.createOverlay();
    this.attachVideoListeners();
    this.startNativeSubtitleHiding();
    this.updateDisplay();
  }

  /**
   * Disable the subtitle renderer and clean up.
   */
  disable(): void {
    this.enabled = false;
    this.currentSegmentId = null;
    this.removeOverlay();
    this.detachVideoListeners();
    this.stopNativeSubtitleHiding();
    this.showNativeSubtitles();
  }

  /**
   * Check if the renderer is currently enabled.
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Update the segment list while keeping the renderer active.
   */
  updateSegments(segments: RenderedSegment[]): void {
    this.segments = segments.sort((a, b) => a.startMs - b.startMs);
    // Force re-evaluation of current segment on next update
    this.currentSegmentId = null;
    if (this.enabled) {
      this.updateDisplay();
    }
  }

  /**
   * Find the Netflix video element on the page.
   */
  private findVideoElement(): void {
    // Netflix uses a <video> element within the player
    this.videoElement = document.querySelector('video');
  }

  /**
   * Create the subtitle overlay DOM element.
   */
  private createOverlay(): void {
    if (this.overlay) return;

    const videoContainer = this.findVideoContainer();
    if (!videoContainer) {
      console.warn('[SubtitleRenderer] Could not find video container');
      return;
    }

    this.overlay = document.createElement('div');
    this.overlay.className = 'nt-subtitle-overlay';
    this.overlay.style.cssText = `
      position: absolute;
      bottom: 12%;
      left: 50%;
      transform: translateX(-50%);
      max-width: 80%;
      text-align: center;
      pointer-events: none;
      z-index: 9999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 24px;
      font-weight: 500;
      color: #ffffff;
      text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8), 0 0 4px rgba(0, 0, 0, 0.6);
      line-height: 1.4;
      white-space: pre-wrap;
      word-break: break-word;
      padding: 8px 16px;
      background: transparent;
      border-radius: 4px;
      transition: opacity 0.2s ease;
      opacity: 0;
    `;

    videoContainer.appendChild(this.overlay);
  }

  /**
   * Remove the overlay from the DOM.
   */
  private removeOverlay(): void {
    if (this.overlay && this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
    }
    this.overlay = null;
  }

  /**
   * Find the video container element to mount the overlay.
   */
  private findVideoContainer(): HTMLElement | null {
    // Strategy 1: Find the video element's parent container
    const video = document.querySelector('video');
    if (video) {
      let parent = video.parentElement;
      // Walk up to find a reasonably-sized container
      while (parent) {
        const rect = parent.getBoundingClientRect();
        if (rect.width > 300 && rect.height > 200) {
          return parent;
        }
        parent = parent.parentElement;
      }
      return video.parentElement;
    }

    // Strategy 2: Look for Netflix player containers
    const player = document.querySelector('.watch-video');
    if (player) return player as HTMLElement;

    // Strategy 3: Look for any large video-like container
    const containers = document.querySelectorAll('div');
    for (const container of containers) {
      const rect = container.getBoundingClientRect();
      if (rect.width > 640 && rect.height > 360) {
        const style = window.getComputedStyle(container);
        if (style.position === 'relative' || style.position === 'absolute') {
          return container as HTMLElement;
        }
      }
    }

    return null;
  }

  /**
   * Attach event listeners to the video element.
   */
  private attachVideoListeners(): void {
    if (!this.videoElement) return;

    this.timeUpdateHandler = () => this.updateDisplay();
    this.playHandler = () => this.updateDisplay();
    this.pauseHandler = () => this.updateDisplay();
    this.seekHandler = () => {
      this.currentSegmentId = null;
      this.updateDisplay();
    };

    this.videoElement.addEventListener('timeupdate', this.timeUpdateHandler);
    this.videoElement.addEventListener('play', this.playHandler);
    this.videoElement.addEventListener('pause', this.pauseHandler);
    this.videoElement.addEventListener('seeking', this.seekHandler);
  }

  /**
   * Detach event listeners from the video element.
   */
  private detachVideoListeners(): void {
    if (!this.videoElement) return;

    if (this.timeUpdateHandler) {
      this.videoElement.removeEventListener('timeupdate', this.timeUpdateHandler);
    }
    if (this.playHandler) {
      this.videoElement.removeEventListener('play', this.playHandler);
    }
    if (this.pauseHandler) {
      this.videoElement.removeEventListener('pause', this.pauseHandler);
    }
    if (this.seekHandler) {
      this.videoElement.removeEventListener('seeking', this.seekHandler);
    }

    this.timeUpdateHandler = null;
    this.playHandler = null;
    this.pauseHandler = null;
    this.seekHandler = null;
  }

  /**
   * Update the subtitle display based on current video time.
   */
  private updateDisplay(): void {
    if (!this.enabled || !this.overlay || !this.videoElement) return;

    const currentTimeMs = this.videoElement.currentTime * 1000;
    const segment = this.findSegmentAtTime(currentTimeMs);

    if (segment) {
      if (segment.id !== this.currentSegmentId) {
        this.currentSegmentId = segment.id;
        this.overlay.textContent = segment.translatedText;
        this.overlay.style.opacity = '1';
      }
    } else {
      // Always hide when no segment matches (e.g., after seek or gap)
      this.currentSegmentId = null;
      this.overlay.style.opacity = '0';
    }
  }

  /**
   * Find the segment that should be displayed at the given time.
   */
  private findSegmentAtTime(timeMs: number): RenderedSegment | null {
    // Binary search would be faster for large arrays, but linear is fine for typical subtitle counts
    for (const segment of this.segments) {
      if (timeMs >= segment.startMs && timeMs < segment.endMs) {
        return segment;
      }
    }
    return null;
  }

  // ─── Native Subtitle Hiding ──────────────────────────────────────

  /**
   * Start hiding Netflix's native subtitle elements.
   */
  private startNativeSubtitleHiding(): void {
    if (!this.hideNativeSubtitles) return;

    // Immediately try to hide existing subtitles
    this.hideNativeSubtitleElements();

    // Observe DOM changes to catch dynamically added subtitle elements
    this.nativeSubtitleObserver = new MutationObserver(() => {
      if (this.enabled) {
        this.hideNativeSubtitleElements();
      }
    });

    this.nativeSubtitleObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class'],
    });
  }

  /**
   * Stop the native subtitle hiding observer.
   */
  private stopNativeSubtitleHiding(): void {
    if (this.nativeSubtitleObserver) {
      this.nativeSubtitleObserver.disconnect();
      this.nativeSubtitleObserver = null;
    }
  }

  /**
   * Hide Netflix's native subtitle elements.
   */
  private hideNativeSubtitleElements(): void {
    // Common Netflix subtitle selectors
    const selectors = [
      '.player-timedtext',
      '.player-timedtext-container',
      '[data-uia="player-timedtext"]',
      '.watch-video--player-view-minimized .player-timedtext',
    ];

    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        const htmlEl = el as HTMLElement;
        if (htmlEl.style.display !== 'none') {
          htmlEl.style.display = 'none';
          htmlEl.dataset.ntHidden = 'true';
        }
      }
    }
  }

  /**
   * Restore Netflix's native subtitle elements.
   */
  private showNativeSubtitles(): void {
    const hiddenElements = document.querySelectorAll('[data-nt-hidden="true"]');
    for (const el of hiddenElements) {
      const htmlEl = el as HTMLElement;
      htmlEl.style.display = '';
      delete htmlEl.dataset.ntHidden;
    }
  }
}
