import type { NormalizedSegment, CleanedTranslationInput } from './types';

/**
 * Parse a TTML time expression into milliseconds
 * Supports:
 * - hh:mm:ss.mmm (e.g., "0:00:00.000" or "00:00:00.000")
 * - hh:mm:ss:ff (frames, e.g., "00:00:00:00")
 * - mmmms (seconds with suffix, e.g., "5.5s")
 * - raw milliseconds as integer (e.g., "5000" -> 5000ms)
 * - ticks with explicit tick rate (e.g., "465882084t")
 */
export function parseTtmlTime(timeExpr: string, tickRate?: number): number {
  const trimmed = timeExpr.trim();

  // Seconds with 's' suffix (e.g., "5.5s", "10s")
  if (/^\d+\.?\d*s$/i.test(trimmed)) {
    return Math.round(parseFloat(trimmed.replace(/s$/i, '')) * 1000);
  }

  // Ticks with 't' suffix. TTML tick values require a document tickRate.
  if (/^\d+\.?\d*t$/i.test(trimmed)) {
    if (!tickRate || tickRate <= 0) return 0;
    return Math.round((parseFloat(trimmed.replace(/t$/i, '')) / tickRate) * 1000);
  }

  // Pure milliseconds as integer
  if (/^\d+$/.test(trimmed)) {
    return parseInt(trimmed, 10);
  }

  // hh:mm:ss.mmm or hh:mm:ss:ff
  const match = trimmed.match(/^(?:(\d+):)?(\d+):(\d+)(?:[.:](\d+))?$/);
  if (match) {
    const hours = parseInt(match[1] || '0', 10);
    const minutes = parseInt(match[2], 10);
    const seconds = parseInt(match[3], 10);
    const fraction = match[4] || '0';

    // Convert fraction to milliseconds
    // If fraction is 3 digits, it's milliseconds; if 2 digits, it's frames at 25fps
    let ms = 0;
    if (fraction.length === 3) {
      ms = parseInt(fraction, 10);
    } else if (fraction.length === 2) {
      // Frames at 25fps (common for TTML)
      ms = Math.round((parseInt(fraction, 10) / 25) * 1000);
    } else if (fraction.length > 0) {
      // Default: treat as milliseconds
      ms = parseInt(fraction, 10);
    }

    return ((hours * 60 + minutes) * 60 + seconds) * 1000 + ms;
  }

  return 0;
}

function extractTtmlTickRate(payload: string): number | undefined {
  const match = payload.match(/\b(?:ttp:)?tickRate\s*=\s*["'](\d+(?:\.\d+)?)["']/i);
  if (!match) return undefined;

  const tickRate = parseFloat(match[1]);
  return Number.isFinite(tickRate) && tickRate > 0 ? tickRate : undefined;
}

/**
 * Extract text content from a TTML paragraph element,
 * flattening inline elements like <span> and handling <br> as newlines
 */
function extractParagraphText(pElement: Element): string {
  const parts: string[] = [];

  function walkNodes(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent || '');
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      if (el.tagName.toLowerCase() === 'br') {
        parts.push('\n');
      } else {
        // Recursively process children (span, etc.)
        el.childNodes.forEach(walkNodes);
      }
    }
  }

  pElement.childNodes.forEach(walkNodes);

  const text = parts.join('');

  // Normalize whitespace: collapse multiple spaces, trim
  // But preserve newlines from <br>
  return text
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .join('\n')
    .trim();
}

/**
 * Parse TTML using regex (no DOM APIs) — works in service workers.
 * Extracts <p> elements with begin/end/dur attributes and text content.
 */
export function parseTtmlWithRegex(payload: string): NormalizedSegment[] {
  const tickRate = extractTtmlTickRate(payload);
  // Match <p> elements with timing attributes
  // Handles: <p begin="..." end="...">text</p> and <p begin="..." dur="...">text<span>more</span></p>
  const pRegex = /<p\b[^>]*\bbegin\s*=\s*["']([^"']*)["'][^>]*>([\s\S]*?)<\/p>/gi;
  const segments: NormalizedSegment[] = [];
  let segIndex = 0;
  let match;

  while ((match = pRegex.exec(payload)) !== null) {
    const beginAttr = match[1];
    const innerContent = match[2];
    const closingAngleBracket = match[0].indexOf('>');
    const openingTag = closingAngleBracket >= 0 ? match[0].substring(0, closingAngleBracket + 1) : match[0];

    const endMatch = openingTag.match(/\bend\s*=\s*["']([^"']*)["']/i);
    const durMatch = openingTag.match(/\bdur\s*=\s*["']([^"']*)["']/i);

    const startMs = parseTtmlTime(beginAttr, tickRate);
    let endMs: number;

    if (endMatch) {
      endMs = parseTtmlTime(endMatch[1], tickRate);
    } else if (durMatch) {
      endMs = startMs + parseTtmlTime(durMatch[1], tickRate);
    } else {
      continue; // No end or duration
    }

    // Extract text: strip all HTML tags
    const text = innerContent
      .replace(/<br\s*\/?>/gi, '\n')     // <br> → newline
      .replace(/<[^>]*>/g, '')             // strip remaining tags
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
      .replace(/&apos;/g, "'");

    const normalized = text
      .split('\n')
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .join('\n')
      .trim();

    if (!normalized) continue;

    segments.push({
      id: `seg_${segIndex}`,
      startMs,
      endMs,
      sourceText: normalized,
    });
    segIndex++;
  }

  if (segments.length === 0) {
    throw new Error('Failed to parse TTML: no timed paragraphs found');
  }

  segments.sort((a, b) => a.startMs - b.startMs);
  return segments;
}

export function parseTtmlWithDom(payload: string): NormalizedSegment[] {
  if (typeof DOMParser === 'undefined') {
    throw new Error('DOMParser not available');
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(payload, 'application/xml');

  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    throw new Error('Failed to parse TTML: XML parsing error');
  }

  const paragraphs = doc.querySelectorAll('p');

  if (paragraphs.length === 0) {
    throw new Error('Failed to parse TTML: no timed paragraphs found');
  }

  const segments: NormalizedSegment[] = [];
  const tickRateAttr =
    doc.documentElement.getAttribute('ttp:tickRate') ||
    doc.documentElement.getAttribute('tickRate');
  const parsedTickRate = tickRateAttr ? parseFloat(tickRateAttr) : NaN;
  const validTickRate = Number.isFinite(parsedTickRate) && parsedTickRate > 0 ? parsedTickRate : undefined;
  let segIndex = 0;

  paragraphs.forEach((p) => {
    const beginAttr = p.getAttribute('begin');
    const endAttr = p.getAttribute('end');
    const durAttr = p.getAttribute('dur');

    if (!beginAttr) return;

    const startMs = parseTtmlTime(beginAttr, validTickRate);
    let endMs: number;

    if (endAttr) {
      endMs = parseTtmlTime(endAttr, validTickRate);
    } else if (durAttr) {
      endMs = startMs + parseTtmlTime(durAttr, validTickRate);
    } else {
      return;
    }

    const sourceText = extractParagraphText(p);
    if (!sourceText) return;

    const id = `seg_${segIndex}`;
    segIndex++;

    segments.push({ id, startMs, endMs, sourceText });
  });

  if (segments.length === 0) {
    throw new Error('Failed to parse TTML: no timed paragraphs found');
  }

  segments.sort((a, b) => a.startMs - b.startMs);
  return segments;
}

export function parseTtml(payload: string): NormalizedSegment[] {
  if (!payload || payload.trim().length === 0) {
    return [];
  }
  return parseTtmlWithRegex(payload);
}

/**
 * Parse a subtitle payload based on its format
 * Currently supports: ttml, webvtt, srt
 * Returns normalized segments or throws on unsupported/invalid format
 */
export function parseSubtitlePayload(payload: string, format: string): NormalizedSegment[] {
  const lowerFormat = format.toLowerCase().trim();

  if (lowerFormat === 'ttml' || lowerFormat === 'dfxp') {
    return parseTtml(payload);
  }

  // TODO: Add WebVTT and SRT parsers in future tasks
  throw new Error(`Unsupported subtitle format: ${format}`);
}

/**
 * Generate cleaned translation input from normalized segments
 * Removes all styling/positioning metadata, keeping only:
 * - segment ID
 * - start time (ms)
 * - end time (ms)
 * - source text
 */
export function generateTranslationInput(
  segments: NormalizedSegment[],
  targetLanguage: string
): CleanedTranslationInput {
  return {
    targetLanguage,
    segments: segments.map((seg) => ({
      id: seg.id,
      startMs: seg.startMs,
      endMs: seg.endMs,
      sourceText: seg.sourceText,
    })),
  };
}
