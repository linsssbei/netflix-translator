import { describe, it, expect } from 'vitest';
import type { ExtensionMessage, SubtitleAppearanceConfig } from '../shared/types';
import { DEFAULT_APPEARANCE_CONFIG } from '../shared/types';

describe('ExtensionMessage - UPDATE_SUBTITLE_STYLE', () => {
  it('creates a valid UPDATE_SUBTITLE_STYLE message', () => {
    const config: SubtitleAppearanceConfig = { ...DEFAULT_APPEARANCE_CONFIG };
    const msg: ExtensionMessage = {
      type: 'UPDATE_SUBTITLE_STYLE',
      config,
    };
    expect(msg.type).toBe('UPDATE_SUBTITLE_STYLE');
    expect(msg.config).toEqual(DEFAULT_APPEARANCE_CONFIG);
  });

  it('serializes and deserializes via JSON round-trip', () => {
    const config: SubtitleAppearanceConfig = {
      fontSize: 36,
      placement: 'top',
      areaWidthPct: 60,
      areaHeightPct: 20,
      offsetXPct: 10,
      offsetYPct: 5,
    };
    const msg: ExtensionMessage = {
      type: 'UPDATE_SUBTITLE_STYLE',
      config,
    };
    const json = JSON.stringify(msg);
    const parsed = JSON.parse(json) as ExtensionMessage;
    expect(parsed.type).toBe('UPDATE_SUBTITLE_STYLE');
    if (parsed.type === 'UPDATE_SUBTITLE_STYLE') {
      expect(parsed.config.fontSize).toBe(36);
      expect(parsed.config.placement).toBe('top');
      expect(parsed.config.areaWidthPct).toBe(60);
      expect(parsed.config.areaHeightPct).toBe(20);
      expect(parsed.config.offsetXPct).toBe(10);
      expect(parsed.config.offsetYPct).toBe(5);
    }
  });
});

describe('ExtensionMessage - TOGGLE_TRANSLATION with appearanceConfig', () => {
  it('creates TOGGLE_TRANSLATION without appearanceConfig', () => {
    const msg: ExtensionMessage = {
      type: 'TOGGLE_TRANSLATION',
      enabled: true,
      videoId: 'v1',
      targetLanguage: 'es',
    };
    expect(msg.type).toBe('TOGGLE_TRANSLATION');
  });

  it('creates TOGGLE_TRANSLATION with appearanceConfig', () => {
    const config: SubtitleAppearanceConfig = {
      ...DEFAULT_APPEARANCE_CONFIG,
      fontSize: 30,
      placement: 'top',
    };
    const msg: ExtensionMessage = {
      type: 'TOGGLE_TRANSLATION',
      enabled: true,
      videoId: 'v1',
      targetLanguage: 'es',
      appearanceConfig: config,
    };
    expect(msg.type).toBe('TOGGLE_TRANSLATION');
    if (msg.type === 'TOGGLE_TRANSLATION') {
      expect(msg.appearanceConfig).toBeDefined();
      expect(msg.appearanceConfig?.fontSize).toBe(30);
      expect(msg.appearanceConfig?.placement).toBe('top');
    }
  });

  it('serializes TOGGLE_TRANSLATION with optional appearanceConfig via JSON', () => {
    const config: SubtitleAppearanceConfig = {
      ...DEFAULT_APPEARANCE_CONFIG,
      placement: 'bottom',
    };
    const msg: ExtensionMessage = {
      type: 'TOGGLE_TRANSLATION',
      enabled: false,
      appearanceConfig: config,
    };
    const json = JSON.stringify(msg);
    const parsed = JSON.parse(json) as ExtensionMessage;
    expect(parsed.type).toBe('TOGGLE_TRANSLATION');
    if (parsed.type === 'TOGGLE_TRANSLATION') {
      expect(parsed.appearanceConfig).toBeDefined();
      expect(parsed.appearanceConfig?.placement).toBe('bottom');
    }
  });
});