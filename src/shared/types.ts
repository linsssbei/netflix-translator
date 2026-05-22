// Netflix Translator - Shared TypeScript Models
// Domain models used across the extension

/**
 * Represents a uniquely identified Netflix video
 */
export interface VideoIdentity {
  /** Netflix video ID extracted from watch URL */
  videoId: string;
  /** Current watch page URL */
  url: string;
  /** Timestamp when the video was detected */
  detectedAt: number;
}

/**
 * Supported subtitle formats
 */
export type SubtitleFormat = 'webvtt' | 'ttml' | 'srt' | 'dfxp' | 'unknown';

/**
 * A discovered subtitle resource for a video
 */
export interface SubtitleResource {
  /** Unique identifier for this resource */
  id: string;
  /** Associated video ID */
  videoId: string;
  /** Source language code (e.g., 'en', 'ja') */
  sourceLanguage: string;
  /** Detected subtitle format */
  format: SubtitleFormat;
  /** URL where the subtitle can be retrieved */
  url: string;
  /** HTTP request context (headers, cookies) needed for re-fetching */
  requestContext?: Record<string, string>;
  /** How this resource was discovered */
  acquisitionMethod: 'refetch' | 'page-world-clone' | 'unknown';
  /** When this resource was discovered */
  discoveredAt: number;
  /** SHA-256 hash of the subtitle payload content */
  contentHash?: string;
}

/**
 * A normalized timed text segment
 */
export interface NormalizedSegment {
  /** Stable segment identifier */
  id: string;
  /** Start time in milliseconds */
  startMs: number;
  /** End time in milliseconds */
  endMs: number;
  /** Source subtitle text */
  sourceText: string;
  /** Optional styling/positioning metadata (excluded from translation input) */
  metadata?: Record<string, unknown>;
}

/**
 * Cleaned input sent to the translator agent
 */
export interface CleanedTranslationInput {
  /** Target language code */
  targetLanguage: string;
  /** Segments to translate, with minimal metadata */
  segments: Array<{
    id: string;
    startMs: number;
    endMs: number;
    sourceText: string;
  }>;
}

/**
 * Translation provider types
 */
export type TranslationProvider = 'deepseek' | 'openai' | 'anthropic' | 'custom';

/**
 * Request to translate a batch of segments
 */
export interface TranslationRequest {
  /** Target language code */
  targetLanguage: string;
  /** Provider to use */
  provider: TranslationProvider;
  /** Batch of segments for contextual translation */
  segments: NormalizedSegment[];
  /** Provider-specific options (API key, endpoint, model, etc.) */
  providerOptions?: Record<string, string>;
}

/**
 * A translated subtitle segment returned by the translator agent
 */
export interface TranslatedSegment {
  /** Segment ID matching the source */
  id: string;
  /** Original timing preserved */
  startMs: number;
  /** Original timing preserved */
  endMs: number;
  /** Translated text */
  translatedText: string;
}

/**
 * A saved translated subtitle artifact
 */
export interface TranslatedArtifact {
  /** Associated video ID */
  videoId: string;
  /** Source language code */
  sourceLanguage: string;
  /** Target language code */
  targetLanguage: string;
  /** Hash of the source subtitle that was translated */
  sourceSubtitleHash: string;
  /** When the translation was prepared */
  preparedAt: number;
  /** Translation provider used */
  provider: TranslationProvider;
  /** Translated segments */
  segments: TranslatedSegment[];
}

/**
 * Status of subtitle preparation for a video
 */
export type PreparationStatus =
  | 'unsupported-page'
  | 'video-detected'
  | 'subtitle-acquisition-blocked'
  | 'source-ready'
  | 'preparing'
  | 'translation-ready'
  | 'translation-failed'
  | 'stale-translation'
  | 'rendering-active';

/**
 * Subtitle metadata and preparation tracking stored in local storage
 */
export interface SubtitleLibraryEntry {
  /** Unique key: `${videoId}:${sourceLanguage}:${targetLanguage}:${sourceSubtitleHash}` */
  key: string;
  /** Video ID */
  videoId: string;
  /** Source language */
  sourceLanguage: string;
  /** Target language */
  targetLanguage: string;
  /** Source subtitle hash */
  sourceSubtitleHash: string;
  /** Current preparation status */
  status: PreparationStatus;
  /** When this entry was last updated */
  updatedAt: number;
  /** Optional: subtitle resource metadata (if source was acquired) */
  subtitleResource?: SubtitleResource;
  /** Optional: raw subtitle payload (for translation processing) */
  sourcePayload?: string;
  /** Optional: translated artifact (if preparation succeeded) */
  translatedArtifact?: TranslatedArtifact;
  /** Optional: error message if preparation failed */
  errorMessage?: string;
}

/**
 * Extension settings stored in chrome.storage
 */
export interface ExtensionSettings {
  /** Selected target language */
  targetLanguage: string;
  /** Default translation provider */
  provider: TranslationProvider;
  /** Provider API key */
  apiKey?: string;
  /** Custom endpoint URL (for custom provider) */
  customEndpoint?: string;
}

/**
 * Message types for runtime communication
 */
export type ExtensionMessage =
  | { type: 'PAGE_LOADED'; url: string; timestamp: number }
  | { type: 'VIDEO_DETECTED'; videoId: string; url: string }
  | { type: 'VIDEO_CHANGED'; videoId: string; url: string }
  | { type: 'SUBTITLE_CANDIDATE'; resource: SubtitleResource }
  | { type: 'PREPARE_SUBTITLES'; videoId: string; targetLanguage: string }
  | { type: 'PREPARATION_STATUS'; status: PreparationStatus; videoId: string }
  | { type: 'TOGGLE_TRANSLATION'; enabled: boolean }
  | { type: 'GET_STATUS' }
  | { type: 'STATUS_RESPONSE'; status: PreparationStatus; videoId?: string };
