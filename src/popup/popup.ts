// Netflix Translator - Popup Script
// Controls the extension popup UI

console.log('[Netflix Translator] Popup loaded');

document.addEventListener('DOMContentLoaded', () => {
  const statusEl = document.getElementById('status') as HTMLSpanElement;
  const controlsEl = document.getElementById('controls') as HTMLDivElement;
  // const targetLangSelect = document.getElementById('target-language') as HTMLSelectElement;
  const prepareBtn = document.getElementById('prepare-btn') as HTMLButtonElement;
  const toggleBtn = document.getElementById('toggle-btn') as HTMLButtonElement;

  // Query current tab to check if we're on Netflix
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs[0];
    if (activeTab?.url?.includes('netflix.com/watch/')) {
      statusEl.textContent = 'Netflix video detected';
      controlsEl.classList.remove('hidden');
    } else if (activeTab?.url?.includes('netflix.com')) {
      statusEl.textContent = 'Navigate to a video to begin';
    } else {
      statusEl.textContent = 'Not on Netflix';
    }
  });

  prepareBtn.addEventListener('click', async () => {
    console.log('[Popup] Prepare subtitles clicked');
    // TODO: Send prepare message to content script
  });

  toggleBtn.addEventListener('click', async () => {
    console.log('[Popup] Toggle translation clicked');
    // TODO: Send toggle message to content script
  });
});
