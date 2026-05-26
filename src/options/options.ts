// Netflix Translator - Options Page Script
// Manages extension settings

console.log('[Netflix Translator] Options page loaded');

document.addEventListener('DOMContentLoaded', async () => {
  const providerSelect = document.getElementById('provider') as HTMLSelectElement;
  const apiKeyInput = document.getElementById('api-key') as HTMLInputElement;
  const modelInput = document.getElementById('model') as HTMLInputElement;
  const customEndpointInput = document.getElementById('custom-endpoint') as HTMLInputElement;
  const defaultLangSelect = document.getElementById('default-language') as HTMLSelectElement;
  const saveBtn = document.getElementById('save-btn') as HTMLButtonElement;
  const saveStatus = document.getElementById('save-status') as HTMLParagraphElement;

  // Auto-set defaults when provider changes
  providerSelect.addEventListener('change', () => {
    const provider = providerSelect.value;
    if (provider === 'deepseek') {
      if (!customEndpointInput.value || customEndpointInput.value.includes('deepseek')) {
        customEndpointInput.value = 'https://api.deepseek.com/v1/chat/completions';
      }
      if (
        !modelInput.value ||
        modelInput.value === 'gpt-4o-mini' ||
        modelInput.value === 'deepseek-chat'
      ) {
        modelInput.value = 'deepseek-v4-pro';
      }
    } else if (provider === 'openai') {
      customEndpointInput.value = 'https://api.openai.com/v1/chat/completions';
      modelInput.value = 'gpt-4o-mini';
    } else if (provider === 'anthropic') {
      customEndpointInput.value = 'https://api.anthropic.com/v1/messages';
      modelInput.value = 'claude-3-5-sonnet-latest';
    }
  });

  // Load saved settings
  const result = await chrome.storage.local.get([
    'provider',
    'apiKey',
    'model',
    'customEndpoint',
    'targetLanguage',
  ]);

  if (result.provider) providerSelect.value = result.provider;
  if (result.apiKey) apiKeyInput.value = result.apiKey;
  if (result.model) modelInput.value = result.model;
  if (result.customEndpoint) customEndpointInput.value = result.customEndpoint;
  if (result.targetLanguage) defaultLangSelect.value = result.targetLanguage;

  saveBtn.addEventListener('click', async () => {
    await chrome.storage.local.set({
      provider: providerSelect.value,
      apiKey: apiKeyInput.value,
      model: modelInput.value,
      customEndpoint: customEndpointInput.value,
      targetLanguage: defaultLangSelect.value,
    });

    saveStatus.textContent = 'Settings saved!';
    setTimeout(() => { saveStatus.textContent = ''; }, 3000);
  });
});
