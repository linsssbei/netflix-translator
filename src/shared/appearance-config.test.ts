import { describe, it, expect, beforeEach } from 'vitest';
import {
  normalizeAppearanceConfig,
  loadAppearanceConfig,
  saveAppearanceConfig,
} from '../shared/appearance-config';
import { DEFAULT_APPEARANCE_CONFIG, APPEARANCE_BOUNDS, SubtitleAppearanceConfig } from '../shared/types';

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

describe('normalizeAppearanceConfig', () => {
  it('returns full defaults for empty input', () => {
    const result = normalizeAppearanceConfig({});
    expect(result).toEqual(DEFAULT_APPEARANCE_CONFIG);
  });

  it('fills in missing fields with defaults', () => {
    const result = normalizeAppearanceConfig({ fontSize: 30 });
    expect(result.fontSize).toBe(30);
    expect(result.placement).toBe('bottom');
    expect(result.areaWidthPct).toBe(80);
    expect(result.areaHeightPct).toBe(15);
    expect(result.offsetXPct).toBe(0);
    expect(result.offsetYPct).toBe(12);
  });

  it('preserves valid values', () => {
    const custom = {
      fontSize: 36,
      placement: 'top' as const,
      areaWidthPct: 60,
      areaHeightPct: 20,
      offsetXPct: 10,
      offsetYPct: 5,
    };
    const result = normalizeAppearanceConfig(custom);
    expect(result).toEqual(custom);
  });

  it('clamps fontSize below minimum', () => {
    const result = normalizeAppearanceConfig({ fontSize: 5 });
    expect(result.fontSize).toBe(APPEARANCE_BOUNDS.fontSize.min);
  });

  it('clamps fontSize above maximum', () => {
    const result = normalizeAppearanceConfig({ fontSize: 100 });
    expect(result.fontSize).toBe(APPEARANCE_BOUNDS.fontSize.max);
  });

  it('clamps areaWidthPct to bounds', () => {
    const low = normalizeAppearanceConfig({ areaWidthPct: 5 });
    expect(low.areaWidthPct).toBe(APPEARANCE_BOUNDS.areaWidthPct.min);
    const high = normalizeAppearanceConfig({ areaWidthPct: 200 });
    expect(high.areaWidthPct).toBe(APPEARANCE_BOUNDS.areaWidthPct.max);
  });

  it('clamps areaHeightPct to bounds', () => {
    const low = normalizeAppearanceConfig({ areaHeightPct: 1 });
    expect(low.areaHeightPct).toBe(APPEARANCE_BOUNDS.areaHeightPct.min);
    const high = normalizeAppearanceConfig({ areaHeightPct: 99 });
    expect(high.areaHeightPct).toBe(APPEARANCE_BOUNDS.areaHeightPct.max);
  });

  it('clamps offsetXPct to bounds (allows negative)', () => {
    const low = normalizeAppearanceConfig({ offsetXPct: -80 });
    expect(low.offsetXPct).toBe(APPEARANCE_BOUNDS.offsetXPct.min);
    const high = normalizeAppearanceConfig({ offsetXPct: 80 });
    expect(high.offsetXPct).toBe(APPEARANCE_BOUNDS.offsetXPct.max);
  });

  it('clamps offsetYPct to bounds', () => {
    const low = normalizeAppearanceConfig({ offsetYPct: -5 });
    expect(low.offsetYPct).toBe(APPEARANCE_BOUNDS.offsetYPct.min);
    const high = normalizeAppearanceConfig({ offsetYPct: 99 });
    expect(high.offsetYPct).toBe(APPEARANCE_BOUNDS.offsetYPct.max);
  });

  it('normalizes invalid placement to bottom', () => {
    const result = normalizeAppearanceConfig({ placement: 'invalid' as any });
    expect(result.placement).toBe('bottom');
  });

  it('accepts top placement', () => {
    const result = normalizeAppearanceConfig({ placement: 'top' });
    expect(result.placement).toBe('top');
  });

  it('clamps multiple out-of-bounds fields simultaneously', () => {
    const result = normalizeAppearanceConfig({
      fontSize: 1,
      areaWidthPct: 1,
      areaHeightPct: 100,
      offsetXPct: -999,
      offsetYPct: 999,
    });
    expect(result.fontSize).toBe(APPEARANCE_BOUNDS.fontSize.min);
    expect(result.areaWidthPct).toBe(APPEARANCE_BOUNDS.areaWidthPct.min);
    expect(result.areaHeightPct).toBe(APPEARANCE_BOUNDS.areaHeightPct.max);
    expect(result.offsetXPct).toBe(APPEARANCE_BOUNDS.offsetXPct.min);
    expect(result.offsetYPct).toBe(APPEARANCE_BOUNDS.offsetYPct.max);
  });
});

describe('loadAppearanceConfig', () => {
  it('returns defaults when nothing is stored', async () => {
    const config = await loadAppearanceConfig();
    expect(config).toEqual(DEFAULT_APPEARANCE_CONFIG);
  });

  it('returns stored config when present', async () => {
    const stored: SubtitleAppearanceConfig = { fontSize: 32, placement: 'top', areaWidthPct: 70, areaHeightPct: 10, offsetXPct: 5, offsetYPct: 8 };
    await saveAppearanceConfig(stored);
    const loaded = await loadAppearanceConfig();
    expect(loaded).toEqual(stored);
  });

  it('normalizes invalid stored values', async () => {
    const badData: Record<string, unknown> = { fontSize: 200, placement: 'garbage', areaWidthPct: 5 };
    storage['nt_appearance_global'] = badData;
    const loaded = await loadAppearanceConfig();
    expect(loaded.fontSize).toBe(48);
    expect(loaded.placement).toBe('bottom');
    expect(loaded.areaWidthPct).toBe(20);
    expect(loaded.areaHeightPct).toBe(15);
    expect(loaded.offsetXPct).toBe(0);
    expect(loaded.offsetYPct).toBe(12);
  });
});

describe('saveAppearanceConfig', () => {
  it('saves and returns normalized config', async () => {
    const result = await saveAppearanceConfig({ fontSize: 100, placement: 'top' });
    expect(result.fontSize).toBe(48);
    expect(result.placement).toBe('top');
    expect(storage['nt_appearance_global']).toEqual(result);
  });

  it('saves full valid config', async () => {
    const custom = {
      fontSize: 28,
      placement: 'bottom' as const,
      areaWidthPct: 75,
      areaHeightPct: 12,
      offsetXPct: 3,
      offsetYPct: 10,
    };
    const result = await saveAppearanceConfig(custom);
    expect(result).toEqual(custom);
  });
});

describe('APPEARANCE_BOUNDS', () => {
  it('has bounds for every field', () => {
    const keys = Object.keys(DEFAULT_APPEARANCE_CONFIG) as (keyof typeof DEFAULT_APPEARANCE_CONFIG)[];
    for (const key of keys) {
      expect(APPEARANCE_BOUNDS[key]).toBeDefined();
      expect(APPEARANCE_BOUNDS[key].min).toBeLessThanOrEqual(APPEARANCE_BOUNDS[key].max);
    }
  });
});