import type { SubtitleResource } from '../shared/types';

/**
 * Subtitle format detection from payload content
 */
export function detectSubtitleFormat(payload: string, contentType: string): string {
  const ct = contentType.toLowerCase();

  // Check content type first
  if (ct.includes('vtt')) return 'webvtt';
  if (ct.includes('ttml')) return 'ttml';
  if (ct.includes('srt')) return 'srt';
  if (ct.includes('dfxp')) return 'dfxp';

  // Check payload content
  const trimmed = payload.trim().substring(0, 100).toLowerCase();

  if (trimmed.startsWith('webvtt') || trimmed.includes('webvtt')) return 'webvtt';
  if (trimmed.includes('<?xml') || trimmed.includes('<tt')) return 'ttml';
  if (trimmed.includes('-->')) return 'srt';
  if (trimmed.includes('<?xml') && trimmed.includes('dfxp')) return 'dfxp';

  // Check if it's JSON (Netflix might use JSON format)
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json';

  return 'unknown';
}

/**
 * Validate that a payload looks like actual subtitle data
 */
export function isValidSubtitlePayload(payload: string): boolean {
  if (!payload || payload.length < 10) return false;

  const trimmed = payload.trim().substring(0, 200).toLowerCase();

  // Must contain timing information or subtitle markers
  const hasTiming = /\d{2}:\d{2}:\d{2}/.test(payload) || // SRT/WebVTT timing
    /\d+:\d{2}/.test(payload); // Short timing

  const hasMarkers = trimmed.includes('-->') || // SRT
    trimmed.includes('webvtt') || // WebVTT
    trimmed.includes('<?xml') || // TTML/DFXP
    trimmed.includes('<p ') || // TTML paragraphs
    (trimmed.startsWith('{') && trimmed.includes('text')); // JSON subtitle format

  return hasTiming || hasMarkers;
}

/**
 * Compute SHA-256 hash of string content
 */
export async function computeContentHash(payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(payload);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Attempt to re-fetch a subtitle resource from the extension context
 * This is the "primary" acquisition method
 */
export async function refetchSubtitle(
  url: string,
  timeoutMs = 5000
): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      // Important: Include credentials so Netflix session cookies are sent
      credentials: 'include',
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(`[Subtitle Acquisition] Re-fetch failed: ${response.status} ${response.statusText}`);
      return null;
    }

    const text = await response.text();
    return text;
  } catch (err) {
    clearTimeout(timeout);
    console.warn('[Subtitle Acquisition] Re-fetch error:', err);
    return null;
  }
}

/**
 * Create a SubtitleResource from discovered data
 */
export async function createSubtitleResource(
  url: string,
  contentType: string,
  payload: string,
  videoId: string | null,
  acquisitionMethod: 'refetch' | 'page-world-clone'
): Promise<SubtitleResource> {
  const format = detectSubtitleFormat(payload, contentType);
  const contentHash = await computeContentHash(payload);

  return {
    id: `${videoId || 'unknown'}_${Date.now()}`,
    videoId: videoId || 'unknown',
    sourceLanguage: 'unknown', // Will be updated later if detectable
    format: format as any,
    url,
    acquisitionMethod,
    discoveredAt: Date.now(),
    contentHash,
  };
}
