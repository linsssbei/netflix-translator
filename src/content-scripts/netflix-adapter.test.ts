import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NetflixAdapter, extractNetflixVideoContext } from './netflix-adapter';
import { getChromeMock } from '../test/chrome-mock';

describe('NetflixAdapter', () => {
  let adapter: NetflixAdapter;
  let videoChangeHandler: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    document.title = '';
    videoChangeHandler = vi.fn();
    adapter = new NetflixAdapter({ onVideoChange: videoChangeHandler });

    // Mock chrome.runtime.getURL
    const mock = getChromeMock();
    mock.runtime.getURL.mockImplementation((path: string) => `chrome-extension://test-id/${path}`);
  });

  afterEach(() => {
    vi.useRealTimers();
    adapter = null as unknown as NetflixAdapter;
  });

  describe('SPA navigation detection', () => {
    it('detects initial watch page on start', () => {
      // Set initial URL to a watch page
      vi.stubGlobal('location', { href: 'https://www.netflix.com/watch/12345' });

      adapter.start();

      expect(adapter.getCurrentVideoId()).toBe('12345');
      expect(adapter.isOnWatchPage()).toBe(true);
    });

    it('reports unsupported page on initial load', () => {
      vi.stubGlobal('location', { href: 'https://www.netflix.com/browse' });

      adapter.start();

      expect(adapter.getCurrentVideoId()).toBeNull();
      expect(adapter.isOnWatchPage()).toBe(false);
    });

    it('detects navigation to a watch page via URL change event', () => {
      // Start on browse page
      vi.stubGlobal('location', { href: 'https://www.netflix.com/browse' });
      adapter.start();

      expect(adapter.getCurrentVideoId()).toBeNull();

      // Simulate SPA navigation to watch page
      const event = new CustomEvent('nt-url-changed', {
        detail: { url: 'https://www.netflix.com/watch/67890', timestamp: Date.now() },
      });
      window.dispatchEvent(event);

      expect(adapter.getCurrentVideoId()).toBe('67890');
      expect(adapter.isOnWatchPage()).toBe(true);
      expect(videoChangeHandler).toHaveBeenCalledWith(
        expect.objectContaining({ videoId: '67890' })
      );
    });

    it('detects navigation away from watch page', () => {
      // Start on watch page
      vi.stubGlobal('location', { href: 'https://www.netflix.com/watch/12345' });
      adapter.start();
      expect(adapter.isOnWatchPage()).toBe(true);

      // Simulate SPA navigation to browse page
      const event = new CustomEvent('nt-url-changed', {
        detail: { url: 'https://www.netflix.com/browse', timestamp: Date.now() },
      });
      window.dispatchEvent(event);

      expect(adapter.getCurrentVideoId()).toBeNull();
      expect(adapter.isOnWatchPage()).toBe(false);
      expect(videoChangeHandler).toHaveBeenLastCalledWith(null);
    });

    it('detects video change between two watch pages', () => {
      // Start on first watch page
      vi.stubGlobal('location', { href: 'https://www.netflix.com/watch/11111' });
      adapter.start();

      expect(adapter.getCurrentVideoId()).toBe('11111');

      // Navigate to second watch page
      const event = new CustomEvent('nt-url-changed', {
        detail: { url: 'https://www.netflix.com/watch/22222', timestamp: Date.now() },
      });
      window.dispatchEvent(event);

      expect(adapter.getCurrentVideoId()).toBe('22222');
      expect(videoChangeHandler).toHaveBeenLastCalledWith(
        expect.objectContaining({ videoId: '22222' })
      );
    });

    it('ignores URL changes to the same video', () => {
      // Start on watch page
      vi.stubGlobal('location', { href: 'https://www.netflix.com/watch/12345' });
      adapter.start();

      const callCount = videoChangeHandler.mock.calls.length;

      // Same video, just query params changed
      const event = new CustomEvent('nt-url-changed', {
        detail: { url: 'https://www.netflix.com/watch/12345?t=100', timestamp: Date.now() },
      });
      window.dispatchEvent(event);

      // Should not trigger another onVideoChange call
      expect(videoChangeHandler.mock.calls.length).toBe(callCount);
      expect(adapter.getCurrentVideoId()).toBe('12345');
    });
  });

  describe('page-world observer injection', () => {
    it('injects page-world observer script on start', () => {
      const appendChildSpy = vi.spyOn(document.head, 'appendChild');

      adapter.start();

      expect(appendChildSpy).toHaveBeenCalled();
      const scriptElement = appendChildSpy.mock.calls.find(
        (call) => call[0] instanceof HTMLScriptElement
      )?.[0] as HTMLScriptElement;

      expect(scriptElement).toBeDefined();
      expect(scriptElement.src).toBe('chrome-extension://test-id/page-world-observer.js');

      appendChildSpy.mockRestore();
    });

    it('does not inject observer twice', () => {
      const appendChildSpy = vi.spyOn(document.head, 'appendChild');

      adapter.start();
      adapter.start(); // Second call should be no-op

      // Should only append once
      const scriptAppends = appendChildSpy.mock.calls.filter(
        (call) => call[0] instanceof HTMLScriptElement
      );
      expect(scriptAppends.length).toBe(1);

      appendChildSpy.mockRestore();
    });
  });

  describe('service worker communication', () => {
    it('sends VIDEO_DETECTED message when entering watch page', () => {
      const mock = getChromeMock();
      mock.runtime.sendMessage.mockResolvedValue({});

      vi.stubGlobal('location', { href: 'https://www.netflix.com/watch/12345' });
      adapter.start();

      expect(mock.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'VIDEO_DETECTED',
          videoId: '12345',
        })
      );
    });

    it('sends VIDEO_CHANGED message when leaving watch page', () => {
      const mock = getChromeMock();
      mock.runtime.sendMessage.mockResolvedValue({});

      // Start on watch page
      vi.stubGlobal('location', { href: 'https://www.netflix.com/watch/12345' });
      adapter.start();

      // Leave watch page
      const event = new CustomEvent('nt-url-changed', {
        detail: { url: 'https://www.netflix.com/browse', timestamp: Date.now() },
      });
      window.dispatchEvent(event);

      expect(mock.runtime.sendMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({
          type: 'VIDEO_CHANGED',
          videoId: null,
        })
      );
    });

    it('includes extracted title and Netflix context when reporting a video', () => {
      const mock = getChromeMock();
      mock.runtime.sendMessage.mockResolvedValue({});
      document.title = 'My Episode - Netflix';
      const meta = document.createElement('meta');
      meta.setAttribute('name', 'description');
      meta.setAttribute('content', 'Netflix synopsis for My Episode.');
      document.head.appendChild(meta);

      vi.stubGlobal('location', { href: 'https://www.netflix.com/watch/12345' });
      adapter.start();

      expect(mock.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'VIDEO_DETECTED',
          videoId: '12345',
          videoTitle: 'My Episode',
          netflixContext: expect.objectContaining({
            title: 'My Episode',
            synopsis: 'Netflix synopsis for My Episode.',
          }),
        })
      );
    });

    it('re-reports video metadata when Netflix renders title after initial detection', async () => {
      const mock = getChromeMock();
      mock.runtime.sendMessage.mockResolvedValue({});
      document.title = 'Netflix';

      vi.stubGlobal('location', { href: 'https://www.netflix.com/watch/12345' });
      adapter.start();

      expect(mock.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'VIDEO_DETECTED',
          videoId: '12345',
          videoTitle: undefined,
        })
      );

      document.body.innerHTML = '<h1 data-uia="video-title">Delayed Episode Title</h1>';
      await vi.advanceTimersByTimeAsync(1000);

      expect(mock.runtime.sendMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({
          type: 'VIDEO_DETECTED',
          videoId: '12345',
          videoTitle: 'Delayed Episode Title',
        })
      );
    });

    it('still reports video detection when Netflix script metadata cannot be decoded', () => {
      const mock = getChromeMock();
      mock.runtime.sendMessage.mockResolvedValue({});
      const script = document.createElement('script');
      script.textContent = '"videoTitle":"Broken \\q metadata"';
      document.body.appendChild(script);

      vi.stubGlobal('location', { href: 'https://www.netflix.com/watch/12345' });
      adapter.start();

      expect(mock.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'VIDEO_DETECTED',
          videoId: '12345',
        })
      );
      expect(adapter.getCurrentVideoId()).toBe('12345');
    });
  });

  describe('extractNetflixVideoContext', () => {
    it('prefers visible Netflix title over document title', () => {
      document.body.innerHTML = '<h1 data-uia="video-title">Visible Title</h1>';
      document.title = 'Fallback Title - Netflix';

      expect(extractNetflixVideoContext().title).toBe('Visible Title');
    });

    it('extracts title from JSON-LD metadata', () => {
      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.textContent = JSON.stringify({
        '@type': 'TVEpisode',
        name: 'JSON Episode Title',
        description: 'JSON synopsis.',
      });
      document.head.appendChild(script);
      document.title = 'Netflix';

      expect(extractNetflixVideoContext()).toEqual(
        expect.objectContaining({
          title: 'JSON Episode Title',
          synopsis: 'JSON synopsis.',
        })
      );
    });

    it('extracts title from accessible playback labels', () => {
      document.body.innerHTML = '<button aria-label="Play Big Movie">Play</button>';
      document.title = 'Netflix';

      expect(extractNetflixVideoContext().title).toBeUndefined();
    });

    it('extracts title from Netflix script state when DOM labels are absent', () => {
      const script = document.createElement('script');
      script.textContent = 'window.__netflix = {"videoTitle":"Script State Title","synopsis":"Script synopsis."};';
      document.body.appendChild(script);
      document.title = 'Netflix';

      expect(extractNetflixVideoContext()).toEqual(
        expect.objectContaining({
          title: 'Script State Title',
          synopsis: 'Script synopsis.',
        })
      );
    });

    it('does not treat navigation labels as video titles', () => {
      document.body.innerHTML = '<a aria-label="Browse" title="Browse">Browse</a>';
      document.title = 'Netflix';

      expect(extractNetflixVideoContext().title).toBeUndefined();
    });
  });

  describe('metadata events', () => {
    it('uses high-confidence metadata events for the active video', () => {
      const mock = getChromeMock();
      mock.runtime.sendMessage.mockResolvedValue({});

      vi.stubGlobal('location', { href: 'https://www.netflix.com/watch/12345' });
      adapter.start();

      window.dispatchEvent(new CustomEvent('nt-video-metadata', {
        detail: {
          videoId: '12345',
          title: 'Structured Metadata Title',
          synopsis: 'Structured synopsis.',
          source: 'metadata-response',
          confidence: 'high',
          timestamp: Date.now(),
        },
      }));

      expect(mock.runtime.sendMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({
          type: 'VIDEO_DETECTED',
          videoId: '12345',
          videoTitle: 'Structured Metadata Title',
          netflixContext: expect.objectContaining({
            title: 'Structured Metadata Title',
            synopsis: 'Structured synopsis.',
            confidence: 'high',
            source: 'metadata-response',
          }),
        })
      );
    });

    it('ignores metadata events for another video', () => {
      const mock = getChromeMock();
      mock.runtime.sendMessage.mockResolvedValue({});

      vi.stubGlobal('location', { href: 'https://www.netflix.com/watch/12345' });
      adapter.start();
      const callCount = mock.runtime.sendMessage.mock.calls.length;

      window.dispatchEvent(new CustomEvent('nt-video-metadata', {
        detail: {
          videoId: '99999',
          title: 'Wrong Video Title',
          source: 'metadata-response',
          confidence: 'high',
          timestamp: Date.now(),
        },
      }));

      expect(mock.runtime.sendMessage.mock.calls.length).toBe(callCount);
    });
  });
});
