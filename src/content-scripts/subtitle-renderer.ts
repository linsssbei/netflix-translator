export interface RenderedSegment {
  id: string;
  startMs: number;
  endMs: number;
  translatedText: string;
}

export class SubtitleRenderer {
  private overlay: HTMLDivElement | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private segments: RenderedSegment[] = [];
  private currentSegmentId: string | null = null;
  private enabled = false;

  private timeUpdateHandler: (() => void) | null = null;
  private playHandler: (() => void) | null = null;
  private pauseHandler: (() => void) | null = null;
  private seekHandler: (() => void) | null = null;

  private styleElement: HTMLStyleElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private fullscreenHandler: (() => void) | null = null;

  private static readonly NATIVE_SUBTITLE_CSS = `
    .player-timedtext,
    .player-timedtext-container,
    [data-uia="player-timedtext"],
    .watch-video--player-view-minimized .player-timedtext {
      display: none !important;
    }
  `;

  enable(segments: RenderedSegment[]): void {
    this.segments = segments.sort((a, b) => a.startMs - b.startMs);

    if (this.enabled) {
      this.currentSegmentId = null;
      this.detachVideoListeners();
      this.teardownResizeObserver();
      this.teardownFullscreenHandler();
      this.findVideoElement();
      this.attachVideoListeners();
      this.setupResizeObserver();
      this.setupFullscreenHandler();
      this.updateOverlayPosition();
      this.updateDisplay();
      return;
    }

    this.enabled = true;
    this.findVideoElement();
    this.createOverlay();
    this.attachVideoListeners();
    this.setupResizeObserver();
    this.setupFullscreenHandler();
    this.injectNativeSubtitleHidingStyle();
    this.updateDisplay();
  }

  disable(): void {
    this.enabled = false;
    this.currentSegmentId = null;
    this.removeOverlay();
    this.detachVideoListeners();
    this.teardownResizeObserver();
    this.teardownFullscreenHandler();
    this.removeNativeSubtitleHidingStyle();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  updateSegments(segments: RenderedSegment[]): void {
    this.segments = segments.sort((a, b) => a.startMs - b.startMs);
    this.currentSegmentId = null;
    if (this.enabled) {
      this.updateDisplay();
    }
  }

  destroy(): void {
    this.disable();
    this.videoElement = null;
    this.segments = [];
  }

  private findVideoElement(): void {
    this.videoElement = document.querySelector('video');
  }

  private createOverlay(): void {
    if (this.overlay) return;

    this.overlay = document.createElement('div');
    this.overlay.className = 'nt-subtitle-overlay';
    this.overlay.style.cssText = `
      position: fixed;
      left: 50%;
      bottom: 12%;
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

    const target = document.fullscreenElement || document.body;
    target.appendChild(this.overlay);
    this.updateOverlayPosition();
  }

  private removeOverlay(): void {
    if (this.overlay && this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
    }
    this.overlay = null;
  }

  private updateOverlayPosition(): void {
    if (!this.overlay || !this.videoElement) return;
    const rect = this.videoElement.getBoundingClientRect();
    this.overlay.style.position = 'fixed';
    this.overlay.style.left = `${rect.left + rect.width / 2}px`;
    this.overlay.style.bottom = `${window.innerHeight - rect.bottom + rect.height * 0.12}px`;
    this.overlay.style.maxWidth = `${rect.width * 0.8}px`;
    this.overlay.style.transform = 'translateX(-50%)';
  }

  private setupResizeObserver(): void {
    if (!this.videoElement) return;
    this.resizeObserver = new ResizeObserver(() => {
      this.updateOverlayPosition();
    });
    this.resizeObserver.observe(this.videoElement);
  }

  private teardownResizeObserver(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
  }

  private setupFullscreenHandler(): void {
    this.fullscreenHandler = () => this.handleFullscreenChange();
    document.addEventListener('fullscreenchange', this.fullscreenHandler);
  }

  private teardownFullscreenHandler(): void {
    if (this.fullscreenHandler) {
      document.removeEventListener('fullscreenchange', this.fullscreenHandler);
      this.fullscreenHandler = null;
    }
  }

  private handleFullscreenChange(): void {
    const fullscreenElement = document.fullscreenElement;
    if (fullscreenElement && this.overlay) {
      fullscreenElement.appendChild(this.overlay);
    } else if (this.overlay && this.overlay.parentElement !== document.body) {
      document.body.appendChild(this.overlay);
    }
    this.updateOverlayPosition();
  }

  private injectNativeSubtitleHidingStyle(): void {
    if (this.styleElement) return;
    this.styleElement = document.createElement('style');
    this.styleElement.textContent = SubtitleRenderer.NATIVE_SUBTITLE_CSS;
    document.head.appendChild(this.styleElement);
  }

  private removeNativeSubtitleHidingStyle(): void {
    if (this.styleElement && this.styleElement.parentNode) {
      this.styleElement.parentNode.removeChild(this.styleElement);
    }
    this.styleElement = null;
  }

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
      this.currentSegmentId = null;
      this.overlay.style.opacity = '0';
    }
  }

  private findSegmentAtTime(timeMs: number): RenderedSegment | null {
    for (const segment of this.segments) {
      if (timeMs >= segment.startMs && timeMs < segment.endMs) {
        return segment;
      }
    }
    return null;
  }
}