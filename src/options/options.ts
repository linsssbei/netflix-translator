import { PROVIDER_REGISTRY, type ProviderDefinition } from '../shared/provider-registry';

console.log('[Netflix Translator] Options page loaded');

function findProviderDef(id: string): ProviderDefinition | undefined {
  return PROVIDER_REGISTRY.find((d) => d.id === id);
}

document.addEventListener('DOMContentLoaded', async () => {
  const providerSelect = document.getElementById('provider') as HTMLSelectElement;
  const apiKeyInput = document.getElementById('api-key') as HTMLInputElement;
  const modelInput = document.getElementById('model') as HTMLInputElement;
  const endpointInput = document.getElementById('custom-endpoint') as HTMLInputElement;
  const endpointGroup = endpointInput.closest('.form-group') as HTMLElement;
  const defaultLangSelect = document.getElementById('default-language') as HTMLSelectElement;
  const saveBtn = document.getElementById('save-btn') as HTMLButtonElement;
  const saveStatus = document.getElementById('save-status') as HTMLParagraphElement;

  // Populate provider dropdown from registry
  providerSelect.innerHTML = '';
  for (const def of PROVIDER_REGISTRY) {
    const option = document.createElement('option');
    option.value = def.id;
    option.textContent = def.label;
    providerSelect.appendChild(option);
  }

  // Apply endpoint visibility, placeholder, and required state from registry.
  // Does NOT overwrite model/endpoint values (those are user-provided or saved).
  function applyProviderVisibility(providerId: string) {
    const def = findProviderDef(providerId);
    if (!def) return;

    modelInput.placeholder = def.modelPlaceholder;

    if (endpointGroup) {
      if (def.endpointPolicy === 'hidden') {
        endpointGroup.style.display = 'none';
      } else {
        endpointGroup.style.display = '';
        endpointInput.required = def.endpointPolicy === 'required';
      }
    }
  }

  // When user changes provider, auto-fill defaults for model and endpoint
  providerSelect.addEventListener('change', () => {
    const def = findProviderDef(providerSelect.value);
    if (!def) return;

    if (def.defaultEndpoint) {
      endpointInput.value = def.defaultEndpoint;
    }
    if (def.defaultModel) {
      modelInput.value = def.defaultModel;
    }
    applyProviderVisibility(providerSelect.value);
  });

  // Load saved settings
  const result = await chrome.storage.local.get([
    'provider',
    'apiKey',
    'model',
    'customEndpoint',
    'targetLanguage',
  ]);

  const storedProvider = result.provider || 'deepseek';

  if (result.provider) {
    providerSelect.value = result.provider;
  } else {
    // No provider stored — default to deepseek selection in dropdown
    providerSelect.value = 'deepseek';
  }

  if (result.apiKey) apiKeyInput.value = result.apiKey;
  if (result.model) {
    modelInput.value = result.model;
  } else {
    // Populate default model when nothing is saved yet
    const def = findProviderDef(storedProvider);
    if (def?.defaultModel) {
      modelInput.value = def.defaultModel;
    }
  }

  if (result.customEndpoint) {
    endpointInput.value = result.customEndpoint;
  } else {
    // Populate default endpoint when nothing is saved yet
    const def = findProviderDef(storedProvider);
    if (def?.defaultEndpoint) {
      endpointInput.value = def.defaultEndpoint;
    }
  }

  if (result.targetLanguage) defaultLangSelect.value = result.targetLanguage;

  // Apply visibility without overwriting saved values
  applyProviderVisibility(storedProvider);

  saveBtn.addEventListener('click', async () => {
    const provider = providerSelect.value;
    const def = findProviderDef(provider);

    if (!apiKeyInput.value.trim()) {
      saveStatus.textContent = 'Error: API key is required.';
      setTimeout(() => { saveStatus.textContent = ''; }, 3000);
      return;
    }
    if (def && def.endpointPolicy === 'required' && !endpointInput.value.trim()) {
      saveStatus.textContent = `Error: Endpoint URL is required for ${def.label}.`;
      setTimeout(() => { saveStatus.textContent = ''; }, 3000);
      return;
    }
    if (!modelInput.value.trim()) {
      saveStatus.textContent = 'Error: Model name is required.';
      setTimeout(() => { saveStatus.textContent = ''; }, 3000);
      return;
    }

    await chrome.storage.local.set({
      provider,
      apiKey: apiKeyInput.value,
      model: modelInput.value,
      customEndpoint: endpointInput.value,
      targetLanguage: defaultLangSelect.value,
    });

    saveStatus.textContent = 'Settings saved!';
    setTimeout(() => { saveStatus.textContent = ''; }, 3000);
  });
});
