import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  parseTtml,
  parseTtmlWithRegex,
  parseTtmlWithDom,
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

  it('parses tick-based timing with an explicit tick rate', () => {
    expect(parseTtmlTime('465882084t', 10_000_000)).toBe(46588);
    expect(parseTtmlTime('50000000t', 10_000_000)).toBe(5000);
  });

  it('returns 0 for invalid input', () => {
    expect(parseTtmlTime('')).toBe(0);
    expect(parseTtmlTime('invalid')).toBe(0);
    expect(parseTtmlTime('abc')).toBe(0);
    expect(parseTtmlTime('465882084t')).toBe(0);
    expect(parseTtmlTime('123abc')).toBe(0);
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

  it('generates stable segment IDs based on index', () => {
    const payload = loadFixture('minimal-ttml.xml');
    const segments = parseTtml(payload);

    expect(segments[0].id).toMatch(/^seg_\d+$/);
    expect(segments[0].id).toBe('seg_0');
    expect(segments[1].id).toBe('seg_1');
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

  it('uses TTML tickRate for tick-based begin and end values', () => {
    const payload = `<?xml version="1.0"?>
      <tt xmlns:ttp="http://www.w3.org/ns/ttml#parameter" ttp:tickRate="10000000">
        <body>
          <div>
            <p begin="465882084t" end="485882084t">Tick timed text</p>
          </div>
        </body>
      </tt>`;

    const segments = parseTtml(payload);

    expect(segments).toHaveLength(1);
    expect(segments[0].startMs).toBe(46588);
    expect(segments[0].endMs).toBe(48588);
  });

  it('throws when no paragraphs have timing attributes', () => {
    const payload = loadFixture('invalid-ttml.xml');

    // Both paragraphs lack valid timing, so parsing fails
    expect(() => parseTtml(payload)).toThrow('no timed paragraphs found');
  });

  it('throws on malformed TTML payload', () => {
    expect(() => parseTtml('not xml at all << broken')).toThrow('no timed paragraphs found');
  });

  it('throws on valid XML but no TTML structure', () => {
    expect(() => parseTtml('<html><body><p>No subtitles here</p></body></html>')).toThrow();
  });

  it('always uses regex parser regardless of DOMParser availability', () => {
    const origParser = (globalThis as any).DOMParser;
    const payload = loadFixture('minimal-ttml.xml');

    const withDom = parseTtml(payload);

    delete (globalThis as any).DOMParser;
    const withoutDom = parseTtml(payload);

    expect(withDom).toEqual(withoutDom);
    expect(withDom).toHaveLength(3);
    expect(withDom[0].sourceText).toBe('こんにちは');

    (globalThis as any).DOMParser = origParser;
  });

  it('exposes a service-worker-safe TTML parser that does not need DOMParser', () => {
    const origParser = (globalThis as any).DOMParser;
    delete (globalThis as any).DOMParser;

    try {
      const payload = loadFixture('minimal-ttml.xml');
      const segments = parseTtmlWithRegex(payload);
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

describe('TTML parser parity', () => {
  const payloads = [
    {
      name: 'basic timing',
      xml: `<tt xmlns="http://www.w3.org/ns/ttml"><body><div><p begin="0:00:01.000" end="0:00:04.000">Hello</p></div></body></tt>`,
    },
    {
      name: 'br and span',
      xml: `<tt xmlns="http://www.w3.org/ns/ttml"><body><div><p begin="0:00:01.000" end="0:00:04.000">Line one<br/>Line <span>two</span></p></div></body></tt>`,
    },
    {
      name: 'dur attribute',
      xml: `<tt xmlns="http://www.w3.org/ns/ttml"><body><div><p begin="0:00:15.000" dur="5.000s">Duration</p></div></body></tt>`,
    },
    {
      name: 'tick rate',
      xml: `<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttp="http://www.w3.org/ns/ttml#parameter" ttp:tickRate="10000000"><body><div><p begin="465882084t" end="485882084t">Ticks</p></div></body></tt>`,
    },
    {
      name: 'named entities',
      xml: `<tt xmlns="http://www.w3.org/ns/ttml"><body><div><p begin="0:00:01.000" end="0:00:04.000">Rock &amp; Roll &lt;music&gt; &quot;quotes&quot; &apos;apostrophe&apos;</p></div></body></tt>`,
    },
    {
      name: 'numeric entities',
      xml: `<tt xmlns="http://www.w3.org/ns/ttml"><body><div><p begin="0:00:01.000" end="0:00:04.000">Non&#8208;break&#x2014;dash</p></div></body></tt>`,
    },
  ];

  for (const { name, xml } of payloads) {
    it(`produces identical output for ${name}`, () => {
      const regexResult = parseTtmlWithRegex(xml);
      const domResult = parseTtmlWithDom(xml);
      expect(regexResult).toHaveLength(domResult.length);
      for (let i = 0; i < domResult.length; i++) {
        expect(regexResult[i].startMs).toBe(domResult[i].startMs);
        expect(regexResult[i].endMs).toBe(domResult[i].endMs);
        expect(regexResult[i].sourceText).toBe(domResult[i].sourceText);
      }
    });
  }

  it('produces identical output for netflix-ttml-sample.xml fixture', () => {
    const payload = loadFixture('netflix-ttml-sample.xml');
    const regexResult = parseTtmlWithRegex(payload);
    const domResult = parseTtmlWithDom(payload);
    expect(regexResult).toHaveLength(domResult.length);
    for (let i = 0; i < domResult.length; i++) {
      expect(regexResult[i].startMs).toBe(domResult[i].startMs);
      expect(regexResult[i].endMs).toBe(domResult[i].endMs);
      expect(regexResult[i].sourceText).toBe(domResult[i].sourceText);
    }
  });

  it('produces identical output for minimal-ttml.xml fixture', () => {
    const payload = loadFixture('minimal-ttml.xml');
    const regexResult = parseTtmlWithRegex(payload);
    const domResult = parseTtmlWithDom(payload);
    expect(regexResult).toHaveLength(domResult.length);
    for (let i = 0; i < domResult.length; i++) {
      expect(regexResult[i].startMs).toBe(domResult[i].startMs);
      expect(regexResult[i].endMs).toBe(domResult[i].endMs);
      expect(regexResult[i].sourceText).toBe(domResult[i].sourceText);
    }
  });
});

describe('parseTtmlWithRegex entity decoding', () => {
  it('decodes named entities', () => {
    const payload = `<tt><body><div><p begin="0:00:01.000" end="0:00:04.000">Rock &amp; Roll &lt;music&gt; &quot;quotes&quot; &apos;apostrophe&apos;</p></div></body></tt>`;
    const segments = parseTtmlWithRegex(payload);
    expect(segments[0].sourceText).toBe(`Rock & Roll <music> "quotes" 'apostrophe'`);
  });

  it('decodes numeric character references', () => {
    const payload = `<tt><body><div><p begin="0:00:01.000" end="0:00:04.000">Non&#8208;break&#x2014;dash</p></div></body></tt>`;
    const segments = parseTtmlWithRegex(payload);
    expect(segments[0].sourceText).toBe('Non\u2010break\u2014dash');
  });

  it('decodes &#39; as apostrophe', () => {
    const payload = `<tt><body><div><p begin="0:00:01.000" end="0:00:04.000">It&#39;s fine</p></div></body></tt>`;
    const segments = parseTtmlWithRegex(payload);
    expect(segments[0].sourceText).toBe("It's fine");
  });

  it('decodes &#160; as non-breaking space (normalized to space)', () => {
    const payload = `<tt><body><div><p begin="0:00:01.000" end="0:00:04.000">A&#160;B</p></div></body></tt>`;
    const segments = parseTtmlWithRegex(payload);
    expect(segments[0].sourceText).toBe('A B');
  });

  it('decodes &#x2014; as em dash', () => {
    const payload = `<tt><body><div><p begin="0:00:01.000" end="0:00:04.000">End&#x2014;dash</p></div></body></tt>`;
    const segments = parseTtmlWithRegex(payload);
    expect(segments[0].sourceText).toBe('End\u2014dash');
  });
});

describe('parseTtmlWithRegex fixture coverage', () => {
  it('handles <br>, <br/>, and <br /> variations', () => {
    const br = `<tt><body><div><p begin="0:00:01.000" end="0:00:04.000">Line one<br>Line two</p></div></body></tt>`;
    const brSlash = `<tt><body><div><p begin="0:00:01.000" end="0:00:04.000">Line one<br/>Line two</p></div></body></tt>`;
    const brSpace = `<tt><body><div><p begin="0:00:01.000" end="0:00:04.000">Line one<br />Line two</p></div></body></tt>`;

    expect(parseTtmlWithRegex(br)[0].sourceText).toBe('Line one\nLine two');
    expect(parseTtmlWithRegex(brSlash)[0].sourceText).toBe('Line one\nLine two');
    expect(parseTtmlWithRegex(brSpace)[0].sourceText).toBe('Line one\nLine two');
  });

  it('handles nested span elements', () => {
    const payload = `<tt><body><div><p begin="0:00:01.000" end="0:00:04.000">Hello <span>wor<span>ld</span></span> end</p></div></body></tt>`;
    const segments = parseTtmlWithRegex(payload);
    expect(segments[0].sourceText).toBe('Hello world end');
  });

  it('handles tick rate timing', () => {
    const payload = `<tt xmlns:ttp="http://www.w3.org/ns/ttml#parameter" ttp:tickRate="10000000"><body><div><p begin="465882084t" end="485882084t">Ticks</p></div></body></tt>`;
    const segments = parseTtmlWithRegex(payload);
    expect(segments).toHaveLength(1);
    expect(segments[0].startMs).toBe(46588);
    expect(segments[0].endMs).toBe(48588);
  });

  it('handles dur attribute as alternative to end', () => {
    const payload = `<tt><body><div><p begin="0:00:15.000" dur="5.000s">Duration</p></div></body></tt>`;
    const segments = parseTtmlWithRegex(payload);
    expect(segments[0].startMs).toBe(15000);
    expect(segments[0].endMs).toBe(20000);
  });

  it('handles TTML with default namespace', () => {
    const payload = `<tt xmlns="http://www.w3.org/ns/ttml"><body><div><p begin="0:00:01.000" end="0:00:04.000">Namespaced</p></div></body></tt>`;
    const segments = parseTtmlWithRegex(payload);
    expect(segments).toHaveLength(1);
    expect(segments[0].sourceText).toBe('Namespaced');
  });

  it('throws on malformed TTML payloads', () => {
    expect(() => parseTtmlWithRegex('not xml at all << broken')).toThrow('no timed paragraphs found');
    expect(() => parseTtmlWithRegex('<html><body><p>No subtitles here</p></body></html>')).toThrow('no timed paragraphs found');
  });
});

describe('parseTtml with DOMParser unavailable (Netflix payload shapes)', () => {
  const origParser = (globalThis as any).DOMParser;

  beforeEach(() => {
    delete (globalThis as any).DOMParser;
  });

  afterEach(() => {
    (globalThis as any).DOMParser = origParser;
  });

  const netflixPayloads = [
    {
      name: 'basic timing with hh:mm:ss.mmm',
      xml: `<tt><body><div><p begin="0:00:01.500" end="0:00:04.200">Basic timing</p></div></body></tt>`,
      expectedText: 'Basic timing',
      expectedStart: 1500,
      expectedEnd: 4200,
    },
    {
      name: 'br line breaks',
      xml: `<tt><body><div><p begin="0:00:01.000" end="0:00:04.000">Line one<br/>Line two</p></div></body></tt>`,
      expectedText: 'Line one\nLine two',
    },
    {
      name: 'nested span elements',
      xml: `<tt><body><div><p begin="0:00:01.000" end="0:00:04.000">Hello <span style="color:yellow">world</span> end</p></div></body></tt>`,
      expectedText: 'Hello world end',
    },
    {
      name: 'dur attribute instead of end',
      xml: `<tt><body><div><p begin="0:00:15.000" dur="5.000s">Duration-based</p></div></body></tt>`,
      expectedText: 'Duration-based',
      expectedStart: 15000,
      expectedEnd: 20000,
    },
    {
      name: 'tick-based timing',
      xml: `<tt xmlns:ttp="http://www.w3.org/ns/ttml#parameter" ttp:tickRate="10000000"><body><div><p begin="465882084t" end="485882084t">Tick timed</p></div></body></tt>`,
      expectedStart: 46588,
      expectedEnd: 48588,
    },
    {
      name: 'apos entity',
      xml: `<tt><body><div><p begin="0:00:01.000" end="0:00:04.000">It&apos;s a test</p></div></body></tt>`,
      expectedText: "It's a test",
    },
    {
      name: 'numeric character reference &#NNN;',
      xml: `<tt><body><div><p begin="0:00:01.000" end="0:00:04.000">Non&#8208;break</p></div></body></tt>`,
      expectedText: 'Non\u2010break',
    },
    {
      name: 'hex character reference &#xHHH;',
      xml: `<tt><body><div><p begin="0:00:01.000" end="0:00:04.000">Dash&#x2014;mark</p></div></body></tt>`,
      expectedText: 'Dash\u2014mark',
    },
    {
      name: 'multiple paragraphs',
      xml: `<tt><body><div><p begin="0:00:01.000" end="0:00:03.000">First</p><p begin="0:00:03.000" end="0:00:06.000">Second</p><p begin="0:00:06.000" end="0:00:09.000">Third</p></div></body></tt>`,
      expectedCount: 3,
    },
    {
      name: 'end attribute on nested span does not affect paragraph end',
      xml: `<tt><body><div><p begin="0:00:01.000" end="0:00:04.000">Text <span end="0:00:02.000">with nested end</span></p></div></body></tt>`,
      expectedCount: 1,
      expectedStart: 1000,
      expectedEnd: 4000,
      expectedText: 'Text with nested end',
    },
  ];

  for (const { name, xml, expectedText, expectedStart, expectedEnd, expectedCount } of netflixPayloads) {
    it(`parses ${name} without DOMParser`, () => {
      const segments = parseTtml(xml);
      expect(segments.length).toBeGreaterThan(0);
      if (expectedCount !== undefined) {
        expect(segments).toHaveLength(expectedCount);
      }
      if (expectedText !== undefined) {
        expect(segments[0].sourceText).toBe(expectedText);
      }
      if (expectedStart !== undefined) {
        expect(segments[0].startMs).toBe(expectedStart);
      }
      if (expectedEnd !== undefined) {
        expect(segments[0].endMs).toBe(expectedEnd);
      }
    });
  }
});
