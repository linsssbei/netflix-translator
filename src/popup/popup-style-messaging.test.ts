/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { SubtitleAppearanceConfig } from '../shared/types';
import { DEFAULT_APPEARANCE_CONFIG } from '../shared/types';

let storage: Record<string, unknown> = {};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let tabsQueryMock: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let tabsSendMessageMock: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let runtimeSendMessageMock: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let storageLocalGetMock: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let storageLocalSetMock: any;

beforeEach(() => {
  storage = {};
  vi.useFakeTimers();

  tabsQueryMock = vi.fn((...args: any[]) => {
    const callback = args[args.length - 1];
    callback([{ id: 42, url: 'https://www.netflix.com/watch/12345' }]);
  });

  tabsSendMessageMock = vi.fn((...args: any[]) => {
    const callback = typeof args[2] === 'function' ? args[2] : typeof args[3] === 'function' ? args[3] : undefined;
    if (callback) {
      callback({ status: 'ok' });
    }
  });

  runtimeSendMessageMock = vi.fn((...args: any[]) => {
    const callback = typeof args[1] === 'function' ? args[1] : undefined;
    if (callback) {
      callback({ status: 'ok' });
    }
  });

  storageLocalGetMock = vi.fn(async (keys: string | string[] | null) => {
    if (keys === null) return { ...storage };
    const keyList = Array.isArray(keys) ? keys : [keys];
    const result: Record<string, unknown> = {};
    for (const k of keyList) {
      if (storage[k] !== undefined) {
        result[k] = storage[k];
      }
    }
    return result;
  });

  storageLocalSetMock = vi.fn(async (items: Record<string, unknown>) => {
    Object.assign(storage, items);
  });

  (globalThis as any).chrome = {
    storage: {
      local: {
        get: storageLocalGetMock,
        set: storageLocalSetMock,
      },
    },
    runtime: {
      sendMessage: runtimeSendMessageMock,
      onMessage: {
        addListener: vi.fn(),
      },
      lastError: undefined,
    },
    tabs: {
      query: tabsQueryMock,
      sendMessage: tabsSendMessageMock,
    },
  };
});

afterEach(() => {
  vi.useRealTimers();
});

function makeSendStyleUpdate() {
  let styleDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  function sendStyleUpdate(cfg: SubtitleAppearanceConfig) {
    if (styleDebounceTimer) clearTimeout(styleDebounceTimer);
    styleDebounceTimer = setTimeout(() => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any[]) => {
        const activeTab = tabs[0];
        if (!activeTab?.id) return;
        chrome.tabs.sendMessage(activeTab.id, {
          type: 'UPDATE_SUBTITLE_STYLE',
          config: cfg,
        }, () => {
          if (chrome.runtime.lastError) { /* ignore */ }
        });
      });
    }, 100);
  }

  return sendStyleUpdate;
}

describe('popup style messaging - sendStyleUpdate debounce', () => {
  it('sends UPDATE_SUBTITLE_STYLE after 100ms debounce', () => {
    const sendStyleUpdate = makeSendStyleUpdate();
    const config: SubtitleAppearanceConfig = { ...DEFAULT_APPEARANCE_CONFIG, fontSize: 30 };

    sendStyleUpdate(config);

    expect(tabsSendMessageMock).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);

    expect(tabsSendMessageMock).toHaveBeenCalledTimes(1);
    expect(tabsSendMessageMock).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ type: 'UPDATE_SUBTITLE_STYLE', config }),
      expect.any(Function)
    );
  });

  it('debounces multiple rapid calls to a single send after 100ms', () => {
    const sendStyleUpdate = makeSendStyleUpdate();
    const config1: SubtitleAppearanceConfig = { ...DEFAULT_APPEARANCE_CONFIG, fontSize: 24 };
    const config2: SubtitleAppearanceConfig = { ...DEFAULT_APPEARANCE_CONFIG, fontSize: 28 };
    const config3: SubtitleAppearanceConfig = { ...DEFAULT_APPEARANCE_CONFIG, fontSize: 32 };

    sendStyleUpdate(config1);
    vi.advanceTimersByTime(30);
    sendStyleUpdate(config2);
    vi.advanceTimersByTime(30);
    sendStyleUpdate(config3);

    expect(tabsSendMessageMock).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);

    expect(tabsSendMessageMock).toHaveBeenCalledTimes(1);
    expect(tabsSendMessageMock).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ type: 'UPDATE_SUBTITLE_STYLE', config: config3 }),
      expect.any(Function)
    );
  });

  it('does not send when no active tab is found', () => {
    tabsQueryMock = vi.fn((...args: any[]) => {
      const callback = args[args.length - 1];
      callback([]);
    });
    (globalThis as any).chrome.tabs.query = tabsQueryMock;

    const sendStyleUpdate = makeSendStyleUpdate();
    const config: SubtitleAppearanceConfig = { ...DEFAULT_APPEARANCE_CONFIG };

    sendStyleUpdate(config);
    vi.advanceTimersByTime(100);

    expect(tabsSendMessageMock).not.toHaveBeenCalled();
  });
});

describe('popup style messaging - error-tolerant fallback', () => {
  it('silently handles chrome.runtime.lastError in sendMessage callback', () => {
    tabsSendMessageMock = vi.fn((...args: any[]) => {
      (globalThis as any).chrome.runtime.lastError = { message: 'Could not establish connection' };
      const callback = typeof args[2] === 'function' ? args[2] : undefined;
      if (callback) {
        callback(undefined);
      }
      (globalThis as any).chrome.runtime.lastError = undefined;
    });
    (globalThis as any).chrome.tabs.sendMessage = tabsSendMessageMock;

    const sendStyleUpdate = makeSendStyleUpdate();
    const config: SubtitleAppearanceConfig = { ...DEFAULT_APPEARANCE_CONFIG };

    expect(() => {
      sendStyleUpdate(config);
      vi.advanceTimersByTime(100);
    }).not.toThrow();
  });
});

async function loadAppearanceConfigTest(): Promise<SubtitleAppearanceConfig> {
  const result = await chrome.storage.local.get('nt_appearance_global') as Record<string, unknown>;
  const stored = result['nt_appearance_global'] as Partial<SubtitleAppearanceConfig> | undefined;
  if (!stored) return { ...DEFAULT_APPEARANCE_CONFIG };
  return { ...DEFAULT_APPEARANCE_CONFIG, ...stored };
}

describe('popup style messaging - TOGGLE_TRANSLATION includes appearanceConfig', () => {
  it('loads appearanceConfig and includes it in TOGGLE_TRANSLATION message', async () => {
    const storedConfig: SubtitleAppearanceConfig = {
      fontSize: 30,
      placement: 'top',
      areaWidthPct: 75,
      areaHeightPct: 18,
      offsetXPct: 5,
      offsetYPct: 10,
    };
    storage['nt_appearance_global'] = storedConfig;

    async function toggleTranslation(enabled: boolean, videoId: string | null, targetLanguage: string) {
      const appearanceConfig = await loadAppearanceConfigTest();
      chrome.runtime.sendMessage(
        {
          type: 'TOGGLE_TRANSLATION',
          enabled,
          videoId,
          targetLanguage,
          appearanceConfig,
        },
        () => {}
      );
    }

    await toggleTranslation(true, '12345', 'zh-CN');

    expect(runtimeSendMessageMock).toHaveBeenCalledTimes(1);
    const message = runtimeSendMessageMock.mock.calls[0][0] as Record<string, unknown>;
    expect(message.type).toBe('TOGGLE_TRANSLATION');
    expect(message.appearanceConfig).toEqual(storedConfig);
    expect(message.enabled).toBe(true);
    expect(message.videoId).toBe('12345');
    expect(message.targetLanguage).toBe('zh-CN');
  });

  it('uses default appearanceConfig when nothing is stored', async () => {
    async function toggleTranslation(enabled: boolean, videoId: string | null, targetLanguage: string) {
      const appearanceConfig = await loadAppearanceConfigTest();
      chrome.runtime.sendMessage(
        {
          type: 'TOGGLE_TRANSLATION',
          enabled,
          videoId,
          targetLanguage,
          appearanceConfig,
        },
        () => {}
      );
    }

    await toggleTranslation(false, null, 'es');

    expect(runtimeSendMessageMock).toHaveBeenCalledTimes(1);
    const message = runtimeSendMessageMock.mock.calls[0][0] as Record<string, unknown>;
    expect(message.appearanceConfig).toEqual(DEFAULT_APPEARANCE_CONFIG);
  });
});