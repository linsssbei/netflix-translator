import { SubtitleAppearanceConfig } from '../shared/types';
import { loadAppearanceConfig, saveAppearanceConfig } from '../shared/appearance-config';
import { percentToPixels, pixelsToPercent, SUBTITLE_FONT_FAMILY, SUBTITLE_LINE_HEIGHT, fitToArea } from '../shared/subtitle-fit';
import { createDomMeasurer } from '../shared/dom-measurer';

export const PREVIEW_SAMPLE_TEXT = 'Sample subtitle text for preview';
export const PREVIEW_MIN_HEIGHT_PX = 80;
export const PREVIEW_MAX_HEIGHT_PX = 200;

export function computePreviewStyle(
  config: SubtitleAppearanceConfig,
  containerWidthPx: number,
): {
  fontSize: number;
  maxWidthPx: number;
  heightPx: number;
  placement: 'top' | 'bottom';
} {
  const maxWidthPx = percentToPixels(config.areaWidthPct, containerWidthPx);
  const heightPx = percentToPixels(config.areaHeightPct, containerWidthPx);
  return {
    fontSize: config.fontSize,
    maxWidthPx,
    heightPx,
    placement: config.placement,
  };
}

export function clampPreviewHeight(
  heightPx: number,
  minHeight: number = PREVIEW_MIN_HEIGHT_PX,
  maxHeight: number = PREVIEW_MAX_HEIGHT_PX,
): number {
  return Math.min(maxHeight, Math.max(minHeight, heightPx));
}

export function resizeHeightToPercent(
  heightPx: number,
  containerWidthPx: number,
): number {
  return pixelsToPercent(heightPx, containerWidthPx);
}

document.addEventListener('DOMContentLoaded', () => {
  const statusEl = document.getElementById('status') as HTMLSpanElement;
  const controlsEl = document.getElementById('controls') as HTMLDivElement;
  const prepareBtn = document.getElementById('prepare-btn') as HTMLButtonElement;
  const toggleBtn = document.getElementById('toggle-btn') as HTMLButtonElement;
  const targetLangSelect = document.getElementById('target-language') as HTMLSelectElement;

  const appearanceEl = document.getElementById('appearance') as HTMLDivElement;
  const fontSizeSelect = document.getElementById('font-size') as HTMLSelectElement;
  const placementSelect = document.getElementById('placement') as HTMLSelectElement;

  const previewContainer = document.getElementById('subtitle-preview-container') as HTMLDivElement;
  const previewText = document.getElementById('subtitle-preview-text') as HTMLDivElement;

  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'resize-handle';
  previewContainer.appendChild(resizeHandle);

  let isResizing = false;
  let resizeStartY = 0;
  let resizeStartHeight = 0;

  resizeHandle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    isResizing = true;
    resizeStartY = e.clientY;
    resizeStartHeight = previewContainer.offsetHeight;
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const delta = e.clientY - resizeStartY;
    const newHeight = clampPreviewHeight(resizeStartHeight + delta);
    previewContainer.style.height = `${newHeight}px`;
  });

  document.addEventListener('mouseup', () => {
    if (!isResizing) return;
    isResizing = false;
    const containerWidth = previewContainer.offsetWidth;
    if (containerWidth <= 0) return;
    const newHeightPct = resizeHeightToPercent(previewContainer.offsetHeight, containerWidth);
    loadAppearanceConfig().then((config) => {
      config.areaHeightPct = newHeightPct;
      saveAppearanceConfig(config).then((saved) => {
        renderPreview(saved);
        sendStyleUpdate(saved);
      });
    });
  });

  function renderPreview(config: SubtitleAppearanceConfig) {
    const containerWidth = previewContainer.offsetWidth;
    if (containerWidth <= 0) return;

    const style = computePreviewStyle(config, containerWidth);

    previewText.textContent = PREVIEW_SAMPLE_TEXT;
    previewText.style.fontFamily = SUBTITLE_FONT_FAMILY;
    previewText.style.lineHeight = String(SUBTITLE_LINE_HEIGHT);
    previewText.style.maxWidth = `${style.maxWidthPx}px`;

    const videoRect = { width: containerWidth, height: containerWidth * 9 / 16, x: 0, y: 0, left: 0, right: containerWidth, top: 0, bottom: containerWidth * 9 / 16, toJSON: () => ({}) } as DOMRect;
    const measureFn = createDomMeasurer();
    const fitResult = fitToArea(PREVIEW_SAMPLE_TEXT, config, videoRect, measureFn);
    previewText.style.fontSize = `${fitResult.fontSize}px`;

    if (style.placement === 'top') {
      previewText.style.top = '0';
      previewText.style.bottom = 'auto';
    } else {
      previewText.style.top = 'auto';
      previewText.style.bottom = '0';
    }

    const clampedHeight = clampPreviewHeight(style.heightPx);
    previewContainer.style.height = `${clampedHeight}px`;
    previewText.style.maxHeight = `${clampedHeight}px`;
    previewText.style.overflow = 'hidden';
  }

  // Diagnostics elements
  const diagnosticsEl = document.getElementById('diagnostics') as HTMLDivElement;
  const diagStatusEl = document.getElementById('diag-status') as HTMLSpanElement;
  const diagPercentEl = document.getElementById('diag-percent') as HTMLSpanElement;
  const progressFillEl = document.getElementById('progress-fill') as HTMLDivElement;
  const diagBatchEl = document.getElementById('diag-batch') as HTMLDivElement;
  const diagCurrentBatchEl = document.getElementById('diag-current-batch') as HTMLSpanElement;
  const diagTotalBatchesEl = document.getElementById('diag-total-batches') as HTMLSpanElement;
  const diagSegmentsEl = document.getElementById('diag-segments') as HTMLDivElement;
  const diagValidatedCountEl = document.getElementById('diag-validated-count') as HTMLSpanElement;
  const diagTotalSegmentsEl = document.getElementById('diag-total-segments') as HTMLSpanElement;
  const diagModelEl = document.getElementById('diag-model') as HTMLDivElement;
  const diagModelNameEl = document.getElementById('diag-model-name') as HTMLSpanElement;
  const diagTokensEl = document.getElementById('diag-tokens') as HTMLDivElement;
  const diagTokenUsageEl = document.getElementById('diag-token-usage') as HTMLSpanElement;
  const diagErrorEl = document.getElementById('diag-error') as HTMLDivElement;
  const retryBtn = document.getElementById('retry-btn') as HTMLButtonElement;

  // Segment preview elements
  const previewPanelEl = document.getElementById('segment-preview') as HTMLDivElement;
  const previewCountEl = document.getElementById('preview-count') as HTMLSpanElement;
  const previewToggleBtn = document.getElementById('preview-toggle') as HTMLButtonElement;
  const previewContentEl = document.getElementById('preview-content') as HTMLDivElement;
  const previewListEl = document.getElementById('preview-list') as HTMLDivElement;

  let currentVideoId: string | null = null;
  let pollInterval: ReturnType<typeof setInterval> | null = null;
  let isTranslating = false;
  let translationEnabled = false;

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs[0];
    const url = activeTab?.url || '';

    const match = url.match(/\/watch\/(\d+)/);
    if (match) {
      currentVideoId = match[1];
      statusEl.textContent = `Video: ${currentVideoId}`;
      controlsEl.classList.remove('hidden');
      appearanceEl.classList.remove('hidden');

      loadAppearanceConfig().then((config) => {
        fontSizeSelect.value = String(config.fontSize);
        placementSelect.value = config.placement;
        renderPreview(config);
      });

      // Query detection status (subtitle availability)
      queryDetectionStatus();
      // Also query current library state for diagnostics
      queryStatus();
      // Check if translation is currently enabled
      checkRenderingStatus();
    } else if (url.includes('netflix.com')) {
      statusEl.textContent = 'Navigate to a video';
      appearanceEl.classList.remove('hidden');

      loadAppearanceConfig().then((config) => {
        fontSizeSelect.value = String(config.fontSize);
        placementSelect.value = config.placement;
        renderPreview(config);
      });
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

  fontSizeSelect.addEventListener('change', async () => {
    const config = await loadAppearanceConfig();
    config.fontSize = Number(fontSizeSelect.value);
    const saved = await saveAppearanceConfig(config);
    renderPreview(saved);
    sendStyleUpdate(saved);
  });

  placementSelect.addEventListener('change', async () => {
    const config = await loadAppearanceConfig();
    config.placement = placementSelect.value as SubtitleAppearanceConfig['placement'];
    const saved = await saveAppearanceConfig(config);
    renderPreview(saved);
    sendStyleUpdate(saved);
  });

  prepareBtn.addEventListener('click', () => {
    if (!currentVideoId) {
      statusEl.textContent = 'No video detected';
      return;
    }
    startTranslation();
  });

  retryBtn.addEventListener('click', () => {
    if (!currentVideoId) return;
    startTranslation();
  });

  toggleBtn.addEventListener('click', () => {
    if (!currentVideoId) return;
    toggleTranslation(!translationEnabled);
  });

  previewToggleBtn.addEventListener('click', () => {
    const isHidden = previewContentEl.classList.contains('hidden');
    if (isHidden) {
      previewContentEl.classList.remove('hidden');
      previewToggleBtn.textContent = 'Hide Preview';
      if (currentVideoId) {
        loadAndRenderSegments(currentVideoId);
      }
    } else {
      previewContentEl.classList.add('hidden');
      previewToggleBtn.textContent = 'Show Preview';
    }
  });

  function startTranslation() {
    isTranslating = true;
    prepareBtn.disabled = true;
    prepareBtn.textContent = 'Preparing...';
    retryBtn.classList.add('hidden');
    diagErrorEl.classList.add('hidden');
    toggleBtn.classList.add('hidden');

    const targetLanguage = targetLangSelect.value;

    // Start polling immediately
    startPolling();

    chrome.runtime.sendMessage(
      {
        type: 'PREPARE_SUBTITLES',
        videoId: currentVideoId,
        targetLanguage,
      },
      (response) => {
        // Stop polling after a short delay to catch final status
        setTimeout(() => {
          stopPolling();
          isTranslating = false;
          prepareBtn.disabled = false;

          if (chrome.runtime.lastError) {
            statusEl.textContent = 'Error: ' + chrome.runtime.lastError.message;
            showError('Runtime error: ' + chrome.runtime.lastError.message);
            prepareBtn.textContent = 'Retry Translation';
            updateToggleVisibility();
            return;
          }
          if (response?.status === 'ok') {
            statusEl.textContent = 'Translation ready!';
            prepareBtn.textContent = 'Re-translate';
            diagnosticsEl.classList.add('hidden');
            updateToggleVisibility();
            // Auto-enable translation after successful preparation
            toggleTranslation(true);
          } else {
            const msg = response?.message || 'unknown error';
            statusEl.textContent = 'Failed: ' + msg;
            showError(msg);
            prepareBtn.textContent = 'Retry Translation';
            updateToggleVisibility();
          }
          // Final status query
          queryStatus();
        }, 1000);
      }
    );
  }

  let styleDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  function sendStyleUpdate(config: SubtitleAppearanceConfig) {
    if (styleDebounceTimer) clearTimeout(styleDebounceTimer);
    styleDebounceTimer = setTimeout(() => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs[0];
        if (!activeTab?.id) return;
        chrome.tabs.sendMessage(activeTab.id, {
          type: 'UPDATE_SUBTITLE_STYLE',
          config,
        }, () => {
          if (chrome.runtime.lastError) { /* ignore */ }
        });
      });
    }, 100);
  }

  function toggleTranslation(enabled: boolean) {
    translationEnabled = enabled;
    const targetLanguage = targetLangSelect.value;

    loadAppearanceConfig().then((appearanceConfig) => {
      chrome.runtime.sendMessage(
        {
          type: 'TOGGLE_TRANSLATION',
          enabled,
          videoId: currentVideoId,
          targetLanguage,
          appearanceConfig,
        },
        () => {
          if (chrome.runtime.lastError) {
            console.error('Toggle error:', chrome.runtime.lastError.message);
            return;
          }
          updateToggleButton();
        }
      );
    });
  }

  function checkRenderingStatus() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (!activeTab?.id) return;

      chrome.tabs.sendMessage(
        activeTab.id,
        { type: 'GET_RENDERING_STATUS' },
        (response) => {
          if (chrome.runtime.lastError) {
            // Content script may not be loaded yet
            return;
          }
          if (response && response.status === 'ok') {
            translationEnabled = response.enabled;
            updateToggleButton();
            updateToggleVisibility();
          }
        }
      );
    });
  }

  function updateToggleButton() {
    if (translationEnabled) {
      toggleBtn.textContent = 'Disable Translation';
      toggleBtn.classList.remove('hidden');
    } else {
      toggleBtn.textContent = 'Enable Translation';
    }
  }

  function updateToggleVisibility() {
    if (!currentVideoId) return;

    // Only show toggle if we have ready translations
    chrome.runtime.sendMessage(
      { type: 'GET_STATUS', videoId: currentVideoId },
      (response) => {
        if (chrome.runtime.lastError) return;
        if (!response || response.status === 'error') return;

        const hasReadyTranslations = response.readyCount > 0;
        if (hasReadyTranslations) {
          toggleBtn.classList.remove('hidden');
        } else {
          toggleBtn.classList.add('hidden');
          translationEnabled = false;
        }
        updateToggleButton();
      }
    );
  }

  function startPolling() {
    diagnosticsEl.classList.remove('hidden');
    stopPolling();
    queryStatus(); // Immediate first query
    pollInterval = setInterval(() => queryStatus(), 500);
  }

  function stopPolling() {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  }

  function queryDetectionStatus() {
    if (!currentVideoId) return;

    chrome.runtime.sendMessage(
      { type: 'GET_DETECTION_STATUS', videoId: currentVideoId },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error('Detection status query error:', chrome.runtime.lastError.message);
          return;
        }
        if (!response || response.status === 'error') return;
        updateDetectionStatus(response);
      }
    );
  }

  function updateDetectionStatus(data: {
    status: string;
    videoId: string;
    savedHash?: string;
    detectedHash?: string;
    sourceLanguage?: string;
  }) {
    const detectionStatus = data.status;

    if (detectionStatus === 'no-subtitle') {
      statusEl.textContent = 'No subtitle detected for this video yet.';
      prepareBtn.disabled = true;
      prepareBtn.textContent = 'Prepare Subtitles';
      prepareBtn.title = 'Wait for subtitle detection before preparing';
    } else if (detectionStatus === 'subtitle-detected') {
      statusEl.textContent = 'Subtitle detected! Click Prepare to save and translate.';
      prepareBtn.disabled = false;
      prepareBtn.textContent = 'Prepare Subtitles';
      prepareBtn.title = '';
    } else if (detectionStatus === 'already-saved') {
      if (data.savedHash === data.detectedHash) {
        statusEl.textContent = 'Same subtitle already saved. Nothing changed.';
      } else {
        statusEl.textContent = 'Subtitle already saved for this video.';
      }
      prepareBtn.disabled = false;
      prepareBtn.textContent = 'Re-translate';
      prepareBtn.title = '';
      updateToggleVisibility();
    } else if (detectionStatus === 'new-hash-detected') {
      statusEl.textContent = 'New subtitle detected! Existing translations will be marked stale.';
      prepareBtn.disabled = false;
      prepareBtn.textContent = 'Prepare Subtitles';
      prepareBtn.title = '';
    }
  }

  function queryStatus() {
    if (!currentVideoId) return;

    chrome.runtime.sendMessage(
      { type: 'GET_STATUS', videoId: currentVideoId },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error('Status query error:', chrome.runtime.lastError.message);
          return;
        }
        if (!response || response.status === 'error') return;
        updateDiagnostics(response);
      }
    );
  }

  function updateDiagnostics(data: {
    status: string;
    isRetryable: boolean;
    readyCount: number;
    progress?: {
      currentBatch: number;
      totalBatches: number;
      validatedSegmentCount: number;
      totalSegmentCount: number;
      providerModel: string;
      latestError?: string;
      completedBatches?: number;
      failedBatches?: number;
      inFlightBatches?: number[];
    };
    errorMessage?: string;
    debugInfo?: {
      model: string;
      usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
    };
    preparingSince?: number;
    partialSegments?: Array<{ id: string; startMs: number; endMs: number; translatedText: string }>;
  }) {
    const status = data.status;

    // Update button state based on current status
    if (!isTranslating) {
      if (data.isRetryable && data.readyCount === 0) {
        prepareBtn.textContent = 'Retry Translation';
      } else if (data.readyCount > 0) {
        prepareBtn.textContent = 'Re-translate';
      } else {
        prepareBtn.textContent = 'Prepare Subtitles';
      }
    }

    // Show diagnostics for active/failed translations
    if (status === 'preparing' || status === 'translation-failed') {
      diagnosticsEl.classList.remove('hidden');
    } else {
      diagnosticsEl.classList.add('hidden');
    }

    // Show preview panel whenever we have segments (partial or ready)
    const hasSegments = (data.partialSegments && data.partialSegments.length > 0) || data.readyCount > 0;
    if (hasSegments) {
      previewPanelEl.classList.remove('hidden');
      const count = data.partialSegments?.length ?? data.readyCount;
      previewCountEl.textContent = `${count} segment(s)`;
      previewToggleBtn.textContent = 'Hide Preview';
      previewContentEl.classList.remove('hidden');
      renderSegments(data.partialSegments ?? []);
    } else {
      previewPanelEl.classList.add('hidden');
    }

    // Update toggle visibility based on ready translations
    if (data.readyCount > 0 && !isTranslating) {
      toggleBtn.classList.remove('hidden');
    } else if (!isTranslating) {
      toggleBtn.classList.add('hidden');
    }

    // Status text
    if (status === 'preparing') {
      diagStatusEl.textContent = 'Translating...';
    } else if (status === 'translation-failed') {
      diagStatusEl.textContent = 'Translation failed';
    } else if (status === 'translation-ready') {
      diagStatusEl.textContent = 'Translation ready';
    } else {
      diagStatusEl.textContent = 'Waiting for subtitles...';
    }

    // Progress bar
    const progress = data.progress;
    if (progress && progress.totalBatches > 0) {
      const completedBatches = progress.completedBatches ?? progress.currentBatch;
      const percent = Math.round((completedBatches / progress.totalBatches) * 100);
      diagPercentEl.textContent = `${percent}%`;
      progressFillEl.style.width = `${percent}%`;

      diagBatchEl.classList.remove('hidden');
      diagCurrentBatchEl.textContent = String(progress.currentBatch);
      diagTotalBatchesEl.textContent = String(progress.totalBatches);

      // Show parallel progress if available
      if (progress.completedBatches !== undefined) {
        diagCurrentBatchEl.textContent = `${progress.completedBatches}/${progress.totalBatches}`;
        if (progress.failedBatches && progress.failedBatches > 0) {
          diagCurrentBatchEl.textContent += ` (${progress.failedBatches} failed)`;
        }
      }

      diagSegmentsEl.classList.remove('hidden');
      diagValidatedCountEl.textContent = String(progress.validatedSegmentCount);
      diagTotalSegmentsEl.textContent = String(progress.totalSegmentCount);

      diagModelEl.classList.remove('hidden');
      diagModelNameEl.textContent = progress.providerModel || data.debugInfo?.model || '-';
    } else {
      diagPercentEl.textContent = '0%';
      progressFillEl.style.width = '0%';
      diagBatchEl.classList.add('hidden');
      diagSegmentsEl.classList.add('hidden');
      diagModelEl.classList.add('hidden');
    }

    // Token usage
    if (data.debugInfo?.usage) {
      diagTokensEl.classList.remove('hidden');
      const u = data.debugInfo.usage;
      diagTokenUsageEl.textContent = `${u.promptTokens ?? '?'} prompt / ${u.completionTokens ?? '?'} completion`;
    } else {
      diagTokensEl.classList.add('hidden');
    }

    // Error display
    const errorMsg = data.errorMessage || progress?.latestError;
    if (errorMsg) {
      showError(errorMsg);
      retryBtn.classList.remove('hidden');
    } else if (status !== 'translation-failed') {
      diagErrorEl.classList.add('hidden');
      retryBtn.classList.add('hidden');
    }
  }

  function showError(message: string) {
    diagErrorEl.textContent = message;
    diagErrorEl.classList.remove('hidden');
  }

  function renderSegments(
    segments: Array<{ id: string; startMs: number; endMs: number; translatedText: string }>
  ) {
    if (segments.length === 0) {
      previewListEl.innerHTML = '<div class="preview-item">No segments yet</div>';
      return;
    }

    previewListEl.innerHTML = segments
      .map((s) => {
        const time = formatTime(s.startMs) + ' → ' + formatTime(s.endMs);
        return `
          <div class="preview-item">
            <div class="preview-time">${time}</div>
            <div class="preview-translated">${escapeHtml(s.translatedText)}</div>
          </div>
        `;
      })
      .join('');
  }

  function loadAndRenderSegments(videoId: string) {
    const targetLanguage = targetLangSelect.value;

    chrome.runtime.sendMessage(
      { type: 'GET_SEGMENTS', videoId, targetLanguage },
      (response) => {
        if (chrome.runtime.lastError) {
          previewListEl.innerHTML = `<div class="preview-item">Error loading segments: ${chrome.runtime.lastError.message}</div>`;
          return;
        }
        if (!response || response.status === 'error') {
          previewListEl.innerHTML = `<div class="preview-item">Failed to load segments</div>`;
          return;
        }

        const segments = response.segments as Array<{
          id: string;
          startMs: number;
          endMs: number;
          sourceText: string;
          translatedText: string;
        }>;

        previewCountEl.textContent = `${response.count} segments`;

        if (segments.length === 0) {
          previewListEl.innerHTML = '<div class="preview-item">No translated segments found</div>';
          return;
        }

        previewListEl.innerHTML = segments
          .map((s) => {
            const time = formatTime(s.startMs) + ' → ' + formatTime(s.endMs);
            return `
              <div class="preview-item">
                <div class="preview-time">${time}</div>
                ${s.sourceText ? `<div class="preview-source">${escapeHtml(s.sourceText)}</div>` : ''}
                <div class="preview-translated">${escapeHtml(s.translatedText)}</div>
              </div>
            `;
          })
          .join('');
      }
    );
  }

  function formatTime(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const millis = Math.floor((ms % 1000) / 10);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${millis.toString().padStart(2, '0')}`;
  }

  function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Library link
  const libraryLink = document.getElementById('library-link') as HTMLAnchorElement;
  libraryLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: chrome.runtime.getURL('library.html') });
  });
});
