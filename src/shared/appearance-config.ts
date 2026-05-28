import type { SubtitleAppearanceConfig } from './types';
import { DEFAULT_APPEARANCE_CONFIG, APPEARANCE_BOUNDS } from './types';

const APPEARANCE_STORAGE_KEY = 'nt_appearance_global';

export function normalizeAppearanceConfig(
  partial: Partial<SubtitleAppearanceConfig>
): SubtitleAppearanceConfig {
  const config: SubtitleAppearanceConfig = {
    fontSize: partial.fontSize ?? DEFAULT_APPEARANCE_CONFIG.fontSize,
    placement: partial.placement ?? DEFAULT_APPEARANCE_CONFIG.placement,
    areaWidthPct: partial.areaWidthPct ?? DEFAULT_APPEARANCE_CONFIG.areaWidthPct,
    areaHeightPct: partial.areaHeightPct ?? DEFAULT_APPEARANCE_CONFIG.areaHeightPct,
    offsetXPct: partial.offsetXPct ?? DEFAULT_APPEARANCE_CONFIG.offsetXPct,
    offsetYPct: partial.offsetYPct ?? DEFAULT_APPEARANCE_CONFIG.offsetYPct,
  };

  config.fontSize = clamp(config.fontSize, APPEARANCE_BOUNDS.fontSize);
  config.areaWidthPct = clamp(config.areaWidthPct, APPEARANCE_BOUNDS.areaWidthPct);
  config.areaHeightPct = clamp(config.areaHeightPct, APPEARANCE_BOUNDS.areaHeightPct);
  config.offsetXPct = clamp(config.offsetXPct, APPEARANCE_BOUNDS.offsetXPct);
  config.offsetYPct = clamp(config.offsetYPct, APPEARANCE_BOUNDS.offsetYPct);
  config.placement = config.placement === 'top' ? 'top' : 'bottom';

  return config;
}

function clamp(value: number, bounds: { min: number; max: number }): number {
  return Math.min(bounds.max, Math.max(bounds.min, value));
}

export async function loadAppearanceConfig(): Promise<SubtitleAppearanceConfig> {
  const result = await chrome.storage.local.get(APPEARANCE_STORAGE_KEY);
  const stored = result[APPEARANCE_STORAGE_KEY] as
    | Partial<SubtitleAppearanceConfig>
    | undefined;
  if (!stored) {
    return { ...DEFAULT_APPEARANCE_CONFIG };
  }
  return normalizeAppearanceConfig(stored);
}

export async function saveAppearanceConfig(
  config: Partial<SubtitleAppearanceConfig>
): Promise<SubtitleAppearanceConfig> {
  const normalized = normalizeAppearanceConfig(config);
  await chrome.storage.local.set({ [APPEARANCE_STORAGE_KEY]: normalized });
  return normalized;
}