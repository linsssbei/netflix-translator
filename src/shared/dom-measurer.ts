import type { MeasureFn } from './subtitle-fit';
import { SUBTITLE_FONT_FAMILY, SUBTITLE_LINE_HEIGHT } from './subtitle-fit';

let measurerEl: HTMLSpanElement | null = null;

function getOrCreateMeasurer(): HTMLSpanElement {
  if (measurerEl && measurerEl.parentNode) return measurerEl;

  const span = document.createElement('span');
  span.style.cssText = `
    position: absolute;
    visibility: hidden;
    white-space: pre-wrap;
    word-break: break-word;
    line-height: ${SUBTITLE_LINE_HEIGHT};
    font-family: ${SUBTITLE_FONT_FAMILY};
    font-weight: 500;
    pointer-events: none;
    top: -9999px;
    left: -9999px;
  `;
  document.body.appendChild(span);
  measurerEl = span;
  return span;
}

export const createDomMeasurer = (): MeasureFn => {
  return (text: string, fontSize: number, maxWidth: number) => {
    const el = getOrCreateMeasurer();
    el.style.fontSize = `${fontSize}px`;
    el.style.maxWidth = `${maxWidth}px`;
    el.textContent = text;

    const width = el.offsetWidth;
    const height = el.offsetHeight;

    el.textContent = '';

    return { width, height };
  };
};