import { describe, it, expect } from 'vitest';
import { extractVideoId, isNetflixWatchUrl } from './url-utils';

describe('extractVideoId', () => {
  it('extracts video ID from standard Netflix watch URL', () => {
    expect(extractVideoId('https://www.netflix.com/watch/12345')).toBe('12345');
    expect(extractVideoId('https://netflix.com/watch/9876543210')).toBe('9876543210');
  });

  it('extracts video ID with query parameters', () => {
    expect(extractVideoId('https://www.netflix.com/watch/12345?trackId=123')).toBe('12345');
    expect(extractVideoId('https://www.netflix.com/watch/12345?t=100')).toBe('12345');
    // Real Netflix URL format observed in testing
    expect(extractVideoId('https://www.netflix.com/watch/81948313?trackId=14170286')).toBe('81948313');
  });

  it('returns null for non-watch Netflix URLs', () => {
    expect(extractVideoId('https://www.netflix.com/browse')).toBeNull();
    expect(extractVideoId('https://www.netflix.com/title/12345')).toBeNull();
    expect(extractVideoId('https://www.netflix.com/')).toBeNull();
  });

  it('returns null for non-Netflix URLs', () => {
    expect(extractVideoId('https://www.youtube.com/watch?v=12345')).toBeNull();
    expect(extractVideoId('https://www.google.com/')).toBeNull();
    expect(extractVideoId('https://example.com/watch/12345')).toBeNull();
  });

  it('returns null for malformed URLs', () => {
    expect(extractVideoId('not-a-url')).toBeNull();
    expect(extractVideoId('')).toBeNull();
    expect(extractVideoId('http://[invalid')).toBeNull();
  });

  it('returns null for watch URLs with non-numeric IDs', () => {
    expect(extractVideoId('https://www.netflix.com/watch/abc123')).toBeNull();
    expect(extractVideoId('https://www.netflix.com/watch/')).toBeNull();
  });

  it('returns null for URLs with extra path segments', () => {
    expect(extractVideoId('https://www.netflix.com/watch/12345/extra')).toBeNull();
  });
});

describe('isNetflixWatchUrl', () => {
  it('returns true for valid watch URLs', () => {
    expect(isNetflixWatchUrl('https://www.netflix.com/watch/12345')).toBe(true);
  });

  it('returns false for non-watch URLs', () => {
    expect(isNetflixWatchUrl('https://www.netflix.com/browse')).toBe(false);
    expect(isNetflixWatchUrl('https://www.google.com/')).toBe(false);
  });
});
