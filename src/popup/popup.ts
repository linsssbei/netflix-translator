document.addEventListener('DOMContentLoaded', () => {
  const statusEl = document.getElementById('status') as HTMLSpanElement;
  const controlsEl = document.getElementById('controls') as HTMLDivElement;
  const prepareBtn = document.getElementById('prepare-btn') as HTMLButtonElement;
  const targetLangSelect = document.getElementById('target-language') as HTMLSelectElement;

  let currentVideoId: string | null = null;

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs[0];
    const url = activeTab?.url || '';

    const match = url.match(/\/watch\/(\d+)/);
    if (match) {
      currentVideoId = match[1];
      statusEl.textContent = `Video: ${currentVideoId}`;
      controlsEl.classList.remove('hidden');

      // Query current library state
      chrome.runtime.sendMessage(
        { type: 'GET_STATUS', videoId: currentVideoId },
        (response) => {
          if (response?.readyCount > 0) {
            statusEl.textContent = `Ready — ${response.readyCount} translation(s)`;
            prepareBtn.textContent = 'Re-translate';
          }
        }
      );
    } else if (url.includes('netflix.com')) {
      statusEl.textContent = 'Navigate to a video';
    } else {
      statusEl.textContent = 'Not on Netflix';
    }
  });

  targetLangSelect.addEventListener('change', async () => {
    await chrome.storage.local.set({ targetLanguage: targetLangSelect.value });
  });

  // Load saved target language
  chrome.storage.local.get('targetLanguage', (result) => {
    if (result.targetLanguage) {
      targetLangSelect.value = result.targetLanguage;
    }
  });

  prepareBtn.addEventListener('click', () => {
    if (!currentVideoId) {
      statusEl.textContent = 'No video detected';
      return;
    }

    statusEl.textContent = 'Preparing translation...';
    prepareBtn.disabled = true;

    const targetLanguage = targetLangSelect.value;

    chrome.runtime.sendMessage(
      {
        type: 'PREPARE_SUBTITLES',
        videoId: currentVideoId,
        targetLanguage,
      },
      (response) => {
        prepareBtn.disabled = false;
        if (chrome.runtime.lastError) {
          statusEl.textContent = 'Error: ' + chrome.runtime.lastError.message;
          return;
        }
        if (response?.status === 'ok') {
          statusEl.textContent = 'Translation ready!';
        } else {
          statusEl.textContent = 'Failed: ' + (response?.message || 'unknown error');
        }
      }
    );
  });
});
