import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SubtitleRenderer } from '../content-scripts/subtitle-renderer';

describe('E2E: subtitle overlay without Netflix DOM coupling', () => {
  let renderer: SubtitleRenderer;
  let video: HTMLVideoElement;

  beforeEach(() => {
    const container = document.createElement('div');
    container.id = 'player-container';
    container.style.position = 'relative';
    container.style.width = '800px';
    container.style.height = '450px';
    document.body.appendChild(container);

    video = document.createElement('video');
    video.id = 'test-video';
    video.style.width = '100%';
    video.style.height = '100%';
    container.appendChild(video);

    Object.defineProperty(video, 'currentTime', { value: 0, writable: true });

    renderer = new SubtitleRenderer();
  });

  afterEach(() => {
    renderer.disable();
    document.body.innerHTML = '';
  });

  it('attaches overlay to body with position fixed without using Netflix container classes', () => {
    const segments = [
      { id: 'seg_0', startMs: 0, endMs: 5000, translatedText: 'Test subtitle' },
    ];

    renderer.enable(segments);

    const overlay = document.querySelector('.nt-subtitle-overlay') as HTMLDivElement;
    expect(overlay).not.toBeNull();
    expect(overlay.parentElement).toBe(document.body);
    expect(overlay.style.position).toBe('fixed');
  });

  it('positions overlay relative to the video element bounding rect', () => {
    const segments = [
      { id: 'seg_0', startMs: 0, endMs: 5000, translatedText: 'Positioned' },
    ];

    renderer.enable(segments);

    const overlay = document.querySelector('.nt-subtitle-overlay') as HTMLDivElement;
    const rect = video.getBoundingClientRect();

    expect(overlay.style.left).toBe(`${rect.left + rect.width / 2}px`);
    expect(overlay.style.bottom).not.toBe('');
  });

  it('hides native subtitles via CSS injection without MutationObserver', () => {
    const segments = [
      { id: 'seg_0', startMs: 0, endMs: 5000, translatedText: 'Overlay' },
    ];

    renderer.enable(segments);

    const styleElement = document.head.querySelector('style');
    expect(styleElement).not.toBeNull();
    expect(styleElement!.textContent).toContain('.player-timedtext');
    expect(styleElement!.textContent).toContain('display: none !important');
  });

  it('cleans up overlay and CSS on disable', () => {
    const segments = [
      { id: 'seg_0', startMs: 0, endMs: 5000, translatedText: 'Cleanup' },
    ];

    renderer.enable(segments);
    expect(document.querySelector('.nt-subtitle-overlay')).not.toBeNull();
    expect(document.head.querySelector('style')).not.toBeNull();

    renderer.disable();
    expect(document.querySelector('.nt-subtitle-overlay')).toBeNull();
    expect(document.head.querySelector('style')).toBeNull();
  });

  it('does not query Netflix selectors during enable or display', () => {
    const querySelectorSpy = vi.spyOn(document, 'querySelector');
    const netflixSelectors = [
      '.watch-video',
      '.player-timedtext',
      '.player-timedtext-container',
      '[data-uia="player-timedtext"]',
      '[data-uia="video-title"]',
      '[data-uia="title"]',
      '.video-title',
      '.synopsis',
      '[data-uia="maturity-rating"]',
    ];

    const segments = [
      { id: 'seg_0', startMs: 0, endMs: 5000, translatedText: 'No Netflix DOM' },
    ];

    renderer.enable(segments);

    video.currentTime = 2;
    video.dispatchEvent(new Event('timeupdate'));

    const usedSelectors = querySelectorSpy.mock.calls.map(([selector]) => selector);
    for (const netflixSelector of netflixSelectors) {
      expect(usedSelectors).not.toContain(netflixSelector);
    }

    querySelectorSpy.mockRestore();
  });

  it('displays correct subtitle text at matching time', () => {
    const segments = [
      { id: 'seg_0', startMs: 1000, endMs: 4000, translatedText: 'First' },
      { id: 'seg_1', startMs: 5000, endMs: 9000, translatedText: 'Second' },
    ];

    renderer.enable(segments);
    const overlay = document.querySelector('.nt-subtitle-overlay') as HTMLDivElement;

    video.currentTime = 2;
    video.dispatchEvent(new Event('timeupdate'));
    expect(overlay.textContent).toBe('First');

    video.currentTime = 6;
    video.dispatchEvent(new Event('timeupdate'));
    expect(overlay.textContent).toBe('Second');

    video.currentTime = 10;
    video.dispatchEvent(new Event('timeupdate'));
    expect(overlay.style.opacity).toBe('0');
  });

  it('handles fullscreen mode by re-parenting overlay', () => {
    const segments = [
      { id: 'seg_0', startMs: 0, endMs: 5000, translatedText: 'Fullscreen' },
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

  it('destroys all overlay elements and listeners on destroy', () => {
    const segments = [
      { id: 'seg_0', startMs: 0, endMs: 5000, translatedText: 'Destroy' },
    ];

    renderer.enable(segments);
    expect(document.querySelector('.nt-subtitle-overlay')).not.toBeNull();
    expect(document.head.querySelector('style')).not.toBeNull();

    renderer.destroy();
    expect(document.querySelector('.nt-subtitle-overlay')).toBeNull();
    expect(document.head.querySelector('style')).toBeNull();
  });
});