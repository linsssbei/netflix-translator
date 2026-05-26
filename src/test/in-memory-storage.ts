import type {
  SubtitleLibraryEntry,
  TranslatedSegment,
  TranslationProgressInfo,
} from '../shared/types';

/**
 * In-memory storage adapter for translator integration tests.
 * Replaces chrome.storage.local with a simple Map-based store.
 */
export class InMemoryStorageAdapter {
  private store = new Map<string, SubtitleLibraryEntry>();

  private buildKey(
    videoId: string,
    sourceLanguage: string,
    targetLanguage: string,
    sourceSubtitleHash: string
  ): string {
    return `${videoId}:${sourceLanguage}:${targetLanguage}:${sourceSubtitleHash}`;
  }

  async saveSourceSubtitle(
    entry: SubtitleLibraryEntry
  ): Promise<void> {
    this.store.set(entry.key, { ...entry });
  }

  async saveTranslatedArtifact(
    videoId: string,
    sourceLanguage: string,
    targetLanguage: string,
    sourceSubtitleHash: string,
    artifact: SubtitleLibraryEntry['translatedArtifact']
  ): Promise<void> {
    const key = this.buildKey(videoId, sourceLanguage, targetLanguage, sourceSubtitleHash);
    const existing = this.store.get(key);
    if (!existing) {
      throw new Error(`No library entry found for key: ${key}`);
    }
    existing.status = 'translation-ready';
    existing.translatedArtifact = artifact;
    existing.updatedAt = Date.now();
    this.store.set(key, { ...existing });
  }

  async updatePartialArtifact(
    videoId: string,
    sourceLanguage: string,
    targetLanguage: string,
    sourceSubtitleHash: string,
    partialSegments: TranslatedSegment[],
    progress: TranslationProgressInfo,
    errorMessage?: string
  ): Promise<void> {
    const key = this.buildKey(videoId, sourceLanguage, targetLanguage, sourceSubtitleHash);
    const existing = this.store.get(key);
    if (!existing) {
      throw new Error(`No library entry found for key: ${key}`);
    }
    existing.translationProgress = progress;
    existing.partialSegments = partialSegments;
    existing.updatedAt = Date.now();
    if (errorMessage) {
      existing.errorMessage = errorMessage;
    }
    this.store.set(key, { ...existing });
  }

  async updatePreparationStatus(
    videoId: string,
    sourceLanguage: string,
    targetLanguage: string,
    sourceSubtitleHash: string,
    status: SubtitleLibraryEntry['status'],
    errorMessage?: string
  ): Promise<void> {
    const key = this.buildKey(videoId, sourceLanguage, targetLanguage, sourceSubtitleHash);
    const existing = this.store.get(key);
    if (!existing) {
      throw new Error(`No library entry found for key: ${key}`);
    }
    existing.status = status;
    existing.updatedAt = Date.now();
    if (errorMessage) {
      existing.errorMessage = errorMessage;
    }
    this.store.set(key, { ...existing });
  }

  async getEntry(
    videoId: string,
    sourceLanguage: string,
    targetLanguage: string,
    sourceSubtitleHash: string
  ): Promise<SubtitleLibraryEntry | null> {
    const key = this.buildKey(videoId, sourceLanguage, targetLanguage, sourceSubtitleHash);
    return this.store.get(key) || null;
  }

  async getAllEntries(): Promise<SubtitleLibraryEntry[]> {
    return Array.from(this.store.values());
  }

  async getEntriesForVideo(videoId: string): Promise<SubtitleLibraryEntry[]> {
    return Array.from(this.store.values()).filter((e) => e.videoId === videoId);
  }

  clear(): void {
    this.store.clear();
  }
}
