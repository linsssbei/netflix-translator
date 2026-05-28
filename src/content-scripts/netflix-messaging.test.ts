import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SubtitleRenderer } from './subtitle-renderer';
import type { SubtitleAppearanceConfig } from '../shared/types';
import { DEFAULT_APPEARANCE_CONFIG } from '../shared/types';

vi.mock('./subtitle-renderer', () => {
  const mockRenderer = {
    isEnabled: vi.fn(() => false),
    enable: vi.fn(),
    disable: vi.fn(),
    updateStyle: vi.fn(),
  };
  return {
    SubtitleRenderer: vi.fn(() => mockRenderer),
    __mockRenderer: mockRenderer,
  };
});

const { __mockRenderer: mockRenderer } = vi.mocked(await import('./subtitle-renderer')) as any;

function createMessageListener() {
  const renderer = new SubtitleRenderer();

  const listener = (message: Record<string, any>, _sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
    if (message.type === 'TOGGLE_TRANSLATION') {
      const { enabled } = message;
      if (!enabled) {
        renderer.disable();
        sendResponse({ status: 'ok' });
      } else {
        sendResponse({ status: 'ok' });
      }
      return true;
    }

    if (message.type === 'UPDATE_SUBTITLE_STYLE') {
      if (renderer.isEnabled()) {
        renderer.updateStyle(message.config);
        sendResponse({ status: 'ok' });
      } else {
        sendResponse({ status: 'ok', note: 'renderer_disabled' });
      }
      return true;
    }

    if (message.type === 'GET_RENDERING_STATUS') {
      sendResponse({
        status: 'ok',
        enabled: renderer.isEnabled(),
      });
      return true;
    }

    sendResponse({ status: 'unknown_type' });
    return false;
  };

  return { renderer, listener };
}

describe('netflix.ts message listener - UPDATE_SUBTITLE_STYLE', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRenderer.isEnabled.mockReturnValue(false);
    mockRenderer.updateStyle.mockImplementation(() => {});
    mockRenderer.enable.mockImplementation(() => {
      mockRenderer.isEnabled.mockReturnValue(true);
    });
    mockRenderer.disable.mockImplementation(() => {
      mockRenderer.isEnabled.mockReturnValue(false);
    });
  });

  it('calls renderer.updateStyle when renderer is enabled', () => {
    mockRenderer.isEnabled.mockReturnValue(true);

    const { listener } = createMessageListener();
    const config: SubtitleAppearanceConfig = { ...DEFAULT_APPEARANCE_CONFIG, fontSize: 36 };

    let response: any;
    listener(
      { type: 'UPDATE_SUBTITLE_STYLE', config },
      {} as chrome.runtime.MessageSender,
      (r: any) => { response = r; }
    );

    expect(mockRenderer.updateStyle).toHaveBeenCalledTimes(1);
    expect(mockRenderer.updateStyle).toHaveBeenCalledWith(config);
    expect(response).toEqual({ status: 'ok' });
  });

  it('does not call renderer.updateStyle when renderer is disabled', () => {
    mockRenderer.isEnabled.mockReturnValue(false);

    const { listener } = createMessageListener();
    const config: SubtitleAppearanceConfig = { ...DEFAULT_APPEARANCE_CONFIG, fontSize: 36 };

    let response: any;
    listener(
      { type: 'UPDATE_SUBTITLE_STYLE', config },
      {} as chrome.runtime.MessageSender,
      (r: any) => { response = r; }
    );

    expect(mockRenderer.updateStyle).not.toHaveBeenCalled();
    expect(response).toEqual({ status: 'ok', note: 'renderer_disabled' });
  });

  it('returns ok status in both enabled and disabled cases', () => {
    mockRenderer.isEnabled.mockReturnValue(false);
    const { listener } = createMessageListener();

    let disabledResponse: any;
    listener(
      { type: 'UPDATE_SUBTITLE_STYLE', config: DEFAULT_APPEARANCE_CONFIG },
      {} as chrome.runtime.MessageSender,
      (r: any) => { disabledResponse = r; }
    );
    expect(disabledResponse.status).toBe('ok');

    mockRenderer.isEnabled.mockReturnValue(true);
    let enabledResponse: any;
    listener(
      { type: 'UPDATE_SUBTITLE_STYLE', config: DEFAULT_APPEARANCE_CONFIG },
      {} as chrome.runtime.MessageSender,
      (r: any) => { enabledResponse = r; }
    );
    expect(enabledResponse.status).toBe('ok');
  });

  it('returns note: renderer_disabled when renderer is disabled', () => {
    mockRenderer.isEnabled.mockReturnValue(false);
    const { listener } = createMessageListener();

    let response: any;
    listener(
      { type: 'UPDATE_SUBTITLE_STYLE', config: DEFAULT_APPEARANCE_CONFIG },
      {} as chrome.runtime.MessageSender,
      (r: any) => { response = r; }
    );

    expect(response.note).toBe('renderer_disabled');
  });

  it('returns no note when renderer is enabled and updateStyle succeeds', () => {
    mockRenderer.isEnabled.mockReturnValue(true);
    const { listener } = createMessageListener();

    let response: any;
    listener(
      { type: 'UPDATE_SUBTITLE_STYLE', config: DEFAULT_APPEARANCE_CONFIG },
      {} as chrome.runtime.MessageSender,
      (r: any) => { response = r; }
    );

    expect(response.note).toBeUndefined();
  });
});