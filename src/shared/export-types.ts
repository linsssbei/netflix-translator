// Netflix Translator - Export Data Contracts
// Types for subtitle export functionality

import type { SubtitleLibraryEntry } from './types';

/**
 * Supported export format identifiers
 */
export type ExportFormat = 'srt' | 'webvtt' | 'json-bundle';

/**
 * Versioned JSON subtitle bundle for extension-to-extension sharing
 */
export interface JsonSubtitleBundle {
  /** Bundle format version */
  formatVersion: number;
  /** Video identifier */
  videoId: string;
  /** Optional video title */
  videoTitle?: string;
  /** Source language code */
  sourceLanguage: string;
  /** Target language code */
  targetLanguage: string;
  /** Hash of the source subtitle that was translated */
  sourceSubtitleHash: string;
  /** When this bundle was exported */
  exportTimestamp: number;
  /** Artifact metadata */
  artifactMetadata: {
    /** When the translation was prepared */
    preparedAt: number;
    /** Translation provider used */
    provider?: string;
    /** Provider model */
    providerModel?: string;
    /** Source segment count */
    sourceSegmentCount?: number;
    /** Translated segment count */
    translatedSegmentCount?: number;
  };
  /** Translated segments with timing and identity */
  segments: Array<{
    id: string;
    startMs: number;
    endMs: number;
    translatedText: string;
  }>;
}

/**
 * Result of generating an export file
 */
export interface ExportResult {
  /** Generated filename */
  filename: string;
  /** MIME type for the file */
  mimeType: string;
  /** File extension (without dot) */
  extension: string;
  /** Generated file content */
  content: string;
}

/**
 * Possible export eligibility states
 */
export type ExportEligibility =
  | { eligible: true }
  | { eligible: false; reason: 'missing-artifact' }
  | { eligible: false; reason: 'not-ready' }
  | { eligible: false; reason: 'empty-segments' }
  | { eligible: false; reason: 'invalid-timing' }
  | { eligible: false; reason: 'invalid-text' };

/**
 * Options for generating an export file
 */
export interface ExportOptions {
  /** The library entry to export */
  entry: SubtitleLibraryEntry;
  /** Export format */
  format: ExportFormat;
  /** Optional override for the video title in the filename */
  videoTitle?: string;
}
