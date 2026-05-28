import { describe, it, expect } from 'vitest';
import {
  percentToPixels,
  pixelsToPercent,
  computeOverlayStyle,
  fitToArea,
  computeOverlayCSS,
  SUBTITLE_FONT_FAMILY,
  SUBTITLE_LINE_HEIGHT,
} from './subtitle-fit';
import type { SubtitleAppearanceConfig } from './types';
import { DEFAULT_APPEARANCE_CONFIG } from './types';

function makeRect(overrides: Partial<DOMRect> = {}): DOMRect {
  return {
    x: 0,
    y: 0,
    width: 1920,
    height: 1080,
    top: 0,
    right: 1920,
    bottom: 1080,
    left: 0,
    toJSON: () => ({}),
    ...overrides,
  };
}

function makeConfig(
  overrides: Partial<SubtitleAppearanceConfig> = {},
): SubtitleAppearanceConfig {
  return { ...DEFAULT_APPEARANCE_CONFIG, ...overrides };
}

function mockMeasure(
  _text: string,
  fontSize: number,
  maxWidth: number,
): { width: number; height: number } {
  const lineCount = Math.max(1, Math.ceil(_text.length * fontSize / maxWidth));
  return {
    width: Math.min(_text.length * fontSize * 0.6, maxWidth),
    height: lineCount * fontSize * SUBTITLE_LINE_HEIGHT,
  };
}

describe('percentToPixels', () => {
  it('converts percentage to pixels', () => {
    expect(percentToPixels(80, 1920)).toBe(1536);
    expect(percentToPixels(50, 1000)).toBe(500);
  });

  it('returns 0 for 0 percent', () => {
    expect(percentToPixels(0, 1920)).toBe(0);
  });

  it('returns full container for 100 percent', () => {
    expect(percentToPixels(100, 1920)).toBe(1920);
  });
});

describe('pixelsToPercent', () => {
  it('converts pixels to percentage', () => {
    expect(pixelsToPercent(1536, 1920)).toBeCloseTo(80);
    expect(pixelsToPercent(500, 1000)).toBeCloseTo(50);
  });

  it('returns 0 for zero container', () => {
    expect(pixelsToPercent(500, 0)).toBe(0);
  });

  it('round-trips with percentToPixels', () => {
    const pct = 75;
    const container = 1920;
    expect(pixelsToPercent(percentToPixels(pct, container), container)).toBeCloseTo(pct);
  });
});

describe('computeOverlayStyle', () => {
  it('uses default config with bottom placement', () => {
    const config = makeConfig();
    const rect = makeRect();
    const style = computeOverlayStyle(config, rect);

    expect(style.placement).toBe('bottom');
    expect(style.fontSize).toBe(24);
    expect(style.maxWidthPx).toBeCloseTo(1536);
    expect(style.overlayWidthPx).toBeCloseTo(1536);
    expect(style.overlayHeightPx).toBeCloseTo(162);
    expect(style.offsetXPx).toBeCloseTo(0);
    expect(style.offsetYPx).toBeCloseTo(129.6);
  });

  it('handles top placement', () => {
    const config = makeConfig({ placement: 'top' });
    const rect = makeRect();
    const style = computeOverlayStyle(config, rect);

    expect(style.placement).toBe('top');
  });

  it('respects custom area percentages', () => {
    const config = makeConfig({ areaWidthPct: 60, areaHeightPct: 20, offsetXPct: 5, offsetYPct: 8 });
    const rect = makeRect();
    const style = computeOverlayStyle(config, rect);

    expect(style.maxWidthPx).toBeCloseTo(1152);
    expect(style.overlayHeightPx).toBeCloseTo(216);
    expect(style.offsetXPx).toBeCloseTo(96);
    expect(style.offsetYPx).toBeCloseTo(86.4);
  });

  it('works with non-zero video rect origin', () => {
    const config = makeConfig();
    const rect = makeRect({ left: 100, top: 50, right: 2020, bottom: 1130 });
    const style = computeOverlayStyle(config, rect);

    expect(style.maxWidthPx).toBeCloseTo(1536);
    expect(style.offsetXPx).toBeCloseTo(0);
    expect(style.offsetYPx).toBeCloseTo(129.6);
  });
});

describe('fitToArea', () => {
  it('returns preferred font size when text fits', () => {
    const config = makeConfig({ fontSize: 24 });
    const rect = makeRect();
    const alwaysFit: typeof mockMeasure = (_t, _fs, _mw) => ({
      width: 100,
      height: 50,
    });

    const result = fitToArea('short text', config, rect, alwaysFit);
    expect(result.fontSize).toBe(24);
    expect(result.overflow).toBe(false);
  });

  it('reduces font size when text overflows at preferred size', () => {
    const config = makeConfig({ fontSize: 24 });
    const rect = makeRect();

    let callCount = 0;
    const measure: typeof mockMeasure = (_t, fontSize, _mw) => {
      callCount++;
      if (fontSize === 24) return { width: 2000, height: 500 };
      if (fontSize === 22) return { width: 2000, height: 500 };
      if (fontSize === 20) return { width: 100, height: 50 };
      return { width: 100, height: 50 };
    };

    const result = fitToArea('long text', config, rect, measure);
    expect(result.fontSize).toBe(20);
    expect(result.overflow).toBe(false);
  });

  it('returns minimum font size with overflow true when text never fits', () => {
    const config = makeConfig({ fontSize: 24 });
    const rect = makeRect();

    const neverFit: typeof mockMeasure = (_t, _fs, _mw) => ({
      width: 99999,
      height: 99999,
    });

    const result = fitToArea('extremely long text', config, rect, neverFit);
    expect(result.fontSize).toBe(12);
    expect(result.overflow).toBe(true);
  });

  it('reduces by 2px steps', () => {
    const config = makeConfig({ fontSize: 24 });
    const rect = makeRect();

    const fontSizes: number[] = [];
    const measure: typeof mockMeasure = (_t, fontSize, _mw) => {
      fontSizes.push(fontSize);
      return { width: 99999, height: 99999 };
    };

    fitToArea('text', config, rect, measure);

    expect(fontSizes).toEqual([24, 22, 20, 18, 16, 14, 12]);
  });

  it('uses minimum font size when text fits at minimum', () => {
    const config = makeConfig({ fontSize: 24 });
    const rect = makeRect();

    let callCount = 0;
    const measure: typeof mockMeasure = (_t, fontSize, _mw) => {
      callCount++;
      if (fontSize > 12) return { width: 99999, height: 99999 };
      return { width: 100, height: 50 };
    };

    const result = fitToArea('borderline text', config, rect, measure);
    expect(result.fontSize).toBe(12);
    expect(result.overflow).toBe(false);
  });

  it('handles empty text', () => {
    const config = makeConfig({ fontSize: 24 });
    const rect = makeRect();
    const measure: typeof mockMeasure = (_t, _fs, _mw) => ({ width: 0, height: 0 });

    const result = fitToArea('', config, rect, measure);
    expect(result.fontSize).toBe(24);
    expect(result.overflow).toBe(false);
  });

  it('handles very long text', () => {
    const config = makeConfig({ fontSize: 14 });
    const rect = makeRect();

    const neverFit: typeof mockMeasure = () => ({ width: 99999, height: 99999 });
    const result = fitToArea('a'.repeat(500), config, rect, neverFit);
    expect(result.fontSize).toBe(12);
    expect(result.overflow).toBe(true);
  });

  it('handles zero-width container by returning minimum size with overflow', () => {
    const config = makeConfig({ fontSize: 24 });
    const rect = makeRect({ width: 0, height: 0 });

    const measure: typeof mockMeasure = () => ({ width: 100, height: 50 });
    const result = fitToArea('text', config, rect, measure);
    expect(result.fontSize).toBe(12);
    expect(result.overflow).toBe(true);
  });
});

describe('computeOverlayCSS', () => {
  it('produces CSS with all required properties for bottom placement', () => {
    const config = makeConfig({ fontSize: 28 });
    const rect = makeRect();
    const style = computeOverlayStyle(config, rect);
    const css = computeOverlayCSS(style, rect);

    expect(css.position).toBe('fixed');
    expect(css.transform).toBe('translateX(-50%)');
    expect(css['font-size']).toBe('28px');
    expect(css['font-family']).toBe(SUBTITLE_FONT_FAMILY);
    expect(css['line-height']).toBe(String(SUBTITLE_LINE_HEIGHT));
    expect(css['word-break']).toBe('break-word');
    expect(css.overflow).toBe('hidden');
    expect(css['white-space']).toBe('pre-wrap');
    expect(css.bottom).toBeDefined();
    expect(css.top).toBeUndefined();
  });

  it('produces CSS with top property for top placement', () => {
    const config = makeConfig({ placement: 'top', fontSize: 20, offsetYPct: 5 });
    const rect = makeRect();
    const style = computeOverlayStyle(config, rect);
    const css = computeOverlayCSS(style, rect);

    expect(css.top).toBeDefined();
    expect(css.bottom).toBeUndefined();
  });

  it('includes safety overflow properties', () => {
    const config = makeConfig();
    const rect = makeRect();
    const style = computeOverlayStyle(config, rect);
    const css = computeOverlayCSS(style, rect);

    expect(css['word-break']).toBe('break-word');
    expect(css.overflow).toBe('hidden');
  });

  it('includes max-height based on overlayHeightPx', () => {
    const config = makeConfig({ areaHeightPct: 25, fontSize: 24 });
    const rect = makeRect({ width: 800, height: 450 });
    const style = computeOverlayStyle(config, rect);
    const css = computeOverlayCSS(style, rect);

    expect(css['max-height']).toBe(`${style.overlayHeightPx}px`);
  });
});

describe('constants', () => {
  it('exports font family string', () => {
    expect(SUBTITLE_FONT_FAMILY).toContain('BlinkMacSystemFont');
  });

  it('exports line height as number', () => {
    expect(SUBTITLE_LINE_HEIGHT).toBe(1.4);
  });
});