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
  /** Optional title extracted from the Netflix page */
  videoTitle?: string;
  /** Optional Netflix page metadata for context generation */
  netflixContext?: NetflixVideoContext;
}

export type NetflixMetadataConfidence = 'low' | 'medium' | 'high';

/**
 * Metadata extracted from the Netflix page for a detected video.
 */
export interface NetflixVideoContext {
  /** Title shown by Netflix or browser metadata */
  title?: string;
  /** Synopsis/description visible in Netflix metadata */
  synopsis?: string;
  /** Maturity rating if visible on the page */
  maturityRating?: string;
  /** Genres or tags if visible on the page */
  genres?: string[];
  /** Where the metadata came from */
  source?: string;
  /** Reliability of the metadata source */
  confidence?: NetflixMetadataConfidence;
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
  /** Optional title extracted from the Netflix page */
  videoTitle?: string;
  /** Optional Netflix page metadata for context generation */
  netflixContext?: NetflixVideoContext;
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
 * Debug summary for the latest translation provider interaction.
 */
export interface TranslationDebugInfo {
  /** Associated video ID */
  videoId: string;
  /** Translation provider model */
  model: string;
  /** Number of source segments requested */
  segmentCount: number;
  /** Translation strategy */
  strategy: 'batch';
  /** Provider request lifecycle phase */
  requestPhase?: 'started' | 'completed' | 'failed';
  /** Provider finish reason when available */
  finishReason?: string;
  /** Provider request ID when available */
  requestId?: string;
  /** Raw response content length */
  responseContentLength?: number;
  /** Small raw response preview for debugging parse failures */
  responsePreview?: string;
  /** Token usage reported by provider */
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  /** Number of segments that passed validation */
  validatedCount?: number;
  /** Error observed before fallback or final failure */
  errorMessage?: string;
  /** When this debug record was written */
  updatedAt: number;
}

/**
 * Progress metadata for batch translation
 */
export interface TranslationProgressInfo {
  /** Current batch number for sequential progress display (1-indexed) */
  currentBatch: number;
  /** Total number of batches */
  totalBatches: number;
  /** Number of segments validated so far */
  validatedSegmentCount: number;
  /** Total number of segments to translate */
  totalSegmentCount: number;
  /** Provider model being used */
  providerModel: string;
  /** Latest error or debug summary, if any */
  latestError?: string;
  /** Number of completed batches (parallel progress) */
  completedBatches?: number;
  /** Number of failed batches (parallel progress) */
  failedBatches?: number;
  /** Batch numbers currently in flight (parallel progress) */
  inFlightBatches?: number[];
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
 * Quality diagnostics for a translated artifact
 */
export interface QualityDiagnostics {
  /** Total source segment count */
  sourceSegmentCount: number;
  /** Translated segment count */
  translatedSegmentCount: number;
  /** Missing translated segment count */
  missingSegmentCount: number;
  /** Empty translated segment count */
  emptyTranslationCount: number;
  /** Whether the translation is stale */
  isStale: boolean;
  /** Provider used */
  provider?: TranslationProvider;
  /** Provider model */
  providerModel?: string;
  /** When the translation was prepared */
  preparedAt?: number;
}

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
  /** Optional: video title (if known) */
  videoTitle?: string;
  /** Optional: Netflix page metadata for context generation */
  netflixContext?: NetflixVideoContext;
  /** Optional: subtitle resource metadata (if source was acquired) */
  subtitleResource?: SubtitleResource;
  /** Optional: raw subtitle payload (for translation processing) */
  sourcePayload?: string;
  /** Optional: source segment count */
  sourceSegmentCount?: number;
  /** Optional: translated segment count */
  translatedSegmentCount?: number;
  /** Optional: translated artifact (if preparation succeeded) */
  translatedArtifact?: TranslatedArtifact;
  /** Optional: error message if preparation failed */
  errorMessage?: string;
  /** Optional: latest translation provider debug summary */
  translationDebug?: TranslationDebugInfo;
  /** Optional: batch translation progress metadata */
  translationProgress?: TranslationProgressInfo;
  /** Optional: timestamp when preparation started (to detect stale preparing state) */
  preparingSince?: number;
  /** Optional: accumulated partial translated segments from completed batches */
  partialSegments?: TranslatedSegment[];
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
 * A character name entry in a translation context profile
 */
export interface CharacterNameEntry {
  /** Original character name */
  original: string;
  /** Recommended translation for this character name */
  translation: string;
}

/**
 * A glossary entry in a translation context profile
 */
export interface GlossaryEntry {
  /** Source term */
  term: string;
  /** Recommended translation */
  translation: string;
}

/**
 * A source URL from auto-fill lookup
 */
export interface ProfileSourceURL {
  /** URL of the source */
  url: string;
  /** Label or title of the source */
  label?: string;
}

/**
 * Per-title translation context profile for consistent translation.
 * Keyed by videoId, sourceLanguage, targetLanguage, sourceSubtitleHash.
 */
export interface TranslationContextProfile {
  /** Associated video ID */
  videoId: string;
  /** Source language */
  sourceLanguage: string;
  /** Target language */
  targetLanguage: string;
  /** Source subtitle hash this profile was created for */
  sourceSubtitleHash: string;
  /** Tone instructions for translation */
  tone: string;
  /** Background notes about the title */
  backgroundNotes: string;
  /** Character name consistency entries */
  characterNames: CharacterNameEntry[];
  /** Glossary term entries */
  glossary: GlossaryEntry[];
  /** Source URLs used for auto-fill */
  sourceURLs: ProfileSourceURL[];
  /** Whether the profile was auto-filled (user may have edited since) */
  autoFilled: boolean;
  /** When the profile was last updated */
  updatedAt: number;
}

/**
 * Auto-fill result returned by the auto-fill service
 */
export interface AutoFillResult {
  /** Suggested tone */
  tone: string;
  /** Suggested background notes */
  backgroundNotes: string;
  /** Suggested character names */
  characterNames: CharacterNameEntry[];
  /** Suggested glossary entries */
  glossary: GlossaryEntry[];
  /** Source URLs used */
  sourceURLs: ProfileSourceURL[];
}

/**
 * Detection status for the popup's subtitle availability check
 */
export type DetectionStatus =
  | 'no-video'
  | 'no-subtitle'
  | 'subtitle-detected'
  | 'already-saved'
  | 'new-hash-detected';

/**
 * Subtitle placement position
 */
export type SubtitlePlacement = 'top' | 'bottom';

/**
 * Configuration for subtitle appearance (style, position, dimensions).
 * Area dimensions and offsets are stored as percentages of the video rect.
 */
export interface SubtitleAppearanceConfig {
  /** Font size in pixels (default 24) */
  fontSize: number;
  /** Placement position: 'top' or 'bottom' (default 'bottom') */
  placement: SubtitlePlacement;
  /** Subtitle area width as a percentage of video rect width (default 80) */
  areaWidthPct: number;
  /** Subtitle area height as a percentage of video rect height (default 15) */
  areaHeightPct: number;
  /** Horizontal offset as a percentage of video rect width (default 0) */
  offsetXPct: number;
  /** Vertical offset as a percentage of video rect height (default 12) */
  offsetYPct: number;
}

export const DEFAULT_APPEARANCE_CONFIG: SubtitleAppearanceConfig = {
  fontSize: 24,
  placement: 'bottom',
  areaWidthPct: 80,
  areaHeightPct: 15,
  offsetXPct: 0,
  offsetYPct: 12,
};

export const APPEARANCE_BOUNDS: Record<
  keyof SubtitleAppearanceConfig,
  { min: number; max: number }
> = {
  fontSize: { min: 12, max: 48 },
  placement: { min: 0, max: 1 },
  areaWidthPct: { min: 20, max: 100 },
  areaHeightPct: { min: 5, max: 50 },
  offsetXPct: { min: -50, max: 50 },
  offsetYPct: { min: 0, max: 50 },
};

/**
 * Message types for runtime communication
 */
export type ExtensionMessage =
  | { type: 'PAGE_LOADED'; url: string; timestamp: number }
  | { type: 'VIDEO_DETECTED'; videoId: string; url: string; videoTitle?: string; netflixContext?: NetflixVideoContext }
  | { type: 'VIDEO_CHANGED'; videoId: string; url: string }
  | { type: 'SUBTITLE_CANDIDATE'; resource: SubtitleResource; payload?: string }
  | { type: 'PREPARE_SUBTITLES'; videoId: string; targetLanguage: string }
  | { type: 'PREPARATION_STATUS'; status: PreparationStatus; videoId: string }
  | { type: 'TOGGLE_TRANSLATION'; enabled: boolean; videoId?: string; targetLanguage?: string; appearanceConfig?: SubtitleAppearanceConfig }
  | { type: 'UPDATE_SUBTITLE_STYLE'; config: SubtitleAppearanceConfig }
  | { type: 'GET_RENDERING_STATUS' }
  | { type: 'GET_STATUS'; videoId: string }
  | { type: 'STATUS_RESPONSE'; status: PreparationStatus; videoId?: string }
  | { type: 'GET_SEGMENTS'; videoId: string; targetLanguage: string }
  | { type: 'SEGMENTS_RESPONSE'; segments: Array<{ id: string; startMs: number; endMs: number; sourceText: string; translatedText: string }>; count: number; }
  | { type: 'DELETE_SEGMENT'; videoId: string; sourceLanguage: string; targetLanguage: string; sourceSubtitleHash: string; segmentId: string }
  | { type: 'RETRANSLATE_SEGMENT'; videoId: string; sourceLanguage: string; targetLanguage: string; sourceSubtitleHash: string; segmentId: string }
  | { type: 'GET_DETECTION_STATUS'; videoId: string }
  | { type: 'DETECTION_STATUS_RESPONSE'; status: DetectionStatus; videoId: string; savedHash?: string; detectedHash?: string; sourceLanguage?: string }
  | { type: 'GET_CONTEXT_PROFILE'; videoId: string; sourceLanguage: string; targetLanguage: string; sourceSubtitleHash: string }
  | { type: 'CONTEXT_PROFILE_RESPONSE'; profile: TranslationContextProfile | null }
  | { type: 'SAVE_CONTEXT_PROFILE'; profile: TranslationContextProfile }
  | { type: 'AUTOFILL_CONTEXT_PROFILE'; videoId: string; videoTitle?: string; sourceLanguage: string; targetLanguage: string; sourceSubtitleHash: string }
  | { type: 'AUTOFILL_RESULT'; result: AutoFillResult | null; error?: string };

/**
 * Detailed status response for the popup diagnostics panel
 */
export interface DetailedStatusResponse {
  status: PreparationStatus;
  videoId: string;
  entryCount: number;
  readyCount: number;
  /** Whether the current status allows retry/resume */
  isRetryable: boolean;
  /** Current batch progress if preparing */
  progress?: TranslationProgressInfo;
  /** Latest error message if failed */
  errorMessage?: string;
  /** Latest debug info from provider */
  debugInfo?: TranslationDebugInfo;
  /** When preparation started (to detect stale state) */
  preparingSince?: number;
  /** Accumulated partial translated segments from completed batches */
  partialSegments?: TranslatedSegment[];
}
