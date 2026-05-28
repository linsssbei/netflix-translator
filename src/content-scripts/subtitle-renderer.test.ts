import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SubtitleRenderer } from './subtitle-renderer';

describe('SubtitleRenderer', () => {
  let renderer: SubtitleRenderer;
  let video: HTMLVideoElement;
  let container: HTMLDivElement;

  beforeEach(() => {
    // Create a video container and video element
    container = document.createElement('div');
    container.style.position = 'relative';
    container.style.width = '800px';
    container.style.height = '450px';
    document.body.appendChild(container);

    video = document.createElement('video');
    container.appendChild(video);

    renderer = new SubtitleRenderer();
  });

  afterEach(() => {
    renderer.disable();
    document.body.innerHTML = '';
  });

  it('is disabled by default', () => {
    expect(renderer.isEnabled()).toBe(false);
  });

  it('creates overlay when enabled', () => {
    const segments = [
      { id: 'seg_0', startMs: 0, endMs: 5000, translatedText: 'Hello' },
    ];

    renderer.enable(segments);

    const overlay = document.querySelector('.nt-subtitle-overlay');
    expect(overlay).not.toBeNull();
    expect(renderer.isEnabled()).toBe(true);
  });

  it('removes overlay when disabled', () => {
    const segments = [
      { id: 'seg_0', startMs: 0, endMs: 5000, translatedText: 'Hello' },
    ];

    renderer.enable(segments);
    expect(document.querySelector('.nt-subtitle-overlay')).not.toBeNull();

    renderer.disable();
    expect(document.querySelector('.nt-subtitle-overlay')).toBeNull();
    expect(renderer.isEnabled()).toBe(false);
  });

  it('shows correct segment based on video time', () => {
    const segments = [
      { id: 'seg_0', startMs: 0, endMs: 5000, translatedText: 'First' },
      { id: 'seg_1', startMs: 5000, endMs: 10000, translatedText: 'Second' },
    ];

    renderer.enable(segments);
    const overlay = document.querySelector('.nt-subtitle-overlay') as HTMLDivElement;

    // At 2.5 seconds, should show "First"
    video.currentTime = 2.5;
    video.dispatchEvent(new Event('timeupdate'));
    expect(overlay.textContent).toBe('First');
    expect(overlay.style.opacity).toBe('1');

    // At 7 seconds, should show "Second"
    video.currentTime = 7;
    video.dispatchEvent(new Event('timeupdate'));
    expect(overlay.textContent).toBe('Second');
  });

  it('hides text when no segment matches current time', () => {
    const segments = [
      { id: 'seg_0', startMs: 1000, endMs: 3000, translatedText: 'Hello' },
    ];

    renderer.enable(segments);
    const overlay = document.querySelector('.nt-subtitle-overlay') as HTMLDivElement;

    // Before segment starts
    video.currentTime = 0;
    video.dispatchEvent(new Event('timeupdate'));
    expect(overlay.style.opacity).toBe('0');

    // During segment
    video.currentTime = 2;
    video.dispatchEvent(new Event('timeupdate'));
    expect(overlay.style.opacity).toBe('1');

    // After segment ends
    video.currentTime = 5;
    video.dispatchEvent(new Event('timeupdate'));
    expect(overlay.style.opacity).toBe('0');
  });

  it('handles multiline translated text', () => {
    const segments = [
      { id: 'seg_0', startMs: 0, endMs: 5000, translatedText: 'Line 1\nLine 2' },
    ];

    renderer.enable(segments);
    const overlay = document.querySelector('.nt-subtitle-overlay') as HTMLDivElement;

    video.currentTime = 2;
    video.dispatchEvent(new Event('timeupdate'));

    expect(overlay.textContent).toBe('Line 1\nLine 2');
  });

  it('clears current segment on seek', () => {
    const segments = [
      { id: 'seg_0', startMs: 0, endMs: 5000, translatedText: 'First' },
    ];

    renderer.enable(segments);
    const overlay = document.querySelector('.nt-subtitle-overlay') as HTMLDivElement;

    // Show segment
    video.currentTime = 2;
    video.dispatchEvent(new Event('timeupdate'));
    expect(overlay.textContent).toBe('First');

    // Seek should trigger display update
    video.currentTime = 10;
    video.dispatchEvent(new Event('seeking'));
    video.dispatchEvent(new Event('timeupdate'));
    expect(overlay.style.opacity).toBe('0');
  });

  it('updates segments without recreating overlay', () => {
    const segments1 = [
      { id: 'seg_0', startMs: 0, endMs: 5000, translatedText: 'Old' },
    ];

    renderer.enable(segments1);
    const overlay1 = document.querySelector('.nt-subtitle-overlay');

    const segments2 = [
      { id: 'seg_0', startMs: 0, endMs: 5000, translatedText: 'New' },
    ];

    renderer.updateSegments(segments2);
    const overlay2 = document.querySelector('.nt-subtitle-overlay');

    expect(overlay1).toBe(overlay2); // Same element

    video.currentTime = 2;
    video.dispatchEvent(new Event('timeupdate'));
    expect(overlay2!.textContent).toBe('New');
  });

  it('does not show text when disabled', () => {
    const segments = [
      { id: 'seg_0', startMs: 0, endMs: 5000, translatedText: 'Hello' },
    ];

    renderer.enable(segments);
    renderer.disable();

    const overlay = document.querySelector('.nt-subtitle-overlay');
    expect(overlay).toBeNull();
  });

  it('preserves whitespace in translated text', () => {
    const segments = [
      { id: 'seg_0', startMs: 0, endMs: 5000, translatedText: '  Hello World  ' },
    ];

    renderer.enable(segments);
    const overlay = document.querySelector('.nt-subtitle-overlay') as HTMLDivElement;

    video.currentTime = 2;
    video.dispatchEvent(new Event('timeupdate'));

    // textContent normalizes whitespace, but the raw text is preserved
    expect(overlay.textContent).toBe('  Hello World  ');
  });

  it('attaches overlay to document.body with position fixed', () => {
    const segments = [
      { id: 'seg_0', startMs: 0, endMs: 5000, translatedText: 'Hello' },
    ];

    renderer.enable(segments);

    const overlay = document.querySelector('.nt-subtitle-overlay') as HTMLDivElement;
    expect(overlay).not.toBeNull();
    expect(overlay.parentElement).toBe(document.body);
    expect(overlay.style.position).toBe('fixed');
  });

  it('computes overlay position from video getBoundingClientRect', () => {
    const segments = [
      { id: 'seg_0', startMs: 0, endMs: 5000, translatedText: 'Hello' },
    ];

    renderer.enable(segments);

    const overlay = document.querySelector('.nt-subtitle-overlay') as HTMLDivElement;
    const rect = video.getBoundingClientRect();

    expect(overlay.style.left).toBe(`${rect.left + rect.width / 2}px`);
    expect(overlay.style.bottom).not.toBe('');
  });

  it('injects CSS style element to hide native Netflix subtitles on enable', () => {
    const segments = [
      { id: 'seg_0', startMs: 0, endMs: 5000, translatedText: 'Hello' },
    ];

    renderer.enable(segments);

    const styleElement = document.head.querySelector('style') as HTMLStyleElement;
    expect(styleElement).not.toBeNull();
    expect(styleElement.textContent).toContain('.player-timedtext');
    expect(styleElement.textContent).toContain('display: none !important');
  });

  it('removes CSS style element on disable', () => {
    const segments = [
      { id: 'seg_0', startMs: 0, endMs: 5000, translatedText: 'Hello' },
    ];

    renderer.enable(segments);
    expect(document.head.querySelector('style')).not.toBeNull();

    renderer.disable();
    expect(document.head.querySelector('style')).toBeNull();
  });

  it('does not use Netflix-specific DOM selectors for rendering', () => {
    const querySelectorSpy = vi.spyOn(document, 'querySelector');
    const netflixSelectors = [
      '.watch-video',
      '.player-timedtext',
      '.player-timedtext-container',
      '[data-uia="player-timedtext"]',
      '[data-uia="video-title"]',
    ];

    const segments = [
      { id: 'seg_0', startMs: 0, endMs: 5000, translatedText: 'Hello' },
    ];

    renderer.enable(segments);

    const usedSelectors = querySelectorSpy.mock.calls.map(([selector]) => selector);
    for (const netflixSelector of netflixSelectors) {
      expect(usedSelectors).not.toContain(netflixSelector);
    }

    querySelectorSpy.mockRestore();
  });

  it('moves overlay into fullscreen element on fullscreenchange', () => {
    const segments = [
      { id: 'seg_0', startMs: 0, endMs: 5000, translatedText: 'Hello' },
    ];

    renderer.enable(segments);

    const overlay = document.querySelector('.nt-subtitle-overlay') as HTMLDivElement;
    expect(overlay.parentElement).toBe(document.body);

    const fullscreenContainer = document.createElement('div');
    fullscreenContainer.id = 'fullscreen-container';
    document.body.appendChild(fullscreenContainer);

    Object.defineProperty(document, 'fullscreenElement', {
      value: fullscreenContainer,
      configurable: true,
    });

    document.dispatchEvent(new Event('fullscreenchange'));

    expect(overlay.parentElement).toBe(fullscreenContainer);

    Object.defineProperty(document, 'fullscreenElement', {
      value: null,
      configurable: true,
    });

    document.dispatchEvent(new Event('fullscreenchange'));
    expect(overlay.parentElement).toBe(document.body);

    fullscreenContainer.remove();
  });

  it('cleans up all elements and listeners on destroy', () => {
    const segments = [
      { id: 'seg_0', startMs: 0, endMs: 5000, translatedText: 'Hello' },
    ];

    renderer.enable(segments);
    expect(document.querySelector('.nt-subtitle-overlay')).not.toBeNull();
    expect(document.head.querySelector('style')).not.toBeNull();

    renderer.destroy();
    expect(document.querySelector('.nt-subtitle-overlay')).toBeNull();
    expect(document.head.querySelector('style')).toBeNull();
  });

  it('does not duplicate overlays or style elements when enable is called twice', () => {
    const segments = [
      { id: 'seg_0', startMs: 0, endMs: 5000, translatedText: 'Hello' },
    ];

    renderer.enable(segments);
    const overlay = document.querySelector('.nt-subtitle-overlay');
    expect(overlay).not.toBeNull();

    renderer.enable(segments);

    const overlays = document.querySelectorAll('.nt-subtitle-overlay');
    expect(overlays.length).toBe(1);
    const styles = document.head.querySelectorAll('style');
    expect(styles.length).toBe(1);
  });

  it('refreshes video element and observers on re-enable without disable', () => {
    const segments1 = [
      { id: 'seg_0', startMs: 0, endMs: 5000, translatedText: 'First' },
    ];
    const segments2 = [
      { id: 'seg_0', startMs: 0, endMs: 5000, translatedText: 'Second' },
    ];

    renderer.enable(segments1);

    video.remove();

    const newVideo = document.createElement('video');
    Object.defineProperty(newVideo, 'currentTime', { value: 0, writable: true });
    container.appendChild(newVideo);

    renderer.enable(segments2);

    const overlay = document.querySelector('.nt-subtitle-overlay') as HTMLDivElement;
    newVideo.currentTime = 2;
    newVideo.dispatchEvent(new Event('timeupdate'));
    expect(overlay.textContent).toBe('Second');
  });
});
