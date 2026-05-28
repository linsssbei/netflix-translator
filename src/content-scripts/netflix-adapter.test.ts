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

    it('re-reports video metadata when network metadata arrives after initial detection', () => {
      const mock = getChromeMock();
      mock.runtime.sendMessage.mockResolvedValue({});
      document.title = 'Netflix';

      vi.stubGlobal('location', { href: 'https://www.netflix.com/watch/12345' });
      adapter.start();

      expect(mock.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'VIDEO_DETECTED',
          videoId: '12345',
          videoTitle: '12345',
        })
      );

      window.dispatchEvent(new CustomEvent('nt-video-metadata', {
        detail: {
          videoId: '12345',
          title: 'Delayed Episode Title',
          source: 'metadata-response',
          confidence: 'high',
          timestamp: Date.now(),
        },
      }));

      expect(mock.runtime.sendMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({
          type: 'VIDEO_DETECTED',
          videoId: '12345',
          videoTitle: 'Delayed Episode Title',
        })
      );
    });

    it('still reports video detection when network metadata event provides the title', () => {
      const mock = getChromeMock();
      mock.runtime.sendMessage.mockResolvedValue({});
      document.title = '';

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
    it('prefers JSON-LD title over document title', () => {
      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.textContent = JSON.stringify({
        '@type': 'TVEpisode',
        name: 'JSON-LD Title',
        description: 'JSON-LD synopsis.',
      });
      document.head.appendChild(script);
      document.title = 'Fallback Title - Netflix';

      expect(extractNetflixVideoContext().title).toBe('JSON-LD Title');
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
      expect(extractNetflixVideoContext().confidence).toBe('medium');
      expect(extractNetflixVideoContext().source).toBe('json-ld');
    });

    it('falls back to meta tags for synopsis', () => {
      const meta = document.createElement('meta');
      meta.setAttribute('name', 'description');
      meta.setAttribute('content', 'Meta description.');
      document.head.appendChild(meta);
      document.title = 'Netflix';

      expect(extractNetflixVideoContext().synopsis).toBe('Meta description.');
    });

    it('does not extract metadata from Netflix DOM selectors', () => {
      document.body.innerHTML = '<h1 data-uia="video-title">Visible Title</h1>';
      document.title = 'Netflix';

      expect(extractNetflixVideoContext().title).toBeUndefined();
    });

    it('does not extract metadata from script state scanning', () => {
      const script = document.createElement('script');
      script.textContent = 'window.__netflix = {"videoTitle":"Script State Title","synopsis":"Script synopsis."};';
      document.body.appendChild(script);
      document.title = 'Netflix';

      expect(extractNetflixVideoContext().title).toBeUndefined();
    });

    it('does not treat navigation labels as video titles', () => {
      document.body.innerHTML = '<a aria-label="Browse" title="Browse">Browse</a>';
      document.title = 'Netflix';

      expect(extractNetflixVideoContext().title).toBeUndefined();
    });

    it('reports low confidence and dom-fallback source when only document.title is available', () => {
      document.title = 'My Episode - Netflix';

      const ctx = extractNetflixVideoContext();
      expect(ctx.title).toBe('My Episode');
      expect(ctx.confidence).toBe('low');
      expect(ctx.source).toBe('document-title');
    });

    it('reports medium confidence from meta tags', () => {
      const meta = document.createElement('meta');
      meta.setAttribute('property', 'og:title');
      meta.setAttribute('content', 'OG Title');
      document.head.appendChild(meta);

      const ctx = extractNetflixVideoContext();
      expect(ctx.title).toBe('OG Title');
      expect(ctx.confidence).toBe('medium');
      expect(ctx.source).toBe('meta-tag');
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

    it('caches metadata events and uses them when resolving metadata for video transitions', () => {
      const mock = getChromeMock();
      mock.runtime.sendMessage.mockResolvedValue({});

      vi.stubGlobal('location', { href: 'https://www.netflix.com/watch/12345' });
      adapter.start();

      window.dispatchEvent(new CustomEvent('nt-video-metadata', {
        detail: {
          videoId: '12345',
          title: 'Cached Title',
          synopsis: 'Cached synopsis.',
          source: 'metadata-response',
          confidence: 'high',
          timestamp: Date.now(),
        },
      }));

      expect(mock.runtime.sendMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({
          type: 'VIDEO_DETECTED',
          videoId: '12345',
          videoTitle: 'Cached Title',
          netflixContext: expect.objectContaining({
            title: 'Cached Title',
            confidence: 'high',
          }),
        })
      );
    });

    it('falls back to video ID in videoTitle when no metadata title is available', () => {
      const mock = getChromeMock();
      mock.runtime.sendMessage.mockResolvedValue({});
      document.title = '';

      vi.stubGlobal('location', { href: 'https://www.netflix.com/watch/12345' });
      adapter.start();

      expect(mock.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'VIDEO_DETECTED',
          videoId: '12345',
          videoTitle: '12345',
        })
      );
    });

    it('stores metadata for any video ID in cache even if video ID mismatch', () => {
      const mock = getChromeMock();
      mock.runtime.sendMessage.mockResolvedValue({});

      vi.stubGlobal('location', { href: 'https://www.netflix.com/watch/12345' });
      adapter.start();

      window.dispatchEvent(new CustomEvent('nt-video-metadata', {
        detail: {
          videoId: '99999',
          title: 'Other Video Title',
          source: 'metadata-response',
          confidence: 'high',
          timestamp: Date.now(),
        },
      }));

      window.dispatchEvent(new CustomEvent('nt-url-changed', {
        detail: { url: 'https://www.netflix.com/watch/99999', timestamp: Date.now() },
      }));

      expect(mock.runtime.sendMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({
          type: 'VIDEO_DETECTED',
          videoId: '99999',
          videoTitle: 'Other Video Title',
        })
      );
    });
  });

  describe('metadata cache (network-first without DOM)', () => {
    it('resolves video context purely from intercepted JSON events without any Netflix DOM fixtures', () => {
      const mock = getChromeMock();
      mock.runtime.sendMessage.mockResolvedValue({});
      document.title = '';

      vi.stubGlobal('location', { href: 'https://www.netflix.com/watch/80012345' });
      adapter.start();

      expect(mock.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'VIDEO_DETECTED',
          videoId: '80012345',
          videoTitle: '80012345',
          netflixContext: expect.objectContaining({
            confidence: 'low',
            source: 'dom-fallback',
          }),
        })
      );

      window.dispatchEvent(new CustomEvent('nt-video-metadata', {
        detail: {
          videoId: '80012345',
          title: 'Title from Network Event',
          synopsis: 'Synopsis from network',
          maturityRating: 'TV-MA',
          genres: ['Drama', 'Thriller'],
          source: 'metadata-response',
          confidence: 'high',
          timestamp: Date.now(),
        },
      }));

      expect(mock.runtime.sendMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({
          type: 'VIDEO_DETECTED',
          videoId: '80012345',
          videoTitle: 'Title from Network Event',
          netflixContext: expect.objectContaining({
            title: 'Title from Network Event',
            synopsis: 'Synopsis from network',
            maturityRating: 'TV-MA',
            genres: ['Drama', 'Thriller'],
            confidence: 'high',
            source: 'metadata-response',
          }),
        })
      );
    });

    it('stores and returns metadata for multiple video IDs in cache', () => {
      const mock = getChromeMock();
      mock.runtime.sendMessage.mockResolvedValue({});

      vi.stubGlobal('location', { href: 'https://www.netflix.com/browse' });
      adapter.start();

      window.dispatchEvent(new CustomEvent('nt-video-metadata', {
        detail: {
          videoId: '11111',
          title: 'Video One',
          source: 'metadata-response',
          confidence: 'high',
          timestamp: Date.now(),
        },
      }));

      window.dispatchEvent(new CustomEvent('nt-video-metadata', {
        detail: {
          videoId: '22222',
          title: 'Video Two',
          source: 'metadata-response',
          confidence: 'high',
          timestamp: Date.now(),
        },
      }));

      window.dispatchEvent(new CustomEvent('nt-url-changed', {
        detail: { url: 'https://www.netflix.com/watch/11111', timestamp: Date.now() },
      }));

      expect(mock.runtime.sendMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({
          videoId: '11111',
          videoTitle: 'Video One',
          netflixContext: expect.objectContaining({
            title: 'Video One',
            confidence: 'high',
          }),
        })
      );

      window.dispatchEvent(new CustomEvent('nt-url-changed', {
        detail: { url: 'https://www.netflix.com/watch/22222', timestamp: Date.now() },
      }));

      expect(mock.runtime.sendMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({
          videoId: '22222',
          videoTitle: 'Video Two',
          netflixContext: expect.objectContaining({
            title: 'Video Two',
            confidence: 'high',
          }),
        })
      );
    });

    it('returns cached metadata with high confidence from resolveMetadata', () => {
      const mock = getChromeMock();
      mock.runtime.sendMessage.mockResolvedValue({});

      vi.stubGlobal('location', { href: 'https://www.netflix.com/watch/80012345' });
      adapter.start();

      window.dispatchEvent(new CustomEvent('nt-video-metadata', {
        detail: {
          videoId: '80012345',
          title: 'High Confidence Title',
          maturityRating: 'R',
          genres: ['Action'],
          source: 'metadata-response',
          confidence: 'high',
          timestamp: Date.now(),
        },
      }));

      expect(mock.runtime.sendMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({
          netflixContext: expect.objectContaining({
            title: 'High Confidence Title',
            maturityRating: 'R',
            genres: ['Action'],
            confidence: 'high',
            source: 'metadata-response',
          }),
        })
      );
    });

    it('falls back to DOM extraction when cached metadata becomes stale after 30 seconds', () => {
      const mock = getChromeMock();
      mock.runtime.sendMessage.mockResolvedValue({});
      document.title = 'DOM Fallback Title - Netflix';

      vi.stubGlobal('location', { href: 'https://www.netflix.com/browse' });
      adapter.start();

      window.dispatchEvent(new CustomEvent('nt-video-metadata', {
        detail: {
          videoId: '99999',
          title: 'Cached Title',
          synopsis: 'Cached synopsis',
          source: 'metadata-response',
          confidence: 'high',
          timestamp: Date.now(),
        },
      }));

      vi.advanceTimersByTime(31_000);

      window.dispatchEvent(new CustomEvent('nt-url-changed', {
        detail: { url: 'https://www.netflix.com/watch/99999', timestamp: Date.now() },
      }));

      expect(mock.runtime.sendMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({
          videoId: '99999',
          netflixContext: expect.objectContaining({
            title: 'DOM Fallback Title',
            confidence: 'low',
            source: 'document-title',
          }),
        })
      );
    });

    it('does not require Netflix-specific DOM elements for metadata resolution', () => {
      const mock = getChromeMock();
      mock.runtime.sendMessage.mockResolvedValue({});

      document.body.innerHTML = '<div class="watch-video"><h1 data-uia="video-title">Wrong Title</h1></div><div class="player-timedtext">Subtitles</div>';
      document.title = '';

      vi.stubGlobal('location', { href: 'https://www.netflix.com/watch/80012345' });
      adapter.start();

      window.dispatchEvent(new CustomEvent('nt-video-metadata', {
        detail: {
          videoId: '80012345',
          title: 'Title from Intercepted Event',
          synopsis: 'Synopsis from event',
          source: 'metadata-response',
          confidence: 'high',
          timestamp: Date.now(),
        },
      }));

      expect(mock.runtime.sendMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({
          videoTitle: 'Title from Intercepted Event',
          netflixContext: expect.objectContaining({
            title: 'Title from Intercepted Event',
            confidence: 'high',
          }),
        })
      );

      const lastCall = mock.runtime.sendMessage.mock.calls.at(-1)?.[0] as any;
      expect(lastCall.netflixContext.title).not.toBe('Wrong Title');
    });

    it('continues retrying metadata even when videoId is used as fallback videoTitle', () => {
      const mock = getChromeMock();
      mock.runtime.sendMessage.mockResolvedValue({});
      document.title = '';

      vi.stubGlobal('location', { href: 'https://www.netflix.com/watch/80012345' });
      adapter.start();

      vi.advanceTimersByTime(1000);

      const callsWithTitle = mock.runtime.sendMessage.mock.calls.filter(
        (call: any[]) => call[0]?.type === 'VIDEO_DETECTED'
      );
      const callsWithVideoIdFallback = callsWithTitle.filter(
        (call: any[]) => call[0]?.videoTitle === '80012345'
      );
      expect(callsWithVideoIdFallback.length).toBeGreaterThan(0);

      window.dispatchEvent(new CustomEvent('nt-video-metadata', {
        detail: {
          videoId: '80012345',
          title: 'Real Title Arrives Late',
          source: 'metadata-response',
          confidence: 'high',
          timestamp: Date.now(),
        },
      }));

      expect(mock.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          videoTitle: 'Real Title Arrives Late',
          netflixContext: expect.objectContaining({
            title: 'Real Title Arrives Late',
            confidence: 'high',
          }),
        })
      );
    });
  });
});
