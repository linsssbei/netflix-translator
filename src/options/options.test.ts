import { describe, it, expect, vi, beforeEach } from 'vitest';

const storageData: Record<string, unknown> = {};

beforeEach(() => {
  Object.keys(storageData).forEach((k) => delete storageData[k]);
  vi.resetModules();
});

describe('Options page behavior', () => {
  let providerSelect: HTMLSelectElement;
  let apiKeyInput: HTMLInputElement;
  let modelInput: HTMLInputElement;
  let endpointInput: HTMLInputElement;
  let endpointGroup: HTMLElement;
  let saveBtn: HTMLButtonElement;
  let saveStatus: HTMLParagraphElement;

  const buildDom = () => {
    document.body.innerHTML = `
      <div id="app">
        <section>
          <div class="form-group">
            <label for="provider">Provider</label>
            <select id="provider">
              <option value="deepseek">DeepSeek</option>
            </select>
          </div>
          <div class="form-group">
            <label for="api-key">API Key</label>
            <input type="password" id="api-key" placeholder="Enter your API key">
          </div>
          <div class="form-group">
            <label for="model">Model</label>
            <input type="text" id="model" placeholder="deepseek-chat">
          </div>
          <div class="form-group">
            <label for="custom-endpoint">Endpoint URL</label>
            <input type="text" id="custom-endpoint" placeholder="https://api.deepseek.com/v1/chat/completions">
          </div>
        </section>
        <section>
          <div class="form-group">
            <label for="default-language">Default Target Language</label>
            <select id="default-language">
              <option value="zh-CN">Chinese</option>
            </select>
          </div>
        </section>
        <button id="save-btn">Save Settings</button>
        <p id="save-status"></p>
      </div>`;

    providerSelect = document.getElementById('provider') as HTMLSelectElement;
    apiKeyInput = document.getElementById('api-key') as HTMLInputElement;
    modelInput = document.getElementById('model') as HTMLInputElement;
    endpointInput = document.getElementById('custom-endpoint') as HTMLInputElement;
    endpointGroup = endpointInput.closest('.form-group') as HTMLElement;
    saveBtn = document.getElementById('save-btn') as HTMLButtonElement;
    saveStatus = document.getElementById('save-status') as HTMLParagraphElement;
  };

  const setupChrome = () => {
    const storage = {
      local: {
        get: vi.fn((keys: string[]) => {
          const result: Record<string, unknown> = {};
          for (const key of keys) {
            if (key in storageData) result[key] = storageData[key];
          }
          return Promise.resolve(result);
        }),
        set: vi.fn((items: Record<string, unknown>) => {
          Object.assign(storageData, items);
          return Promise.resolve();
        }),
      },
    };
    vi.stubGlobal('chrome', {
      runtime: { getURL: vi.fn((p: string) => `chrome-extension://test-id/${p}`) },
      storage,
      tabs: { query: vi.fn().mockResolvedValue([]) },
    });
    return storage.local;
  };

  beforeEach(() => {
    buildDom();
  });

  async function loadAndWait() {
    const storage = setupChrome();
    await import('../options/options');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    // Wait for async DOMContentLoaded handler to complete its storage calls
    await new Promise((r) => setTimeout(r, 0));
    return storage;
  }

  it('populates provider dropdown from registry on load', async () => {
    const storage = await loadAndWait();

    const options = Array.from(providerSelect.options).map((o) => o.value);
    expect(options).toContain('deepseek');
    expect(options).toContain('openai');
    expect(options).toContain('gemini');
    expect(options).toContain('anthropic');
    expect(options).toContain('openai-compatible');
    // Verify storage.get was called to load settings
    expect(storage.get).toHaveBeenCalled();
  });

  it('fills default model and endpoint when no saved settings exist', async () => {
    await loadAndWait();

    // DeepSeek is the default provider, so its defaults should be populated
    expect(modelInput.value).toBe('deepseek-chat');
    expect(endpointInput.value).toBe('https://api.deepseek.com/v1');
  });

  it('preserves saved model and endpoint on reload', async () => {
    storageData.provider = 'openai';
    storageData.apiKey = 'sk-test-key';
    storageData.model = 'gpt-4o-mini';
    storageData.customEndpoint = 'https://custom.openai.example.com/v1';

    await loadAndWait();

    expect(providerSelect.value).toBe('openai');
    expect(apiKeyInput.value).toBe('sk-test-key');
    // Saved values must NOT be overwritten by provider defaults
    expect(modelInput.value).toBe('gpt-4o-mini');
    expect(endpointInput.value).toBe('https://custom.openai.example.com/v1');
  });

  it('auto-fills model/endpoint defaults when user switches provider', async () => {
    await loadAndWait();

    expect(modelInput.value).toBe('deepseek-chat');

    // User switches to OpenAI
    providerSelect.value = 'openai';
    providerSelect.dispatchEvent(new Event('change'));

    expect(modelInput.value).toBe('gpt-4o');
    expect(endpointInput.value).toBe('https://api.openai.com/v1');

    // User switches to Anthropic
    providerSelect.value = 'anthropic';
    providerSelect.dispatchEvent(new Event('change'));

    expect(modelInput.value).toBe('claude-3-5-sonnet-latest');
    expect(endpointInput.value).toBe('https://api.anthropic.com/v1');
  });

  it('hides endpoint field when Gemini is selected', async () => {
    await loadAndWait();

    providerSelect.value = 'gemini';
    providerSelect.dispatchEvent(new Event('change'));

    expect(endpointGroup.style.display).toBe('none');
  });

  it('shows endpoint field when switching back from Gemini', async () => {
    await loadAndWait();

    providerSelect.value = 'gemini';
    providerSelect.dispatchEvent(new Event('change'));
    expect(endpointGroup.style.display).toBe('none');

    providerSelect.value = 'openai';
    providerSelect.dispatchEvent(new Event('change'));
    expect(endpointGroup.style.display).toBe('');
  });

  it('marks endpoint required for openai-compatible provider', async () => {
    await loadAndWait();

    providerSelect.value = 'openai-compatible';
    providerSelect.dispatchEvent(new Event('change'));

    expect(endpointInput.required).toBe(true);
  });

  it('marks endpoint not required for openai provider', async () => {
    await loadAndWait();

    providerSelect.value = 'openai-compatible';
    providerSelect.dispatchEvent(new Event('change'));
    expect(endpointInput.required).toBe(true);

    // Switch away — endpoint should no longer be required
    providerSelect.value = 'openai';
    providerSelect.dispatchEvent(new Event('change'));
    expect(endpointInput.required).toBe(false);
  });

  it('saves provider, apiKey, model, and endpoint', async () => {
    const storage = await loadAndWait();

    providerSelect.value = 'openai';
    providerSelect.dispatchEvent(new Event('change'));
    apiKeyInput.value = 'sk-saved-key';
    modelInput.value = 'gpt-4o-mini';
    endpointInput.value = 'https://my-openai-proxy/v1';

    // Direct click on button triggers the handler registered by options.ts
    saveBtn.click();

    // Wait for async save to complete
    await new Promise((r) => setTimeout(r, 0));

    expect(storage.set).toHaveBeenCalledWith({
      provider: 'openai',
      apiKey: 'sk-saved-key',
      model: 'gpt-4o-mini',
      customEndpoint: 'https://my-openai-proxy/v1',
      targetLanguage: 'zh-CN',
    });
  });

  it('shows error when saving without API key', async () => {
    await loadAndWait();

    apiKeyInput.value = '';
    saveBtn.click();

    await new Promise((r) => setTimeout(r, 0));
    expect(saveStatus.textContent).toContain('API key is required');
  });

  it('shows error when saving openai-compatible without endpoint', async () => {
    await loadAndWait();

    providerSelect.value = 'openai-compatible';
    providerSelect.dispatchEvent(new Event('change'));
    apiKeyInput.value = 'sk-test';
    modelInput.value = 'my-model';
    endpointInput.value = '';
    saveBtn.click();

    await new Promise((r) => setTimeout(r, 0));
    expect(saveStatus.textContent).toContain('Endpoint URL is required');
  });

  it('shows error when saving without model', async () => {
    await loadAndWait();

    apiKeyInput.value = 'sk-test';
    modelInput.value = '';
    saveBtn.click();

    await new Promise((r) => setTimeout(r, 0));
    expect(saveStatus.textContent).toContain('Model name is required');
  });

  it('does not save when validation fails', async () => {
    const storage = await loadAndWait();

    apiKeyInput.value = '';
    saveBtn.click();

    await new Promise((r) => setTimeout(r, 0));
    expect(storage.set).not.toHaveBeenCalled();
  });

  it('saves with model field included', async () => {
    const storage = await loadAndWait();

    providerSelect.value = 'deepseek';
    providerSelect.dispatchEvent(new Event('change'));
    apiKeyInput.value = 'sk-test';
    saveBtn.click();

    await new Promise((r) => setTimeout(r, 0));
    expect(storage.set).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'deepseek',
        model: 'deepseek-chat',
      })
    );
  });
});
