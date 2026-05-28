import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadAppearanceConfig,
  saveAppearanceConfig,
  normalizeAppearanceConfig,
} from '../shared/appearance-config';
import {
  percentToPixels,
  pixelsToPercent,
} from '../shared/subtitle-fit';
import {
  PREVIEW_MIN_HEIGHT_PX,
  PREVIEW_MAX_HEIGHT_PX,
  computePreviewStyle,
  clampPreviewHeight,
  resizeHeightToPercent,
} from './popup';
import { SubtitleAppearanceConfig, DEFAULT_APPEARANCE_CONFIG, APPEARANCE_BOUNDS } from '../shared/types';

let storage: Record<string, unknown> = {};

beforeEach(() => {
  storage = {};
});

(globalThis as any).chrome = {
  storage: {
    local: {
      get: (keys: string | string[] | null) => {
        if (keys === null) {
          return Promise.resolve({ ...storage });
        }
        const keyList = Array.isArray(keys) ? keys : [keys];
        const result: Record<string, unknown> = {};
        for (const k of keyList) {
          if (storage[k] !== undefined) {
            result[k] = storage[k];
          }
        }
        return Promise.resolve(result);
      },
      set: (items: Record<string, unknown>) => {
        Object.assign(storage, items);
        return Promise.resolve();
      },
      remove: (keys: string | string[]) => {
        const keyList = Array.isArray(keys) ? keys : [keys];
        for (const k of keyList) {
          delete storage[k];
        }
        return Promise.resolve();
      },
    },
  },
};

describe('computePreviewStyle', () => {
  it('computes style from default config', () => {
    const result = computePreviewStyle(DEFAULT_APPEARANCE_CONFIG, 300);
    expect(result.fontSize).toBe(24);
    expect(result.maxWidthPx).toBeCloseTo(300 * 0.8);
    expect(result.placement).toBe('bottom');
  });

  it('computes maxWidth from areaWidthPct', () => {
    const config: SubtitleAppearanceConfig = {
      ...DEFAULT_APPEARANCE_CONFIG,
      areaWidthPct: 60,
    };
    const result = computePreviewStyle(config, 300);
    expect(result.maxWidthPx).toBeCloseTo(180);
  });

  it('computes height from areaHeightPct based on container width', () => {
    const config: SubtitleAppearanceConfig = {
      ...DEFAULT_APPEARANCE_CONFIG,
      areaHeightPct: 15,
    };
    const result = computePreviewStyle(config, 300);
    expect(result.heightPx).toBeCloseTo(45);
  });

  it('reflects top placement', () => {
    const config: SubtitleAppearanceConfig = {
      ...DEFAULT_APPEARANCE_CONFIG,
      placement: 'top',
    };
    const result = computePreviewStyle(config, 300);
    expect(result.placement).toBe('top');
  });

  it('reflects bottom placement', () => {
    const config: SubtitleAppearanceConfig = {
      ...DEFAULT_APPEARANCE_CONFIG,
      placement: 'bottom',
    };
    const result = computePreviewStyle(config, 300);
    expect(result.placement).toBe('bottom');
  });

  it('uses custom fontSize', () => {
    const config: SubtitleAppearanceConfig = {
      ...DEFAULT_APPEARANCE_CONFIG,
      fontSize: 36,
    };
    const result = computePreviewStyle(config, 300);
    expect(result.fontSize).toBe(36);
  });
});

describe('percentToPixels / pixelsToPercent conversions for preview', () => {
  it('round-trips areaWidthPct through a 300px container', () => {
    const pct = 80;
    const px = percentToPixels(pct, 300);
    const back = pixelsToPercent(px, 300);
    expect(back).toBeCloseTo(pct);
  });

  it('round-trips areaHeightPct through a 300px container', () => {
    const pct = 15;
    const px = percentToPixels(pct, 300);
    const back = pixelsToPercent(px, 300);
    expect(back).toBeCloseTo(pct);
  });

  it('converts percentToPixels correctly for preview', () => {
    expect(percentToPixels(80, 300)).toBeCloseTo(240);
    expect(percentToPixels(60, 300)).toBeCloseTo(180);
    expect(percentToPixels(100, 300)).toBeCloseTo(300);
  });

  it('converts pixelsToPercent correctly for preview', () => {
    expect(pixelsToPercent(240, 300)).toBeCloseTo(80);
    expect(pixelsToPercent(180, 300)).toBeCloseTo(60);
  });

  it('returns 0 for zero container in pixelsToPercent', () => {
    expect(pixelsToPercent(100, 0)).toBe(0);
  });
});

describe('clampPreviewHeight', () => {
  it('returns value within bounds unchanged', () => {
    expect(clampPreviewHeight(120)).toBe(120);
    expect(clampPreviewHeight(80)).toBe(80);
    expect(clampPreviewHeight(200)).toBe(200);
  });

  it('clamps to min height', () => {
    expect(clampPreviewHeight(50)).toBe(PREVIEW_MIN_HEIGHT_PX);
    expect(clampPreviewHeight(0)).toBe(PREVIEW_MIN_HEIGHT_PX);
    expect(clampPreviewHeight(-10)).toBe(PREVIEW_MIN_HEIGHT_PX);
  });

  it('clamps to max height', () => {
    expect(clampPreviewHeight(250)).toBe(PREVIEW_MAX_HEIGHT_PX);
    expect(clampPreviewHeight(300)).toBe(PREVIEW_MAX_HEIGHT_PX);
    expect(clampPreviewHeight(999)).toBe(PREVIEW_MAX_HEIGHT_PX);
  });

  it('uses default min/max when not specified', () => {
    expect(clampPreviewHeight(79)).toBe(80);
    expect(clampPreviewHeight(201)).toBe(200);
  });

  it('respects custom min/max bounds', () => {
    expect(clampPreviewHeight(50, 50, 150)).toBe(50);
    expect(clampPreviewHeight(160, 50, 150)).toBe(150);
    expect(clampPreviewHeight(100, 50, 150)).toBe(100);
  });
});

describe('resizeHeightToPercent', () => {
  it('converts pixel height to percentage of container width', () => {
    const result = resizeHeightToPercent(45, 300);
    expect(result).toBeCloseTo(15);
  });

  it('handles container width of various sizes', () => {
    const result = resizeHeightToPercent(45, 300);
    expect(result).toBeCloseTo(15);
    const result2 = resizeHeightToPercent(60, 400);
    expect(result2).toBeCloseTo(15);
  });

  it('returns 0 for zero container width', () => {
    expect(resizeHeightToPercent(100, 0)).toBe(0);
  });
});

describe('appearance config persistence after resize', () => {
  it('persists updated areaHeightPct after resize', async () => {
    const config = await saveAppearanceConfig({
      ...DEFAULT_APPEARANCE_CONFIG,
      areaHeightPct: 20,
    });
    expect(config.areaHeightPct).toBe(20);
    const loaded = await loadAppearanceConfig();
    expect(loaded.areaHeightPct).toBe(20);
  });

  it('preserves other fields when updating areaHeightPct', async () => {
    await saveAppearanceConfig({
      fontSize: 32,
      placement: 'top',
      areaWidthPct: 70,
      areaHeightPct: 10,
      offsetXPct: 5,
      offsetYPct: 8,
    });
    const loaded = await loadAppearanceConfig();
    const updated = await saveAppearanceConfig({
      ...loaded,
      areaHeightPct: 25,
    });
    expect(updated.areaHeightPct).toBe(25);
    expect(updated.fontSize).toBe(32);
    expect(updated.placement).toBe('top');
    expect(updated.areaWidthPct).toBe(70);
  });

  it('clamps areaHeightPct to APPEARANCE_BOUNDS on save', async () => {
    const result = await saveAppearanceConfig({
      areaHeightPct: 999,
    });
    expect(result.areaHeightPct).toBe(APPEARANCE_BOUNDS.areaHeightPct.max);
  });

  it('clamps areaWidthPct to APPEARANCE_BOUNDS on save', async () => {
    const result = await saveAppearanceConfig({
      areaWidthPct: 5,
    });
    expect(result.areaWidthPct).toBe(APPEARANCE_BOUNDS.areaWidthPct.min);
  });
});

describe('preview style reflects placement', () => {
  it('bottom placement yields bottom in computed style', () => {
    const config: SubtitleAppearanceConfig = {
      ...DEFAULT_APPEARANCE_CONFIG,
      placement: 'bottom',
    };
    const result = computePreviewStyle(config, 300);
    expect(result.placement).toBe('bottom');
  });

  it('top placement yields top in computed style', () => {
    const config: SubtitleAppearanceConfig = {
      ...DEFAULT_APPEARANCE_CONFIG,
      placement: 'top',
    };
    const result = computePreviewStyle(config, 300);
    expect(result.placement).toBe('top');
  });
});

describe('immediate config update triggers preview recalculation', () => {
  it('changing fontSize changes the computed preview fontSize', () => {
    const config1 = normalizeAppearanceConfig({ fontSize: 24 });
    const config2 = normalizeAppearanceConfig({ fontSize: 36 });
    const style1 = computePreviewStyle(config1, 300);
    const style2 = computePreviewStyle(config2, 300);
    expect(style2.fontSize).toBeGreaterThan(style1.fontSize);
  });

  it('changing areaWidthPct changes the computed maxWidth', () => {
    const config1 = normalizeAppearanceConfig({ areaWidthPct: 60 });
    const config2 = normalizeAppearanceConfig({ areaWidthPct: 80 });
    const style1 = computePreviewStyle(config1, 300);
    const style2 = computePreviewStyle(config2, 300);
    expect(style2.maxWidthPx).toBeGreaterThan(style1.maxWidthPx);
  });

  it('changing areaHeightPct changes the computed height', () => {
    const config1 = normalizeAppearanceConfig({ areaHeightPct: 10 });
    const config2 = normalizeAppearanceConfig({ areaHeightPct: 25 });
    const style1 = computePreviewStyle(config1, 300);
    const style2 = computePreviewStyle(config2, 300);
    expect(style2.heightPx).toBeGreaterThan(style1.heightPx);
  });
});