import type { SubtitleAppearanceConfig } from './types';

export const SUBTITLE_FONT_FAMILY =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
export const SUBTITLE_LINE_HEIGHT = 1.4;

export type MeasureFn = (
  text: string,
  fontSize: number,
  maxWidth: number,
) => { width: number; height: number };

export interface OverlayStyleResult {
  fontSize: number;
  maxWidthPx: number;
  placement: 'top' | 'bottom';
  offsetXPx: number;
  offsetYPx: number;
  overlayWidthPx: number;
  overlayHeightPx: number;
}

export interface FitToAreaResult {
  fontSize: number;
  overflow: boolean;
}

const MIN_FONT_SIZE = 12;

export function percentToPixels(pct: number, containerPx: number): number {
  return (pct / 100) * containerPx;
}

export function pixelsToPercent(px: number, containerPx: number): number {
  if (containerPx === 0) return 0;
  return (px / containerPx) * 100;
}

export function computeOverlayStyle(
  config: SubtitleAppearanceConfig,
  videoRect: DOMRect,
): OverlayStyleResult {
  const overlayWidthPx = percentToPixels(config.areaWidthPct, videoRect.width);
  const overlayHeightPx = percentToPixels(config.areaHeightPct, videoRect.height);
  const offsetXPx = percentToPixels(config.offsetXPct, videoRect.width);
  const offsetYPx = percentToPixels(config.offsetYPct, videoRect.height);

  return {
    fontSize: config.fontSize,
    maxWidthPx: overlayWidthPx,
    placement: config.placement,
    offsetXPx,
    offsetYPx,
    overlayWidthPx,
    overlayHeightPx,
  };
}

export function fitToArea(
  text: string,
  config: SubtitleAppearanceConfig,
  videoRect: DOMRect,
  measure: MeasureFn,
): FitToAreaResult {
  const maxWidthPx = percentToPixels(config.areaWidthPct, videoRect.width);
  const maxHeightPx = percentToPixels(config.areaHeightPct, videoRect.height);
  const preferredFontSize = config.fontSize;

  const { width, height } = measure(text, preferredFontSize, maxWidthPx);
  if (width <= maxWidthPx && height <= maxHeightPx) {
    return { fontSize: preferredFontSize, overflow: false };
  }

  for (
    let fontSize = preferredFontSize - 2;
    fontSize >= MIN_FONT_SIZE;
    fontSize -= 2
  ) {
    const measurement = measure(text, fontSize, maxWidthPx);
    if (measurement.width <= maxWidthPx && measurement.height <= maxHeightPx) {
      return { fontSize, overflow: false };
    }
  }

  return { fontSize: MIN_FONT_SIZE, overflow: true };
}

export function computeOverlayCSS(
  style: OverlayStyleResult,
  videoRect: DOMRect,
): Record<string, string> {
  const leftPx = videoRect.left + videoRect.width / 2 + style.offsetXPx;
  const topOrBottomProp = style.placement === 'top' ? 'top' : 'bottom';
  const verticalOffset =
    style.placement === 'top'
      ? videoRect.top + style.offsetYPx
      : window.innerHeight - videoRect.bottom + style.offsetYPx;

  return {
    position: 'fixed',
    left: `${leftPx}px`,
    [topOrBottomProp]: `${verticalOffset}px`,
    transform: 'translateX(-50%)',
    'max-width': `${style.maxWidthPx}px`,
    'font-size': `${style.fontSize}px`,
    'text-align': 'center',
    'pointer-events': 'none',
    'z-index': '9999',
    'font-family': SUBTITLE_FONT_FAMILY,
    'font-weight': '500',
    color: '#ffffff',
    'text-shadow':
      '1px 1px 2px rgba(0, 0, 0, 0.8), 0 0 4px rgba(0, 0, 0, 0.6)',
    'line-height': String(SUBTITLE_LINE_HEIGHT),
    'white-space': 'pre-wrap',
    'word-break': 'break-word',
    overflow: 'hidden',
    padding: '8px 16px',
    background: 'transparent',
    'border-radius': '4px',
    transition: 'opacity 0.2s ease',
    opacity: '0',
  };
}