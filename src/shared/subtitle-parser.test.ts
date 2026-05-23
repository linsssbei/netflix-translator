import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  parseTtml,
  parseSubtitlePayload,
  parseTtmlTime,
  generateTranslationInput,
} from '../shared/subtitle-parser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Helper to load fixture
function loadFixture(name: string): string {
  const path = resolve(__dirname, '../test/fixtures', name);
  return readFileSync(path, 'utf-8');
}

describe('parseTtmlTime', () => {
  it('parses hh:mm:ss.mmm format', () => {
    expect(parseTtmlTime('0:00:00.000')).toBe(0);
    expect(parseTtmlTime('0:00:01.000')).toBe(1000);
    expect(parseTtmlTime('0:01:00.000')).toBe(60000);
    expect(parseTtmlTime('1:00:00.000')).toBe(3600000);
    expect(parseTtmlTime('0:00:00.500')).toBe(500);
    expect(parseTtmlTime('0:00:01.123')).toBe(1123);
  });

  it('parses two-digit hours', () => {
    expect(parseTtmlTime('00:00:00.000')).toBe(0);
    expect(parseTtmlTime('00:01:30.450')).toBe(90450);
  });

  it('parses seconds with s suffix', () => {
    expect(parseTtmlTime('5s')).toBe(5000);
    expect(parseTtmlTime('5.5s')).toBe(5500);
    expect(parseTtmlTime('0.5s')).toBe(500);
    expect(parseTtmlTime('10S')).toBe(10000);
  });

  it('parses frame-based timing (25fps)', () => {
    // 00:00:00:00 at 25fps = 0ms
    expect(parseTtmlTime('00:00:00:00')).toBe(0);
    // 00:00:00:25 at 25fps = 1000ms (25 frames = 1 second)
    expect(parseTtmlTime('00:00:00:25')).toBe(1000);
    // 00:00:01:12 at 25fps = 1000ms + (12/25)*1000ms = 1480ms
    expect(parseTtmlTime('00:00:01:12')).toBe(1480);
  });

  it('parses raw milliseconds', () => {
    expect(parseTtmlTime('5000')).toBe(5000);
    expect(parseTtmlTime('0')).toBe(0);
  });

  it('returns 0 for invalid input', () => {
    expect(parseTtmlTime('')).toBe(0);
    expect(parseTtmlTime('invalid')).toBe(0);
    expect(parseTtmlTime('abc')).toBe(0);
  });
});

describe('parseTtml', () => {
  it('parses Netflix-style TTML with full structure', () => {
    const payload = loadFixture('netflix-ttml-sample.xml');
    const segments = parseTtml(payload);

    expect(segments).toHaveLength(6);

    // First segment
    expect(segments[0].startMs).toBe(0);
    expect(segments[0].endMs).toBe(5000);
    expect(segments[0].sourceText).toBe('Welcome to the show');

    // Second segment with inline span
    expect(segments[1].startMs).toBe(5000);
    expect(segments[1].endMs).toBe(10000);
    expect(segments[1].sourceText).toBe('This is important information');

    // Third segment with <br>
    expect(segments[2].startMs).toBe(10000);
    expect(segments[2].endMs).toBe(15000);
    expect(segments[2].sourceText).toBe('Line one\nLine two');

    // Fourth segment with dur attribute
    expect(segments[3].startMs).toBe(15000);
    expect(segments[3].endMs).toBe(20000);
    expect(segments[3].sourceText).toBe('Duration-based timing');

    // Fifth segment with frame-based timing
    expect(segments[4].startMs).toBe(20000);
    expect(segments[4].endMs).toBe(25000);
    expect(segments[4].sourceText).toBe('Frame-based timing');

    // Sixth segment with extra whitespace normalized
    expect(segments[5].startMs).toBe(25000);
    expect(segments[5].endMs).toBe(30000);
    expect(segments[5].sourceText).toBe('Extra spaces here');
  });

  it('parses minimal TTML with Japanese text', () => {
    const payload = loadFixture('minimal-ttml.xml');
    const segments = parseTtml(payload);

    expect(segments).toHaveLength(3);

    expect(segments[0].sourceText).toBe('こんにちは');
    expect(segments[0].startMs).toBe(0);
    expect(segments[0].endMs).toBe(3500);

    // Empty paragraph should be skipped
    expect(segments[1].sourceText).toBe('ありがとうございます');
    expect(segments[1].startMs).toBe(3500);
    expect(segments[1].endMs).toBe(7000);

    // Inline span flattened
    expect(segments[2].sourceText).toBe('テストです');
  });

  it('generates stable segment IDs based on index and timing', () => {
    const payload = loadFixture('minimal-ttml.xml');
    const segments = parseTtml(payload);

    expect(segments[0].id).toMatch(/^seg_\d+_\d+_\d+$/);
    expect(segments[0].id).toBe('seg_0_0_3500');
    expect(segments[1].id).toBe('seg_1_3500_7000');
  });

  it('sorts segments by start time', () => {
    // Deliberately out of order
    const payload = `<?xml version="1.0"?>
      <tt>
        <body>
          <div>
            <p begin="0:00:05.000" end="0:00:10.000">Second</p>
            <p begin="0:00:00.000" end="0:00:05.000">First</p>
            <p begin="0:00:10.000" end="0:00:15.000">Third</p>
          </div>
        </body>
      </tt>`;

    const segments = parseTtml(payload);
    expect(segments[0].sourceText).toBe('First');
    expect(segments[1].sourceText).toBe('Second');
    expect(segments[2].sourceText).toBe('Third');
  });

  it('throws when no paragraphs have timing attributes', () => {
    const payload = loadFixture('invalid-ttml.xml');

    // Both paragraphs lack valid timing, so parsing fails
    expect(() => parseTtml(payload)).toThrow('no timed paragraphs found');
  });

  it('throws on malformed XML', () => {
    expect(() => parseTtml('not xml at all << broken')).toThrow('XML parsing error');
  });

  it('throws on valid XML but no TTML structure', () => {
    expect(() => parseTtml('<html><body><p>No subtitles here</p></body></html>')).toThrow();
  });

  it('parses TTML with regex fallback when DOMParser unavailable', () => {
    const origParser = (globalThis as any).DOMParser;
    delete (globalThis as any).DOMParser;

    try {
      const payload = loadFixture('minimal-ttml.xml');
      const segments = parseTtml(payload);
      expect(segments).toHaveLength(3);
      expect(segments[0].sourceText).toBe('こんにちは');
      expect(segments[1].sourceText).toBe('ありがとうございます');
    } finally {
      (globalThis as any).DOMParser = origParser;
    }
  });

  it('returns empty array for empty payload', () => {
    expect(parseTtml('')).toEqual([]);
    expect(parseTtml('   ')).toEqual([]);
  });

  it('skips empty paragraphs', () => {
    const payload = `<?xml version="1.0"?>
      <tt>
        <body>
          <div>
            <p begin="0:00:00.000" end="0:00:05.000"></p>
            <p begin="0:00:05.000" end="0:00:10.000">  </p>
            <p begin="0:00:10.000" end="0:00:15.000">Valid text</p>
          </div>
        </body>
      </tt>`;

    const segments = parseTtml(payload);
    expect(segments).toHaveLength(1);
    expect(segments[0].sourceText).toBe('Valid text');
  });
});

describe('parseSubtitlePayload', () => {
  it('dispatches to TTML parser for ttml format', () => {
    const payload = loadFixture('minimal-ttml.xml');
    const segments = parseSubtitlePayload(payload, 'ttml');
    expect(segments).toHaveLength(3);
  });

  it('dispatches to TTML parser for dfxp format', () => {
    const payload = loadFixture('minimal-ttml.xml');
    const segments = parseSubtitlePayload(payload, 'dfxp');
    expect(segments).toHaveLength(3);
  });

  it('throws for unsupported formats', () => {
    expect(() => parseSubtitlePayload('anything', 'webvtt')).toThrow('Unsupported subtitle format');
    expect(() => parseSubtitlePayload('anything', 'srt')).toThrow('Unsupported subtitle format');
    expect(() => parseSubtitlePayload('anything', 'unknown')).toThrow('Unsupported subtitle format');
  });
});

describe('generateTranslationInput', () => {
  it('produces cleaned input with minimal metadata', () => {
    const segments = [
      {
        id: 'seg_0',
        startMs: 0,
        endMs: 5000,
        sourceText: 'Hello world',
        metadata: { color: 'white', position: 'bottom' },
      },
      {
        id: 'seg_1',
        startMs: 5000,
        endMs: 10000,
        sourceText: 'Second line',
        metadata: { style: 'bold' },
      },
    ];

    const input = generateTranslationInput(segments, 'zh-CN');

    expect(input.targetLanguage).toBe('zh-CN');
    expect(input.segments).toHaveLength(2);

    // Metadata should be stripped
    expect(input.segments[0]).toEqual({
      id: 'seg_0',
      startMs: 0,
      endMs: 5000,
      sourceText: 'Hello world',
    });
    expect(input.segments[1]).toEqual({
      id: 'seg_1',
      startMs: 5000,
      endMs: 10000,
      sourceText: 'Second line',
    });

    // Ensure metadata is not present
    expect((input.segments[0] as any).metadata).toBeUndefined();
  });

  it('handles empty segments array', () => {
    const input = generateTranslationInput([], 'zh-CN');
    expect(input.targetLanguage).toBe('zh-CN');
    expect(input.segments).toEqual([]);
  });

  it('preserves Unicode text', () => {
    const segments = [
      {
        id: 'seg_0',
        startMs: 0,
        endMs: 3000,
        sourceText: '日本語テスト',
      },
    ];

    const input = generateTranslationInput(segments, 'zh-CN');
    expect(input.segments[0].sourceText).toBe('日本語テスト');
  });
});
