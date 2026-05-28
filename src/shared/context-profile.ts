import type { TranslationContextProfile } from './types';

const PROFILE_STORAGE_PREFIX = 'nt_profile_';

export function buildProfileKey(
  videoId: string,
  sourceLanguage: string,
  targetLanguage: string,
  sourceSubtitleHash: string
): string {
  return `${videoId}:${sourceLanguage}:${targetLanguage}:${sourceSubtitleHash}`;
}

export async function saveContextProfile(
  profile: TranslationContextProfile
): Promise<void> {
  const key = PROFILE_STORAGE_PREFIX + buildProfileKey(
    profile.videoId,
    profile.sourceLanguage,
    profile.targetLanguage,
    profile.sourceSubtitleHash
  );
  profile.updatedAt = Date.now();
  await chrome.storage.local.set({ [key]: profile });
}

export async function loadContextProfile(
  videoId: string,
  sourceLanguage: string,
  targetLanguage: string,
  sourceSubtitleHash: string
): Promise<TranslationContextProfile | null> {
  const key = PROFILE_STORAGE_PREFIX + buildProfileKey(
    videoId,
    sourceLanguage,
    targetLanguage,
    sourceSubtitleHash
  );
  const result = await chrome.storage.local.get(key);
  return (result[key] as TranslationContextProfile) || null;
}

export async function deleteContextProfile(
  videoId: string,
  sourceLanguage: string,
  targetLanguage: string,
  sourceSubtitleHash: string
): Promise<boolean> {
  const key = PROFILE_STORAGE_PREFIX + buildProfileKey(
    videoId,
    sourceLanguage,
    targetLanguage,
    sourceSubtitleHash
  );
  const result = await chrome.storage.local.get(key);
  if (!result[key]) return false;
  await chrome.storage.local.remove(key);
  return true;
}

export function createEmptyProfile(
  videoId: string,
  sourceLanguage: string,
  targetLanguage: string,
  sourceSubtitleHash: string
): TranslationContextProfile {
  return {
    videoId,
    sourceLanguage,
    targetLanguage,
    sourceSubtitleHash,
    tone: '',
    backgroundNotes: '',
    characterNames: [],
    glossary: [],
    sourceURLs: [],
    autoFilled: false,
    updatedAt: Date.now(),
  };
}