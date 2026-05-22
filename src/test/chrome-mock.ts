// Chrome API Mock for unit testing
// Provides mock implementations of chrome.* APIs used by the extension

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MockFn = ReturnType<typeof vi.fn>;

export interface ChromeMock {
  storage: {
    local: {
      get: MockFn;
      set: MockFn;
      remove: MockFn;
    };
  };
  runtime: {
    sendMessage: MockFn;
    onMessage: {
      addListener: MockFn;
      removeListener: MockFn;
    };
    onInstalled: {
      addListener: MockFn;
    };
    getURL: MockFn;
  };
  tabs: {
    query: MockFn;
    sendMessage: MockFn;
  };
  scripting: {
    executeScript: MockFn;
  };
}

let chromeMockInstance: ChromeMock | null = null;

/**
 * Creates a fresh Chrome API mock.
 * Call this in beforeEach to ensure clean state between tests.
 */
export function createChromeMock(): ChromeMock {
  const mock: ChromeMock = {
    storage: {
      local: {
        get: vi.fn(),
        set: vi.fn(),
        remove: vi.fn(),
      },
    },
    runtime: {
      sendMessage: vi.fn(),
      onMessage: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
      onInstalled: {
        addListener: vi.fn(),
      },
      getURL: vi.fn((path: string) => `chrome-extension://test-id/${path}`) as MockFn,
    },
    tabs: {
      query: vi.fn(),
      sendMessage: vi.fn(),
    },
    scripting: {
      executeScript: vi.fn(),
    },
  };

  chromeMockInstance = mock;
  return mock;
}

/**
 * Installs the chrome mock onto the global scope.
 * This replaces `global.chrome` with the mock.
 */
export function installChromeMock(): ChromeMock {
  const mock = createChromeMock();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (global as any).chrome = mock;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (global as any).window = (global as any).window || {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (global as any).window.chrome = mock;
  return mock;
}

/**
 * Gets the current chrome mock instance (useful for assertions)
 */
export function getChromeMock(): ChromeMock {
  if (!chromeMockInstance) {
    throw new Error('Chrome mock not installed. Call installChromeMock() first.');
  }
  return chromeMockInstance;
}

/**
 * Resets all chrome mock function call histories
 */
export function resetChromeMock(): void {
  if (!chromeMockInstance) return;

  const resetFn = (fn: MockFn): void => {
    if (fn && typeof fn.mockClear === 'function') {
      fn.mockClear();
    }
  };

  // Reset all nested mocks
  resetFn(chromeMockInstance.storage.local.get);
  resetFn(chromeMockInstance.storage.local.set);
  resetFn(chromeMockInstance.storage.local.remove);
  resetFn(chromeMockInstance.runtime.sendMessage);
  resetFn(chromeMockInstance.runtime.onMessage.addListener);
  resetFn(chromeMockInstance.runtime.onMessage.removeListener);
  resetFn(chromeMockInstance.runtime.onInstalled.addListener);
  resetFn(chromeMockInstance.runtime.getURL);
  resetFn(chromeMockInstance.tabs.query);
  resetFn(chromeMockInstance.tabs.sendMessage);
  resetFn(chromeMockInstance.scripting.executeScript);
}
