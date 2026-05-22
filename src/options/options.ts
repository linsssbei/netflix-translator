// Netflix Translator - Options Page Script
// Manages extension settings

console.log('[Netflix Translator] Options page loaded');

document.addEventListener('DOMContentLoaded', async () => {
  const providerSelect = document.getElementById('provider') as HTMLSelectElement;
  const apiKeyInput = document.getElementById('api-key') as HTMLInputElement;
  const customEndpointInput = document.getElementById('custom-endpoint') as HTMLInputElement;
  const defaultLangSelect = document.getElementById('default-language') as HTMLSelectElement;
  const saveBtn = document.getElementById('save-btn') as HTMLButtonElement;
  const saveStatus = document.getElementById('save-status') as HTMLParagraphElement;

  // Load saved settings
  const result = await chrome.storage.local.get([
    'provider',
    'apiKey',
    'customEndpoint',
    'defaultLanguage',
  ]);

  if (result.provider) providerSelect.value = result.provider;
  if (result.apiKey) apiKeyInput.value = result.apiKey;
  if (result.customEndpoint) customEndpointInput.value = result.customEndpoint;
  if (result.defaultLanguage) defaultLangSelect.value = result.defaultLanguage;

  saveBtn.addEventListener('click', async () => {
    await chrome.storage.local.set({
      provider: providerSelect.value,
      apiKey: apiKeyInput.value,
      customEndpoint: customEndpointInput.value,
      defaultLanguage: defaultLangSelect.value,
    });

    saveStatus.textContent = 'Settings saved successfully!';
    setTimeout(() => {
      saveStatus.textContent = '';
    }, 3000);
  });
});
