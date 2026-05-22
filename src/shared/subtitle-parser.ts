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
 * Parse TTML (Timed Text Markup Language) XML payload into normalized segments
 * Netflix serves subtitles in TTML format
 */
export function parseTtml(payload: string): NormalizedSegment[] {
  if (!payload || payload.trim().length === 0) {
    return [];
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(payload, 'application/xml');

  // Check for parse errors
  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    throw new Error('Failed to parse TTML: XML parsing error');
  }

  // Find all paragraph elements - could be <p> in various namespaces
  // TTML uses <tt> root with <body> containing <div> containing <p>
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

    if (!beginAttr) {
      // Skip paragraphs without timing (could be header/metadata paragraphs)
      return;
    }

    const startMs = parseTtmlTime(beginAttr);
    let endMs: number;

    if (endAttr) {
      endMs = parseTtmlTime(endAttr);
    } else if (durAttr) {
      endMs = startMs + parseTtmlTime(durAttr);
    } else {
      // No end or duration - skip this segment
      return;
    }

    // Extract text, flattening inline elements
    const sourceText = extractParagraphText(p);

    if (!sourceText) {
      // Skip empty paragraphs
      return;
    }

    // Create a stable ID based on index and timing
    const id = `seg_${segIndex}_${startMs}_${endMs}`;
    segIndex++;

    segments.push({
      id,
      startMs,
      endMs,
      sourceText,
    });
  });

  if (segments.length === 0) {
    throw new Error('Failed to parse TTML: no timed paragraphs found');
  }

  // Sort by start time to ensure correct order
  segments.sort((a, b) => a.startMs - b.startMs);

  return segments;
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
