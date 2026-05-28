import { describe, it, expect, beforeEach } from 'vitest';
import {
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

describe('popup appearance config - loading', () => {
  it('populates controls with defaults when nothing is stored', async () => {
    const config = await loadAppearanceConfig();
    expect(config.fontSize).toBe(DEFAULT_APPEARANCE_CONFIG.fontSize);
    expect(config.placement).toBe(DEFAULT_APPEARANCE_CONFIG.placement);
  });

  it('populates controls from saved config', async () => {
    const stored: SubtitleAppearanceConfig = {
      fontSize: 36,
      placement: 'top',
      areaWidthPct: 70,
      areaHeightPct: 10,
      offsetXPct: 5,
      offsetYPct: 8,
    };
    storage['nt_appearance_global'] = stored;
    const config = await loadAppearanceConfig();
    expect(config.fontSize).toBe(36);
    expect(config.placement).toBe('top');
  });

  it('falls back to defaults for invalid stored values', async () => {
    storage['nt_appearance_global'] = { fontSize: 999, placement: 'garbage' };
    const config = await loadAppearanceConfig();
    expect(config.fontSize).toBe(APPEARANCE_BOUNDS.fontSize.max);
    expect(config.placement).toBe('bottom');
    expect(config.areaWidthPct).toBe(DEFAULT_APPEARANCE_CONFIG.areaWidthPct);
  });

  it('falls back to defaults when storage is empty', async () => {
    const config = await loadAppearanceConfig();
    expect(config).toEqual(DEFAULT_APPEARANCE_CONFIG);
  });
});

describe('popup appearance config - changing font-size', () => {
  it('saves updated font size', async () => {
    const config = await saveAppearanceConfig({ fontSize: 32 });
    expect(config.fontSize).toBe(32);
    const loaded = await loadAppearanceConfig();
    expect(loaded.fontSize).toBe(32);
  });

  it('clamps font size to bounds when saving', async () => {
    const config = await saveAppearanceConfig({ fontSize: 999 });
    expect(config.fontSize).toBe(APPEARANCE_BOUNDS.fontSize.max);
  });

  it('preserves other fields when changing font size', async () => {
    const original: SubtitleAppearanceConfig = {
      fontSize: 24,
      placement: 'top',
      areaWidthPct: 75,
      areaHeightPct: 12,
      offsetXPct: 3,
      offsetYPct: 10,
    };
    storage['nt_appearance_global'] = original;
    const config = await saveAppearanceConfig({ fontSize: 28 });
    expect(config.fontSize).toBe(28);
    expect(config.placement).toBe('bottom');
  });
});

describe('popup appearance config - changing placement', () => {
  it('saves updated placement', async () => {
    const config = await saveAppearanceConfig({ placement: 'top' });
    expect(config.placement).toBe('top');
    const loaded = await loadAppearanceConfig();
    expect(loaded.placement).toBe('top');
  });

  it('normalizes invalid placement to bottom', async () => {
    const config = await saveAppearanceConfig({ placement: 'invalid' as any });
    expect(config.placement).toBe('bottom');
  });

  it('preserves other fields when changing placement', async () => {
    const original: SubtitleAppearanceConfig = {
      fontSize: 32,
      placement: 'bottom',
      areaWidthPct: 75,
      areaHeightPct: 12,
      offsetXPct: 3,
      offsetYPct: 10,
    };
    storage['nt_appearance_global'] = original;
    const loaded = await loadAppearanceConfig();
    const config = await saveAppearanceConfig({ ...loaded, placement: 'top' });
    expect(config.placement).toBe('top');
    expect(config.fontSize).toBe(32);
  });
});

describe('popup appearance config - reload round trip', () => {
  it('saves and reloads full config', async () => {
    const custom: SubtitleAppearanceConfig = {
      fontSize: 28,
      placement: 'top',
      areaWidthPct: 85,
      areaHeightPct: 18,
      offsetXPct: 5,
      offsetYPct: 15,
    };
    const saved = await saveAppearanceConfig(custom);
    expect(saved).toEqual(custom);
    const loaded = await loadAppearanceConfig();
    expect(loaded).toEqual(custom);
  });

  it('overwrites previous config on subsequent save', async () => {
    await saveAppearanceConfig({ fontSize: 36, placement: 'bottom' });
    await saveAppearanceConfig({ fontSize: 18, placement: 'top' });
    const loaded = await loadAppearanceConfig();
    expect(loaded.fontSize).toBe(18);
    expect(loaded.placement).toBe('top');
  });
});