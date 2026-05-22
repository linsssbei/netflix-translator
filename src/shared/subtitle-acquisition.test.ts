import { describe, it, expect } from 'vitest';
import {
  detectSubtitleFormat,
  isValidSubtitlePayload,
  computeContentHash,
  createSubtitleResource,
} from './subtitle-acquisition';

describe('detectSubtitleFormat', () => {
  it('detects WebVTT from content type', () => {
    expect(detectSubtitleFormat('', 'text/vtt')).toBe('webvtt');
    expect(detectSubtitleFormat('', 'application/vtt')).toBe('webvtt');
  });

  it('detects TTML from content type', () => {
    expect(detectSubtitleFormat('', 'application/ttml+xml')).toBe('ttml');
  });

  it('detects WebVTT from payload', () => {
    expect(detectSubtitleFormat('WEBVTT\n\n00:00:00.000 --> 00:00:05.000\nHello', '')).toBe('webvtt');
  });

  it('detects SRT from payload', () => {
    expect(detectSubtitleFormat('1\n00:00:00,000 --> 00:00:05,000\nHello', '')).toBe('srt');
  });

  it('detects JSON from payload', () => {
    expect(detectSubtitleFormat('{"text": "Hello"}', '')).toBe('json');
  });

  it('returns unknown for unrecognized content', () => {
    expect(detectSubtitleFormat('random text without timing', '')).toBe('unknown');
  });
});

describe('isValidSubtitlePayload', () => {
  it('validates WebVTT content', () => {
    expect(isValidSubtitlePayload('WEBVTT\n\n00:00:00.000 --> 00:00:05.000\nHello')).toBe(true);
  });

  it('validates SRT content', () => {
    expect(isValidSubtitlePayload('1\n00:00:00,000 --> 00:00:05,000\nHello')).toBe(true);
  });

  it('rejects empty payload', () => {
    expect(isValidSubtitlePayload('')).toBe(false);
  });

  it('rejects random text without timing', () => {
    expect(isValidSubtitlePayload('just some random text')).toBe(false);
  });
});

describe('computeContentHash', () => {
  it('computes consistent hash for same content', async () => {
    const hash1 = await computeContentHash('test content');
    const hash2 = await computeContentHash('test content');
    expect(hash1).toBe(hash2);
  });

  it('computes different hash for different content', async () => {
    const hash1 = await computeContentHash('content A');
    const hash2 = await computeContentHash('content B');
    expect(hash1).not.toBe(hash2);
  });

  it('produces 64-character hex string', async () => {
    const hash = await computeContentHash('test');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('createSubtitleResource', () => {
  it('creates resource with correct properties', async () => {
    const resource = await createSubtitleResource(
      'https://example.com/subtitle.vtt',
      'text/vtt',
      'WEBVTT\nHello',
      '12345',
      'page-world-clone'
    );

    expect(resource.url).toBe('https://example.com/subtitle.vtt');
    expect(resource.videoId).toBe('12345');
    expect(resource.format).toBe('webvtt');
    expect(resource.acquisitionMethod).toBe('page-world-clone');
    expect(resource.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(resource.discoveredAt).toBeGreaterThan(0);
  });
});
