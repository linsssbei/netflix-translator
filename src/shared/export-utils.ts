// Netflix Translator - Shared Export Utilities
// Pure formatting utilities for subtitle export. No browser APIs here.

import type {
  ExportFormat,
  ExportResult,
  ExportEligibility,
  JsonSubtitleBundle,
} from './export-types';
import type { SubtitleLibraryEntry } from './types';
import type { TranslatedSegment } from './types';

const MAX_STRICT_SUBTITLE_TIMESTAMP_MS = 99 * 60 * 60 * 1000 + 59 * 60 * 1000 + 59 * 1000 + 999;

// ─── Timestamp Formatting ──────────────────────────────────────────

/**
 * Format milliseconds as SRT timestamp: HH:MM:SS,mmm
 */
export function formatSrtTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const millis = ms % 1000;

  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  const mmm = String(millis).padStart(3, '0');

  return `${hh}:${mm}:${ss},${mmm}`;
}

/**
 * Format milliseconds as WebVTT timestamp: HH:MM:SS.mmm
 */
export function formatVttTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const millis = ms % 1000;

  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  const mmm = String(millis).padStart(3, '0');

  return `${hh}:${mm}:${ss}.${mmm}`;
}

// ─── Segment Validation & Ordering ────────────────────────────────

/**
 * Validate and order translated segments for export.
 * Returns sorted segments or null if validation fails.
 */
export function validateAndOrderSegments(
  segments: TranslatedSegment[]
): TranslatedSegment[] | null {
  if (!segments || segments.length === 0) return null;

  // Check for invalid timing
  for (const seg of segments) {
    if (
      typeof seg.startMs !== 'number' ||
      typeof seg.endMs !== 'number' ||
      isNaN(seg.startMs) ||
      isNaN(seg.endMs) ||
      seg.startMs < 0 ||
      seg.endMs < 0 ||
      seg.startMs > MAX_STRICT_SUBTITLE_TIMESTAMP_MS ||
      seg.endMs > MAX_STRICT_SUBTITLE_TIMESTAMP_MS ||
      seg.startMs >= seg.endMs
    ) {
      return null;
    }
  }

  // Check for empty translated text
  for (const seg of segments) {
    if (!seg.translatedText || seg.translatedText.trim().length === 0) {
      return null;
    }
  }

  // Sort by start time, then end time
  const sorted = [...segments].sort((a, b) => {
    if (a.startMs !== b.startMs) return a.startMs - b.startMs;
    return a.endMs - b.endMs;
  });

  return sorted;
}

// ─── Text Normalization ────────────────────────────────────────────

/**
 * Normalize subtitle text for generated file output.
 * - Normalize line endings to LF
 * - Trim unsafe surrounding whitespace
 * - Preserve readable multi-line text without blank lines that split cue blocks
 */
export function normalizeSubtitleText(text: string): string {
  // Normalize CRLF → LF
  let normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // Trim surrounding whitespace but preserve internal line breaks
  normalized = normalized.trim();
  // SRT and WebVTT use blank lines as cue separators, so blank lines inside
  // cue text create malformed stray blocks in strict subtitle parsers.
  normalized = normalized.replace(/\n[ \t]*(?:\n[ \t]*)+/g, '\n');
  return normalized;
}

// ─── Filename Sanitization ─────────────────────────────────────────

/**
 * Sanitize a string for use in a filename.
 * Removes/replaces characters that are unsafe in filenames.
 */
export function sanitizeFilenameComponent(text: string): string {
  // Replace unsafe characters with underscore
  // Keep alphanumeric, hyphen, underscore, space, and common safe punctuation
  return text
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100); // Cap length
}

/**
 * Generate a deterministic export filename.
 */
export function generateExportFilename(
  videoTitle: string | undefined,
  videoId: string,
  sourceLanguage: string,
  targetLanguage: string,
  sourceSubtitleHash: string,
  format: ExportFormat
): { filename: string; extension: string } {
  const safeTitle = videoTitle
    ? sanitizeFilenameComponent(videoTitle)
    : `video_${videoId}`;

  const hashPrefix = sourceSubtitleHash.slice(0, 8);
  const extension = format === 'json-bundle' ? 'json' : format;
  const filename = `${safeTitle}_${sourceLanguage}_${targetLanguage}_${hashPrefix}`;

  return { filename, extension };
}

// ─── SRT Export ────────────────────────────────────────────────────

/**
 * Generate SRT content from validated translated segments.
 */
export function generateSrtContent(segments: TranslatedSegment[]): string {
  const validated = validateAndOrderSegments(segments);
  if (!validated) throw new Error('Invalid segments for SRT export');

  const lines: string[] = [];
  for (let i = 0; i < validated.length; i++) {
    const seg = validated[i];
    const index = i + 1; // Sequential numeric index
    const start = formatSrtTimestamp(seg.startMs);
    const end = formatSrtTimestamp(seg.endMs);
    const text = normalizeSubtitleText(seg.translatedText);

    lines.push(String(index));
    lines.push(`${start} --> ${end}`);
    lines.push(text);
    lines.push(''); // Blank line between cues
  }

  return lines.join('\n').trimEnd() + '\n';
}

// ─── WebVTT Export ─────────────────────────────────────────────────

/**
 * Escape WebVTT cue text to avoid corrupting cue structure.
 * Handles the `-->` sequence and basic tag-like content.
 */
export function escapeVttCueText(text: string): string {
  let escaped = text;
  // Escape `-->` which is the cue timing separator
  escaped = escaped.replace(/-->/g, '==>');
  // Escape HTML-like tags that VTT might interpret as cue settings
  // We escape `<` followed by anything that looks like a tag
  escaped = escaped.replace(/</g, '&lt;');
  return escaped;
}

/**
 * Generate WebVTT content from validated translated segments.
 */
export function generateVttContent(segments: TranslatedSegment[]): string {
  const validated = validateAndOrderSegments(segments);
  if (!validated) throw new Error('Invalid segments for WebVTT export');

  const lines: string[] = ['WEBVTT', ''];

  for (const seg of validated) {
    const start = formatVttTimestamp(seg.startMs);
    const end = formatVttTimestamp(seg.endMs);
    const text = escapeVttCueText(normalizeSubtitleText(seg.translatedText));

    lines.push(`${start} --> ${end}`);
    lines.push(text);
    lines.push(''); // Blank line between cues
  }

  return lines.join('\n').trimEnd() + '\n';
}

// ─── JSON Bundle Export ────────────────────────────────────────────

/**
 * Generate a versioned JSON subtitle bundle from a library entry.
 */
export function generateJsonBundle(entry: SubtitleLibraryEntry): string {
  const artifact = entry.translatedArtifact;
  if (!artifact) throw new Error('No translated artifact for JSON bundle export');

  const validated = validateAndOrderSegments(artifact.segments);
  if (!validated) throw new Error('Invalid segments for JSON bundle export');

  const bundle: JsonSubtitleBundle = {
    formatVersion: 1,
    videoId: entry.videoId,
    videoTitle: entry.videoTitle,
    sourceLanguage: entry.sourceLanguage,
    targetLanguage: entry.targetLanguage,
    sourceSubtitleHash: entry.sourceSubtitleHash,
    exportTimestamp: Date.now(),
    artifactMetadata: {
      preparedAt: artifact.preparedAt,
      provider: artifact.provider,
      providerModel: entry.translationDebug?.model,
      sourceSegmentCount: entry.sourceSegmentCount,
      translatedSegmentCount: entry.translatedSegmentCount ?? validated.length,
    },
    segments: validated.map((seg) => ({
      id: seg.id,
      startMs: seg.startMs,
      endMs: seg.endMs,
      translatedText: seg.translatedText,
    })),
  };

  return JSON.stringify(bundle, null, 2) + '\n';
}

// ─── Export Eligibility Validation ───────────────────────────────

/**
 * Check whether a library entry is eligible for export.
 */
export function checkExportEligibility(entry: SubtitleLibraryEntry): ExportEligibility {
  // Must have translation-ready status
  if (entry.status !== 'translation-ready') {
    return { eligible: false, reason: 'not-ready' };
  }

  // Must have a translated artifact
  if (!entry.translatedArtifact) {
    return { eligible: false, reason: 'missing-artifact' };
  }

  const segments = entry.translatedArtifact.segments;

  // Must have segments
  if (!segments || segments.length === 0) {
    return { eligible: false, reason: 'empty-segments' };
  }

  // Validate timing
  for (const seg of segments) {
    if (
      typeof seg.startMs !== 'number' ||
      typeof seg.endMs !== 'number' ||
      isNaN(seg.startMs) ||
      isNaN(seg.endMs) ||
      seg.startMs < 0 ||
      seg.endMs < 0 ||
      seg.startMs > MAX_STRICT_SUBTITLE_TIMESTAMP_MS ||
      seg.endMs > MAX_STRICT_SUBTITLE_TIMESTAMP_MS ||
      seg.startMs >= seg.endMs
    ) {
      return { eligible: false, reason: 'invalid-timing' };
    }
  }

  // Validate text
  for (const seg of segments) {
    if (!seg.translatedText || seg.translatedText.trim().length === 0) {
      return { eligible: false, reason: 'invalid-text' };
    }
  }

  return { eligible: true };
}

// ─── Main Export Generation ────────────────────────────────────────

const MIME_TYPES: Record<ExportFormat, string> = {
  srt: 'text/plain; charset=utf-8',
  webvtt: 'text/vtt; charset=utf-8',
  'json-bundle': 'application/json; charset=utf-8',
};

/**
 * Generate an export file from a library entry.
 * Returns { filename, mimeType, extension, content }.
 * Throws if the entry is not eligible or content generation fails.
 */
export function generateExport(entry: SubtitleLibraryEntry, format: ExportFormat): ExportResult {
  const eligibility = checkExportEligibility(entry);
  if (!eligibility.eligible) {
    throw new Error(`Export not eligible: ${eligibility.reason}`);
  }

  const artifact = entry.translatedArtifact!;
  const { filename: baseName, extension } = generateExportFilename(
    entry.videoTitle,
    entry.videoId,
    entry.sourceLanguage,
    entry.targetLanguage,
    entry.sourceSubtitleHash,
    format
  );

  let content: string;
  switch (format) {
    case 'srt':
      content = generateSrtContent(artifact.segments);
      break;
    case 'webvtt':
      content = generateVttContent(artifact.segments);
      break;
    case 'json-bundle':
      content = generateJsonBundle(entry);
      break;
    default:
      throw new Error(`Unknown export format: ${format}`);
  }

  return {
    filename: `${baseName}.${extension}`,
    mimeType: MIME_TYPES[format],
    extension,
    content,
  };
}
