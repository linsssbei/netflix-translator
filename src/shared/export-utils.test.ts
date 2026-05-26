import { describe, it, expect } from 'vitest';
import {
  formatSrtTimestamp,
  formatVttTimestamp,
  validateAndOrderSegments,
  normalizeSubtitleText,
  sanitizeFilenameComponent,
  generateExportFilename,
  generateSrtContent,
  generateVttContent,
  escapeVttCueText,
  generateJsonBundle,
  checkExportEligibility,
  generateExport,
} from './export-utils';
import type { SubtitleLibraryEntry, TranslatedSegment, TranslatedArtifact } from './types';

// ─── Helpers ───────────────────────────────────────────────────────

function createSegment(overrides: Partial<TranslatedSegment> = {}): TranslatedSegment {
  return {
    id: 'seg_0',
    startMs: 0,
    endMs: 5000,
    translatedText: 'Hello world',
    ...overrides,
  };
}

function createArtifact(segments: TranslatedSegment[], overrides: Partial<TranslatedArtifact> = {}): TranslatedArtifact {
  return {
    videoId: '12345',
    sourceLanguage: 'en',
    targetLanguage: 'zh-CN',
    sourceSubtitleHash: 'a'.repeat(64),
    preparedAt: 1700000000000,
    provider: 'deepseek',
    segments,
    ...overrides,
  };
}

function createEntry(overrides: Partial<SubtitleLibraryEntry> = {}): SubtitleLibraryEntry {
  return {
    key: '12345:en:zh-CN:abc123',
    videoId: '12345',
    sourceLanguage: 'en',
    targetLanguage: 'zh-CN',
    sourceSubtitleHash: 'a'.repeat(64),
    status: 'translation-ready',
    updatedAt: 1700000000000,
    videoTitle: 'Test Movie',
    sourceSegmentCount: 2,
    translatedSegmentCount: 2,
    ...overrides,
  };
}

// ─── Timestamp Formatting ──────────────────────────────────────────

describe('formatSrtTimestamp', () => {
  it('formats 0ms correctly', () => {
    expect(formatSrtTimestamp(0)).toBe('00:00:00,000');
  });

  it('formats milliseconds', () => {
    expect(formatSrtTimestamp(1234)).toBe('00:00:01,234');
  });

  it('formats seconds and minutes', () => {
    expect(formatSrtTimestamp(61_234)).toBe('00:01:01,234');
  });

  it('formats hours', () => {
    expect(formatSrtTimestamp(3_661_234)).toBe('01:01:01,234');
  });

  it('pads all components', () => {
    expect(formatSrtTimestamp(3_665_789)).toBe('01:01:05,789');
  });
});

describe('formatVttTimestamp', () => {
  it('formats 0ms correctly', () => {
    expect(formatVttTimestamp(0)).toBe('00:00:00.000');
  });

  it('uses dot separator for milliseconds', () => {
    expect(formatVttTimestamp(1234)).toBe('00:00:01.234');
  });

  it('formats hours minutes seconds', () => {
    expect(formatVttTimestamp(3_661_234)).toBe('01:01:01.234');
  });
});

// ─── Segment Validation & Ordering ─────────────────────────────────

describe('validateAndOrderSegments', () => {
  it('returns sorted segments for valid input', () => {
    const segs = [
      createSegment({ id: 'b', startMs: 5000, endMs: 10000 }),
      createSegment({ id: 'a', startMs: 0, endMs: 5000 }),
    ];
    const result = validateAndOrderSegments(segs);
    expect(result).not.toBeNull();
    expect(result![0].id).toBe('a');
    expect(result![1].id).toBe('b');
  });

  it('returns null for empty segments', () => {
    expect(validateAndOrderSegments([])).toBeNull();
  });

  it('returns null for undefined/null segments', () => {
    expect(validateAndOrderSegments(null as any)).toBeNull();
    expect(validateAndOrderSegments(undefined as any)).toBeNull();
  });

  it('returns null when start >= end', () => {
    const segs = [createSegment({ startMs: 5000, endMs: 5000 })];
    expect(validateAndOrderSegments(segs)).toBeNull();
  });

  it('returns null for negative times', () => {
    const segs = [createSegment({ startMs: -1, endMs: 1000 })];
    expect(validateAndOrderSegments(segs)).toBeNull();
  });

  it('returns null for NaN times', () => {
    const segs = [createSegment({ startMs: NaN, endMs: 1000 })];
    expect(validateAndOrderSegments(segs)).toBeNull();
  });

  it('returns null for timestamps that exceed strict SRT hour width', () => {
    const segs = [createSegment({ startMs: 360_000_000, endMs: 360_001_000 })];
    expect(validateAndOrderSegments(segs)).toBeNull();
  });

  it('returns null for empty translated text', () => {
    const segs = [createSegment({ translatedText: '   ' })];
    expect(validateAndOrderSegments(segs)).toBeNull();
  });

  it('returns null for missing translated text', () => {
    const segs = [createSegment({ translatedText: '' })];
    expect(validateAndOrderSegments(segs)).toBeNull();
  });

  it('sorts by start time then end time', () => {
    const segs = [
      createSegment({ id: 'c', startMs: 1000, endMs: 3000 }),
      createSegment({ id: 'a', startMs: 1000, endMs: 2000 }),
      createSegment({ id: 'b', startMs: 500, endMs: 1000 }),
    ];
    const result = validateAndOrderSegments(segs);
    expect(result!.map((s) => s.id)).toEqual(['b', 'a', 'c']);
  });
});

// ─── Text Normalization ────────────────────────────────────────────

describe('normalizeSubtitleText', () => {
  it('normalizes CRLF to LF', () => {
    expect(normalizeSubtitleText('Line1\r\nLine2')).toBe('Line1\nLine2');
  });

  it('normalizes standalone CR to LF', () => {
    expect(normalizeSubtitleText('Line1\rLine2')).toBe('Line1\nLine2');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeSubtitleText('  hello  ')).toBe('hello');
  });

  it('preserves internal line breaks', () => {
    expect(normalizeSubtitleText('Line1\nLine2')).toBe('Line1\nLine2');
  });

  it('collapses internal blank lines that would split subtitle cue blocks', () => {
    expect(normalizeSubtitleText('  A\n\nB  ')).toBe('A\nB');
  });
});

// ─── Filename Sanitization ─────────────────────────────────────────

describe('sanitizeFilenameComponent', () => {
  it('keeps alphanumeric characters', () => {
    expect(sanitizeFilenameComponent('HelloWorld123')).toBe('HelloWorld123');
  });

  it('replaces unsafe characters with underscore', () => {
    expect(sanitizeFilenameComponent('Title: "The Best"')).toBe('Title_ _The Best_');
  });

  it('replaces slashes and backslashes', () => {
    expect(sanitizeFilenameComponent('A/B\\C')).toBe('A_B_C');
  });

  it('trims leading/trailing spaces', () => {
    expect(sanitizeFilenameComponent('  hello  ')).toBe('hello');
  });

  it('collapses multiple spaces', () => {
    expect(sanitizeFilenameComponent('hello    world')).toBe('hello world');
  });

  it('caps length at 100 chars', () => {
    const long = 'a'.repeat(150);
    expect(sanitizeFilenameComponent(long)).toHaveLength(100);
  });
});

describe('generateExportFilename', () => {
  it('uses video title when available', () => {
    const result = generateExportFilename('My Movie', '12345', 'en', 'zh-CN', 'abc123def', 'srt');
    expect(result.filename).toContain('My Movie');
    expect(result.extension).toBe('srt');
  });

  it('falls back to video ID when title is missing', () => {
    const result = generateExportFilename(undefined, '12345', 'en', 'zh-CN', 'abc123def', 'srt');
    expect(result.filename).toContain('video_12345');
  });

  it('includes source language, target language, and hash prefix', () => {
    const result = generateExportFilename('Movie', '12345', 'en', 'zh-CN', 'abc123def456', 'srt');
    expect(result.filename).toBe('Movie_en_zh-CN_abc123de');
    expect(result.extension).toBe('srt');
  });

  it('uses json extension for json-bundle', () => {
    const result = generateExportFilename('Movie', '12345', 'en', 'zh-CN', 'abc', 'json-bundle');
    expect(result.extension).toBe('json');
  });
});

// ─── SRT Export ────────────────────────────────────────────────────

describe('generateSrtContent', () => {
  it('generates correct SRT for single segment', () => {
    const segs = [createSegment({ id: 's1', startMs: 1000, endMs: 5000, translatedText: 'Hello' })];
    const srt = generateSrtContent(segs);
    expect(srt).toContain('1\n00:00:01,000 --> 00:00:05,000\nHello\n');
  });

  it('uses sequential numeric indexes', () => {
    const segs = [
      createSegment({ id: 'z', startMs: 0, endMs: 1000, translatedText: 'A' }),
      createSegment({ id: 'a', startMs: 1000, endMs: 2000, translatedText: 'B' }),
    ];
    const srt = generateSrtContent(segs);
    expect(srt).toContain('1\n');
    expect(srt).toContain('2\n');
    // Internal segment IDs should NOT appear
    expect(srt).not.toContain('id: z');
  });

  it('sorts segments by timing', () => {
    const segs = [
      createSegment({ id: 'b', startMs: 5000, endMs: 6000, translatedText: 'B' }),
      createSegment({ id: 'a', startMs: 0, endMs: 1000, translatedText: 'A' }),
    ];
    const srt = generateSrtContent(segs);
    const lines = srt.trim().split('\n');
    expect(lines[2]).toBe('A'); // First cue text
    expect(lines[6]).toBe('B'); // Second cue text
  });

  it('preserves line breaks within cue text', () => {
    const segs = [
      createSegment({ id: 's1', startMs: 0, endMs: 1000, translatedText: 'Line1\nLine2' }),
    ];
    const srt = generateSrtContent(segs);
    expect(srt).toContain('Line1\nLine2');
  });

  it('trims trailing blank lines from cue text', () => {
    const segs = [
      createSegment({ id: 's1', startMs: 0, endMs: 1000, translatedText: 'Hello\n\n' }),
    ];
    const srt = generateSrtContent(segs);
    // The cue should end with the text, not extra blank lines that would break SRT
    const cues = srt.split('\n\n');
    expect(cues[0]).toContain('Hello');
  });

  it('does not emit stray SRT blocks when translated text contains blank lines', () => {
    const segs = [
      createSegment({ id: 's1', startMs: 0, endMs: 1000, translatedText: 'Line A\n\nLine B' }),
      createSegment({ id: 's2', startMs: 1000, endMs: 2000, translatedText: 'Next' }),
    ];

    const srt = generateSrtContent(segs);
    const blocks = srt.trim().split('\n\n');

    expect(blocks).toHaveLength(2);
    for (const block of blocks) {
      const lines = block.split('\n');
      expect(lines[0]).toMatch(/^\d+$/);
      expect(lines[1]).toMatch(/^\d\d:\d\d:\d\d,\d\d\d --> \d\d:\d\d:\d\d,\d\d\d$/);
    }
    expect(srt).toContain('Line A\nLine B');
  });

  it('throws for invalid segments', () => {
    const segs = [createSegment({ startMs: 5000, endMs: 1000 })];
    expect(() => generateSrtContent(segs)).toThrow('Invalid segments');
  });
});

// ─── WebVTT Export ─────────────────────────────────────────────────

describe('generateVttContent', () => {
  it('generates valid WebVTT with header', () => {
    const segs = [createSegment({ id: 's1', startMs: 1000, endMs: 5000, translatedText: 'Hello' })];
    const vtt = generateVttContent(segs);
    expect(vtt.startsWith('WEBVTT\n')).toBe(true);
  });

  it('uses dot timestamp separator', () => {
    const segs = [createSegment({ id: 's1', startMs: 1000, endMs: 5000, translatedText: 'Hello' })];
    const vtt = generateVttContent(segs);
    expect(vtt).toContain('00:00:01.000 --> 00:00:05.000');
  });

  it('sorts segments by timing', () => {
    const segs = [
      createSegment({ id: 'b', startMs: 5000, endMs: 6000, translatedText: 'B' }),
      createSegment({ id: 'a', startMs: 0, endMs: 1000, translatedText: 'A' }),
    ];
    const vtt = generateVttContent(segs);
    const cues = vtt.split('\n\n').filter((c) => c.includes('-->'));
    expect(cues[0]).toContain('A');
    expect(cues[1]).toContain('B');
  });

  it('throws for invalid segments', () => {
    const segs = [createSegment({ startMs: 5000, endMs: 1000 })];
    expect(() => generateVttContent(segs)).toThrow('Invalid segments');
  });
});

describe('escapeVttCueText', () => {
  it('escapes the --> sequence', () => {
    expect(escapeVttCueText('A --> B')).toBe('A ==> B');
  });

  it('escapes HTML-like tags', () => {
    expect(escapeVttCueText('Hello <b>world</b>')).toBe('Hello &lt;b>world&lt;/b>');
  });

  it('leaves normal text unchanged', () => {
    expect(escapeVttCueText('Hello world')).toBe('Hello world');
  });
});

// ─── JSON Bundle Export ──────────────────────────────────────────

describe('generateJsonBundle', () => {
  it('generates valid JSON with required fields', () => {
    const artifact = createArtifact([
      createSegment({ id: 's1', startMs: 0, endMs: 1000, translatedText: 'Hello' }),
    ]);
    const entry = createEntry({ translatedArtifact: artifact });

    const json = generateJsonBundle(entry);
    const bundle = JSON.parse(json);

    expect(bundle.formatVersion).toBe(1);
    expect(bundle.videoId).toBe('12345');
    expect(bundle.sourceLanguage).toBe('en');
    expect(bundle.targetLanguage).toBe('zh-CN');
    expect(bundle.sourceSubtitleHash).toBe('a'.repeat(64));
    expect(bundle.exportTimestamp).toBeTypeOf('number');
    expect(bundle.segments).toHaveLength(1);
    expect(bundle.segments[0].id).toBe('s1');
    expect(bundle.segments[0].startMs).toBe(0);
    expect(bundle.segments[0].endMs).toBe(1000);
    expect(bundle.segments[0].translatedText).toBe('Hello');
  });

  it('includes optional metadata when available', () => {
    const artifact = createArtifact([
      createSegment({ id: 's1', startMs: 0, endMs: 1000, translatedText: 'Hello' }),
    ]);
    const entry = createEntry({
      translatedArtifact: artifact,
      videoTitle: 'My Movie',
      sourceSegmentCount: 5,
      translatedSegmentCount: 1,
      translationDebug: {
        videoId: '12345',
        model: 'deepseek-v4',
        segmentCount: 5,
        strategy: 'batch',
        updatedAt: 1700000000000,
      },
    });

    const json = generateJsonBundle(entry);
    const bundle = JSON.parse(json);

    expect(bundle.videoTitle).toBe('My Movie');
    expect(bundle.artifactMetadata.preparedAt).toBe(1700000000000);
    expect(bundle.artifactMetadata.provider).toBe('deepseek');
    expect(bundle.artifactMetadata.providerModel).toBe('deepseek-v4');
    expect(bundle.artifactMetadata.sourceSegmentCount).toBe(5);
    expect(bundle.artifactMetadata.translatedSegmentCount).toBe(1);
  });

  it('omits raw source payload', () => {
    const artifact = createArtifact([createSegment()]);
    const entry = createEntry({
      translatedArtifact: artifact,
      sourcePayload: '<tt>raw payload</tt>',
    });

    const json = generateJsonBundle(entry);
    const bundle = JSON.parse(json);

    expect(bundle.sourcePayload).toBeUndefined();
  });

  it('throws when no translated artifact exists', () => {
    const entry = createEntry({ translatedArtifact: undefined });
    expect(() => generateJsonBundle(entry)).toThrow('No translated artifact');
  });

  it('throws for invalid segments', () => {
    const artifact = createArtifact([createSegment({ startMs: 5000, endMs: 1000 })]);
    const entry = createEntry({ translatedArtifact: artifact });
    expect(() => generateJsonBundle(entry)).toThrow('Invalid segments');
  });
});

// ─── Export Eligibility ────────────────────────────────────────────

describe('checkExportEligibility', () => {
  it('approves translation-ready entries with valid artifact', () => {
    const artifact = createArtifact([createSegment()]);
    const entry = createEntry({ translatedArtifact: artifact });
    expect(checkExportEligibility(entry)).toEqual({ eligible: true });
  });

  it('rejects non-ready statuses', () => {
    const artifact = createArtifact([createSegment()]);
    const entry = createEntry({ status: 'preparing', translatedArtifact: artifact });
    expect(checkExportEligibility(entry)).toEqual({ eligible: false, reason: 'not-ready' });
  });

  it('rejects missing artifact', () => {
    const entry = createEntry({ translatedArtifact: undefined });
    expect(checkExportEligibility(entry)).toEqual({ eligible: false, reason: 'missing-artifact' });
  });

  it('rejects empty segments', () => {
    const artifact = createArtifact([]);
    const entry = createEntry({ translatedArtifact: artifact });
    expect(checkExportEligibility(entry)).toEqual({ eligible: false, reason: 'empty-segments' });
  });

  it('rejects invalid timing', () => {
    const artifact = createArtifact([createSegment({ startMs: 5000, endMs: 1000 })]);
    const entry = createEntry({ translatedArtifact: artifact });
    expect(checkExportEligibility(entry)).toEqual({ eligible: false, reason: 'invalid-timing' });
  });

  it('rejects timestamps too large for strict SRT export', () => {
    const artifact = createArtifact([createSegment({ startMs: 360_000_000, endMs: 360_001_000 })]);
    const entry = createEntry({ translatedArtifact: artifact });
    expect(checkExportEligibility(entry)).toEqual({ eligible: false, reason: 'invalid-timing' });
  });

  it('rejects empty translated text', () => {
    const artifact = createArtifact([createSegment({ translatedText: '' })]);
    const entry = createEntry({ translatedArtifact: artifact });
    expect(checkExportEligibility(entry)).toEqual({ eligible: false, reason: 'invalid-text' });
  });
});

// ─── Main Export Generation ──────────────────────────────────────

describe('generateExport', () => {
  it('generates SRT export for eligible entry', () => {
    const artifact = createArtifact([createSegment({ id: 's1', startMs: 0, endMs: 1000, translatedText: 'Hello' })]);
    const entry = createEntry({ translatedArtifact: artifact });

    const result = generateExport(entry, 'srt');
    expect(result.extension).toBe('srt');
    expect(result.mimeType).toBe('text/plain; charset=utf-8');
    expect(result.content).toContain('1\n00:00:00,000 --> 00:00:01,000\nHello\n');
    expect(result.filename).toMatch(/\.srt$/);
  });

  it('generates WebVTT export for eligible entry', () => {
    const artifact = createArtifact([createSegment({ id: 's1', startMs: 0, endMs: 1000, translatedText: 'Hello' })]);
    const entry = createEntry({ translatedArtifact: artifact });

    const result = generateExport(entry, 'webvtt');
    expect(result.extension).toBe('webvtt');
    expect(result.mimeType).toBe('text/vtt; charset=utf-8');
    expect(result.content.startsWith('WEBVTT\n')).toBe(true);
    expect(result.filename).toMatch(/\.webvtt$/);
  });

  it('generates JSON bundle export for eligible entry', () => {
    const artifact = createArtifact([createSegment({ id: 's1', startMs: 0, endMs: 1000, translatedText: 'Hello' })]);
    const entry = createEntry({ translatedArtifact: artifact });

    const result = generateExport(entry, 'json-bundle');
    expect(result.extension).toBe('json');
    expect(result.mimeType).toBe('application/json; charset=utf-8');
    const bundle = JSON.parse(result.content);
    expect(bundle.formatVersion).toBe(1);
    expect(result.filename).toMatch(/\.json$/);
  });

  it('throws for ineligible entry', () => {
    const entry = createEntry({ status: 'source-ready' });
    expect(() => generateExport(entry, 'srt')).toThrow('Export not eligible');
  });

  it('throws for unknown format', () => {
    const artifact = createArtifact([createSegment()]);
    const entry = createEntry({ translatedArtifact: artifact });
    expect(() => generateExport(entry, 'unknown' as any)).toThrow('Unknown export format');
  });

  it('generates deterministic SRT output', () => {
    const artifact = createArtifact([
      createSegment({ id: 's1', startMs: 0, endMs: 1000, translatedText: 'A' }),
      createSegment({ id: 's2', startMs: 1000, endMs: 2000, translatedText: 'B' }),
    ]);
    const entry = createEntry({ translatedArtifact: artifact });

    const first = generateExport(entry, 'srt');
    const second = generateExport(entry, 'srt');
    expect(first.content).toBe(second.content);
    expect(first.filename).toBe(second.filename);
  });

  it('generates deterministic WebVTT output', () => {
    const artifact = createArtifact([
      createSegment({ id: 's1', startMs: 0, endMs: 1000, translatedText: 'A' }),
    ]);
    const entry = createEntry({ translatedArtifact: artifact });

    const first = generateExport(entry, 'webvtt');
    const second = generateExport(entry, 'webvtt');
    expect(first.content).toBe(second.content);
  });
});
