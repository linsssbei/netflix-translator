import { describe, it, expect } from 'vitest';
import { getChromeMock } from '../test/chrome-mock';

describe('Chrome Extension Testing Infrastructure', () => {
  it('chrome mock is installed and accessible', () => {
    expect(global.chrome).toBeDefined();
    expect(global.chrome.runtime).toBeDefined();
    expect(global.chrome.storage).toBeDefined();
    expect(global.chrome.tabs).toBeDefined();
  });

  it('chrome.storage.local.get can be mocked', async () => {
    const mock = getChromeMock();
    const mockData = { targetLanguage: 'zh', provider: 'openai' };
    mock.storage.local.get.mockResolvedValue(mockData);

    const result = await chrome.storage.local.get(['targetLanguage', 'provider']);
    
    expect(mock.storage.local.get).toHaveBeenCalledWith(['targetLanguage', 'provider']);
    expect(result).toEqual(mockData);
  });

  it('chrome.storage.local.set can be mocked', async () => {
    const mock = getChromeMock();
    mock.storage.local.set.mockResolvedValue(undefined);

    const settings = { targetLanguage: 'zh', provider: 'openai' };
    await chrome.storage.local.set(settings);
    
    expect(mock.storage.local.set).toHaveBeenCalledWith(settings);
  });

  it('chrome.runtime.sendMessage can be mocked', async () => {
    const mock = getChromeMock();
    const response = { status: 'video-detected', videoId: '12345' };
    mock.runtime.sendMessage.mockResolvedValue(response);

    const result = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
    
    expect(mock.runtime.sendMessage).toHaveBeenCalledWith({ type: 'GET_STATUS' });
    expect(result).toEqual(response);
  });

  it('chrome.tabs.query can be mocked', async () => {
    const mock = getChromeMock();
    const tabs = [{ id: 1, url: 'https://www.netflix.com/watch/12345' }];
    mock.tabs.query.mockResolvedValue(tabs);

    const result = await chrome.tabs.query({ active: true, currentWindow: true });
    
    expect(mock.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
    expect(result).toEqual(tabs);
  });

  it('chrome.runtime.getURL works with default mock', () => {
    const url = chrome.runtime.getURL('icons/icon-128.png');
    expect(url).toBe('chrome-extension://test-id/icons/icon-128.png');
  });

  it('DOM is available via happy-dom', () => {
    const div = document.createElement('div');
    div.id = 'test-element';
    div.textContent = 'Hello from test';
    document.body.appendChild(div);

    const found = document.getElementById('test-element');
    expect(found).not.toBeNull();
    expect(found?.textContent).toBe('Hello from test');
  });
});
