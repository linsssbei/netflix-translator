import type { NormalizedSegment, CleanedTranslationInput } from './types';

/**
 * Parse a TTML time expression into milliseconds
 * Supports:
 * - hh:mm:ss.mmm (e.g., "0:00:00.000" or "00:00:00.000")
 * - hh:mm:ss:ff (frames, e.g., "00:00:00:00")
 * - mmmms (seconds with suffix, e.g., "5.5s")
 * - mmmms (integer seconds without suffix: "5000" -> 5000ms)
 */
export function parseTtmlTime(timeExpr: string): number {
  const trimmed = timeExpr.trim();

  // Seconds with 's' suffix (e.g., "5.5s", "10s")
  if (/^\d+\.?\d*s$/i.test(trimmed)) {
    return Math.round(parseFloat(trimmed.replace(/s$/i, '')) * 1000);
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

  // Try parsing as float seconds
  const floatSeconds = parseFloat(trimmed);
  if (!isNaN(floatSeconds) && floatSeconds > 0) {
    return Math.round(floatSeconds * 1000);
  }

  return 0;
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
function parseTtmlWithRegex(payload: string): NormalizedSegment[] {
  // Match <p> elements with timing attributes
  // Handles: <p begin="..." end="...">text</p> and <p begin="..." dur="...">text<span>more</span></p>
  const pRegex = /<p\b[^>]*\bbegin\s*=\s*["']([^"']*)["'][^>]*>([\s\S]*?)<\/p>/gi;
  const segments: NormalizedSegment[] = [];
  let segIndex = 0;
  let match;

  while ((match = pRegex.exec(payload)) !== null) {
    const beginAttr = match[1];
    const innerContent = match[2];
    const fullTag = match[0];

    // Extract end attribute from the opening tag
    const endMatch = fullTag.match(/\bend\s*=\s*["']([^"']*)["']/i);
    const durMatch = fullTag.match(/\bdur\s*=\s*["']([^"']*)["']/i);

    const startMs = parseTtmlTime(beginAttr);
    let endMs: number;

    if (endMatch) {
      endMs = parseTtmlTime(endMatch[1]);
    } else if (durMatch) {
      endMs = startMs + parseTtmlTime(durMatch[1]);
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
      .replace(/&#39;/g, "'");

    const normalized = text
      .split('\n')
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .join('\n')
      .trim();

    if (!normalized) continue;

    segments.push({
      id: `seg_${segIndex}_${startMs}_${endMs}`,
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

/**
 * Parse TTML (Timed Text Markup Language) XML payload into normalized segments
 * Netflix serves subtitles in TTML format.
 * Uses DOMParser when available (browser), falls back to regex (service worker).
 */
export function parseTtml(payload: string): NormalizedSegment[] {
  if (!payload || payload.trim().length === 0) {
    return [];
  }

  // Use DOMParser if available (content script / browser context)
  if (typeof DOMParser !== 'undefined') {
    const parser = new DOMParser();
    const doc = parser.parseFromString(payload, 'application/xml');

    // Check for parse errors
    const parserError = doc.querySelector('parsererror');
    if (parserError) {
      throw new Error('Failed to parse TTML: XML parsing error');
    }

    // Find all paragraph elements
    const paragraphs = doc.querySelectorAll('p');

    if (paragraphs.length === 0) {
      throw new Error('Failed to parse TTML: no timed paragraphs found');
    }

    const segments: NormalizedSegment[] = [];
    let segIndex = 0;

    paragraphs.forEach((p) => {
      const beginAttr = p.getAttribute('begin');
      const endAttr = p.getAttribute('end');
      const durAttr = p.getAttribute('dur');

      if (!beginAttr) return;

      const startMs = parseTtmlTime(beginAttr);
      let endMs: number;

      if (endAttr) {
        endMs = parseTtmlTime(endAttr);
      } else if (durAttr) {
        endMs = startMs + parseTtmlTime(durAttr);
      } else {
        return;
      }

      const sourceText = extractParagraphText(p);
      if (!sourceText) return;

      const id = `seg_${segIndex}_${startMs}_${endMs}`;
      segIndex++;

      segments.push({ id, startMs, endMs, sourceText });
    });

    if (segments.length === 0) {
      throw new Error('Failed to parse TTML: no timed paragraphs found');
    }

    segments.sort((a, b) => a.startMs - b.startMs);
    return segments;
  }

  // Fallback: regex-based parser for environments without DOM (e.g., service worker)
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
