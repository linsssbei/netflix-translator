import type {
  SubtitleLibraryEntry,
  QualityDiagnostics,
} from './types';
import {
  getLibraryEntry,
  listAllEntries,
  removeEntry,
  removeEntriesForVideo,
} from './subtitle-library';

/**
 * Load full details for one library entry including parsed segments
 */
export async function loadEntryDetails(
  videoId: string,
  sourceLanguage: string,
  targetLanguage: string,
  sourceSubtitleHash: string
): Promise<{
  entry: SubtitleLibraryEntry;
  sourceSegments: Array<{ id: string; startMs: number; endMs: number; sourceText: string }>;
  translatedSegments: Array<{ id: string; startMs: number; endMs: number; translatedText: string }>;
} | null> {
  const entry = await getLibraryEntry(videoId, sourceLanguage, targetLanguage, sourceSubtitleHash);
  if (!entry) return null;

  // Parse source segments if payload is available
  let sourceSegments: Array<{ id: string; startMs: number; endMs: number; sourceText: string }> = [];
  if (entry.sourcePayload) {
    try {
      const { parseTtmlWithRegex } = await import('./subtitle-parser');
      const parsed = parseTtmlWithRegex(entry.sourcePayload);
      sourceSegments = parsed.map((s) => ({
        id: s.id,
        startMs: s.startMs,
        endMs: s.endMs,
        sourceText: s.sourceText,
      }));
    } catch {
      // Parsing failed, return empty source segments
    }
  }

  // Get translated segments: prefer artifact, fall back to partials
  const translatedSegments =
    entry.translatedArtifact?.segments ||
    entry.partialSegments ||
    [];

  return { entry, sourceSegments, translatedSegments };
}

/**
 * Compute quality diagnostics for a library entry
 */
export function computeQualityDiagnostics(entry: SubtitleLibraryEntry): QualityDiagnostics {
  const artifact = entry.translatedArtifact;
  const partials = entry.partialSegments;
  const sourceCount = entry.sourceSegmentCount || 0;
  const activeSegments = artifact?.segments || partials || [];
  const translatedCount = activeSegments.length || entry.translatedSegmentCount || 0;

  let missingCount = 0;
  let emptyCount = 0;

  if (sourceCount > 0) {
    missingCount = sourceCount - translatedCount;
    emptyCount = activeSegments.filter((s) => !s.translatedText?.trim()).length;
  }

  return {
    sourceSegmentCount: sourceCount,
    translatedSegmentCount: translatedCount,
    missingSegmentCount: Math.max(0, missingCount),
    emptyTranslationCount: emptyCount,
    isStale: entry.status === 'stale-translation',
    provider: artifact?.provider,
    providerModel: entry.translationDebug?.model,
    preparedAt: artifact?.preparedAt,
  };
}

export { listAllEntries, removeEntry, removeEntriesForVideo };
