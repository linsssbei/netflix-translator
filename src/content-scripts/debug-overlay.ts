// Netflix Translator - Debug Overlay
// Injected into Netflix pages for remote debugging without DevTools

export interface DebugOverlayState {
  videoId: string | null;
  status: string;
  subtitleCandidates: Array<{
    url: string;
    format: string;
    size: number;
    timestamp: number;
  }>;
  errors: string[];
}

export class DebugOverlay {
  private container: HTMLDivElement | null = null;
  private state: DebugOverlayState = {
    videoId: null,
    status: 'Initializing...',
    subtitleCandidates: [],
    errors: [],
  };

  constructor() {
    this.createOverlay();
  }

  private createOverlay(): void {
    this.container = document.createElement('div');
    this.container.id = 'nt-debug-overlay';
    this.container.style.cssText = `
      position: fixed;
      top: 60px;
      right: 20px;
      width: 350px;
      max-height: 400px;
      background: rgba(0, 0, 0, 0.85);
      color: #00ff00;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      padding: 12px;
      border-radius: 8px;
      z-index: 999999;
      overflow-y: auto;
      border: 1px solid #00ff00;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    `;

    // Add toggle button
    const toggleBtn = document.createElement('button');
    toggleBtn.textContent = 'NT Debug';
    toggleBtn.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: rgba(0, 0, 0, 0.85);
      color: #00ff00;
      border: 1px solid #00ff00;
      border-radius: 4px;
      padding: 6px 12px;
      font-family: monospace;
      font-size: 11px;
      cursor: pointer;
      z-index: 999999;
    `;

    let visible = true;
    toggleBtn.onclick = () => {
      visible = !visible;
      if (this.container) {
        this.container.style.display = visible ? 'block' : 'none';
      }
      toggleBtn.style.background = visible ? 'rgba(0, 0, 0, 0.85)' : 'rgba(255, 0, 0, 0.85)';
    };

    document.body.appendChild(toggleBtn);
    document.body.appendChild(this.container);

    this.render();
  }

  updateVideoId(videoId: string | null): void {
    this.state.videoId = videoId;
    this.state.status = videoId ? `Video: ${videoId}` : 'No video detected';
    this.render();
  }

  addSubtitleCandidate(url: string, format: string, size: number): void {
    this.state.subtitleCandidates.unshift({
      url: url.substring(0, 60) + (url.length > 60 ? '...' : ''),
      format,
      size,
      timestamp: Date.now(),
    });

    // Keep only last 5 candidates
    if (this.state.subtitleCandidates.length > 5) {
      this.state.subtitleCandidates.pop();
    }

    this.render();
  }

  setStatus(status: string): void {
    this.state.status = status;
    this.render();
  }

  addError(error: string): void {
    this.state.errors.unshift(`${new Date().toLocaleTimeString()}: ${error}`);
    if (this.state.errors.length > 3) {
      this.state.errors.pop();
    }
    this.render();
  }

  private render(): void {
    if (!this.container) return;

    const candidatesHtml = this.state.subtitleCandidates
      .map(
        (c) => `
      <div style="margin: 4px 0; padding: 4px; background: rgba(0,255,0,0.1); border-radius: 3px;">
        <div style="color: #00ff00; font-size: 10px;">📄 ${c.format.toUpperCase()} (${c.size} bytes)</div>
        <div style="color: #aaa; font-size: 9px; word-break: break-all;">${c.url}</div>
      </div>
    `
      )
      .join('');

    const errorsHtml = this.state.errors
      .map(
        (e) => `
      <div style="color: #ff4444; font-size: 10px; margin: 2px 0;">❌ ${e}</div>
    `
      )
      .join('');

    this.container.innerHTML = `
      <div style="border-bottom: 1px solid #00ff00; padding-bottom: 8px; margin-bottom: 8px;">
        <div style="font-size: 14px; font-weight: bold; color: #00ff00;">🎬 Netflix Translator Debug</div>
        <div style="font-size: 11px; color: ${this.state.videoId ? '#00ff00' : '#ffaa00'}; margin-top: 4px;">
          ${this.state.videoId ? `✅ Video: ${this.state.videoId}` : '⏳ Waiting for video...'}
        </div>
      </div>
      
      <div style="margin: 8px 0;">
        <div style="color: #888; font-size: 10px;">STATUS</div>
        <div style="color: #fff; font-size: 11px;">${this.state.status}</div>
      </div>

      <div style="margin: 8px 0;">
        <div style="color: #888; font-size: 10px;">SUBTITLE DISCOVERED (${this.state.subtitleCandidates.length})</div>
        ${candidatesHtml || '<div style="color: #666; font-size: 10px;">No subtitles found yet...</div>'}
      </div>

      ${errorsHtml ? `
      <div style="margin: 8px 0;">
        <div style="color: #888; font-size: 10px;">ERRORS</div>
        ${errorsHtml}
      </div>
      ` : ''}
    `;
  }
}
