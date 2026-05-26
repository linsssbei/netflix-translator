import {
  listAllEntries,
  loadEntryDetails,
  removeEntry,
  removeEntriesForVideo,
  computeQualityDiagnostics,
} from '../shared/library-management';
import type { SubtitleLibraryEntry, QualityDiagnostics } from '../shared/types';
import { generateExport, checkExportEligibility } from '../shared/export-utils';
import type { ExportFormat } from '../shared/export-types';

const LANGUAGE_NAMES: Record<string, string> = {
  'zh-CN': 'Chinese (Simplified)',
  'zh-TW': 'Chinese (Traditional)',
  ja: 'Japanese',
  ko: 'Korean',
  fr: 'French',
  de: 'German',
  es: 'Spanish',
  pt: 'Portuguese',
  it: 'Italian',
  ru: 'Russian',
  ar: 'Arabic',
  th: 'Thai',
  vi: 'Vietnamese',
  en: 'English',
};

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const millis = ms % 1000;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

function getStatusClass(status: string): string {
  return `status-${status}`;
}

class LibraryManager {
  private entries: SubtitleLibraryEntry[] = [];
  private filteredEntries: SubtitleLibraryEntry[] = [];
  private currentEntry: SubtitleLibraryEntry | null = null;
  private deleteTarget: SubtitleLibraryEntry | null = null;

  constructor() {
    this.init();
  }

  private async init() {
    await this.loadEntries();
    this.setupFilters();
    this.setupBackButton();
    this.setupDeleteModal();
    this.startRefreshPolling();
    this.render();
  }

  private startRefreshPolling() {
    setInterval(async () => {
      await this.loadEntries();
      if (this.currentEntry) {
        this.renderDetail();
      } else {
        this.render();
      }
    }, 2000);
  }

  private async loadEntries() {
    this.entries = await listAllEntries();
    this.applyFilters();
  }

  private applyFilters() {
    const statusFilter = (document.getElementById('statusFilter') as HTMLSelectElement).value;
    const languageFilter = (document.getElementById('languageFilter') as HTMLSelectElement).value;
    const searchQuery = (document.getElementById('searchInput') as HTMLInputElement).value.toLowerCase();

    this.filteredEntries = this.entries.filter((entry) => {
      if (statusFilter && entry.status !== statusFilter) return false;
      if (languageFilter && entry.targetLanguage !== languageFilter) return false;
      if (searchQuery) {
        const titleMatch = entry.videoTitle?.toLowerCase().includes(searchQuery);
        const idMatch = entry.videoId.toLowerCase().includes(searchQuery);
        if (!titleMatch && !idMatch) return false;
      }
      return true;
    });

    this.updateLanguageFilter();
  }

  private updateLanguageFilter() {
    const select = document.getElementById('languageFilter') as HTMLSelectElement;
    const languages = new Set(this.entries.map((e) => e.targetLanguage));
    const currentValue = select.value;

    select.innerHTML = '<option value="">All Languages</option>';
    for (const lang of Array.from(languages).sort()) {
      const option = document.createElement('option');
      option.value = lang;
      option.textContent = LANGUAGE_NAMES[lang] || lang;
      select.appendChild(option);
    }
    select.value = currentValue;
  }

  private setupFilters() {
    document.getElementById('statusFilter')!.addEventListener('change', () => {
      this.applyFilters();
      this.render();
    });

    document.getElementById('languageFilter')!.addEventListener('change', () => {
      this.applyFilters();
      this.render();
    });

    document.getElementById('searchInput')!.addEventListener('input', () => {
      this.applyFilters();
      this.render();
    });
  }

  private setupBackButton() {
    document.getElementById('backButton')!.addEventListener('click', () => {
      this.currentEntry = null;
      this.render();
    });
  }

  private setupDeleteModal() {
    document.getElementById('confirmDelete')!.addEventListener('click', async () => {
      if (this.deleteTarget) {
        await this.deleteEntry(this.deleteTarget);
        this.deleteTarget = null;
        this.hideDeleteModal();
      }
    });

    document.getElementById('cancelDelete')!.addEventListener('click', () => {
      this.deleteTarget = null;
      this.hideDeleteModal();
    });
  }

  private showDeleteModal(entry: SubtitleLibraryEntry) {
    this.deleteTarget = entry;
    document.getElementById('deleteModal')!.classList.remove('hidden');
  }

  private hideDeleteModal() {
    document.getElementById('deleteModal')!.classList.add('hidden');
  }

  private async deleteEntry(entry: SubtitleLibraryEntry) {
    await removeEntry(
      entry.videoId,
      entry.sourceLanguage,
      entry.targetLanguage,
      entry.sourceSubtitleHash
    );
    await this.loadEntries();
    this.currentEntry = null;
    this.render();
  }

  private async deleteAllForVideo(videoId: string) {
    await removeEntriesForVideo(videoId);
    await this.loadEntries();
    this.currentEntry = null;
    this.render();
  }

  private render() {
    const entryList = document.getElementById('entryList')!;
    const detailView = document.getElementById('detailView')!;
    const emptyState = document.getElementById('emptyState')!;

    if (this.currentEntry) {
      entryList.classList.add('hidden');
      emptyState.classList.add('hidden');
      detailView.classList.remove('hidden');
      this.renderDetail();
      return;
    }

    detailView.classList.add('hidden');

    if (this.filteredEntries.length === 0) {
      entryList.classList.add('hidden');
      entryList.innerHTML = '';
      emptyState.classList.remove('hidden');
      return;
    }

    emptyState.classList.add('hidden');
    entryList.classList.remove('hidden');
    entryList.innerHTML = this.filteredEntries.map((entry) => this.renderEntryCard(entry)).join('');

    // Add click handlers
    entryList.querySelectorAll('.entry-card').forEach((card, index) => {
      card.addEventListener('click', () => {
        this.currentEntry = this.filteredEntries[index];
        this.render();
      });
    });
  }

  private renderEntryCard(entry: SubtitleLibraryEntry): string {
    const title = entry.videoTitle || `Video ${entry.videoId}`;
    const langName = LANGUAGE_NAMES[entry.targetLanguage] || entry.targetLanguage;
    const diagnostics = computeQualityDiagnostics(entry);

    return `
      <div class="entry-card">
        <div class="entry-header">
          <div>
            <div class="entry-title">${this.escapeHtml(title)}</div>
            <div class="entry-video-id">${entry.videoId}</div>
          </div>
          <span class="status-badge ${getStatusClass(entry.status)}">${entry.status}</span>
        </div>
        <div class="entry-meta">
          <span>${entry.sourceLanguage} → ${langName}</span>
          <span>Hash: ${entry.sourceSubtitleHash?.substring(0, 8)}...</span>
          <span>Captured: ${formatDate(entry.subtitleResource?.discoveredAt || entry.updatedAt)}</span>
          <span>${diagnostics.sourceSegmentCount} src / ${diagnostics.translatedSegmentCount} trns</span>
        </div>
      </div>
    `;
  }

  private renderDetail() {
    if (!this.currentEntry) return;

    const entry = this.currentEntry;
    const content = document.getElementById('detailContent')!;

    loadEntryDetails(
      entry.videoId,
      entry.sourceLanguage,
      entry.targetLanguage,
      entry.sourceSubtitleHash
    ).then((details) => {
      if (!details) {
        content.innerHTML = '<p>Entry not found.</p>';
        return;
      }

      const diagnostics = computeQualityDiagnostics(entry);
      const title = entry.videoTitle || `Video ${entry.videoId}`;
      const langName = LANGUAGE_NAMES[entry.targetLanguage] || entry.targetLanguage;

      const eligibility = checkExportEligibility(entry);
      const isExportable = eligibility.eligible;

      content.innerHTML = `
        <div class="detail-header">
          <h2>${this.escapeHtml(title)}</h2>
          <div class="meta">
            <span>Video ID: ${entry.videoId}</span> |
            <span>${entry.sourceLanguage} → ${langName}</span> |
            <span class="status-badge ${getStatusClass(entry.status)}">${entry.status}</span> |
            <span>Source Hash: ${entry.sourceSubtitleHash}</span> |
            <span>Captured: ${formatDate(entry.subtitleResource?.discoveredAt || entry.updatedAt)}</span>
          </div>
        </div>

        ${this.renderExportSection(entry, isExportable)}
        ${this.renderDiagnostics(diagnostics, entry)}
        ${entry.errorMessage ? this.renderError(entry) : ''}
        ${this.renderSegments(details.sourceSegments, details.translatedSegments)}

        <div class="delete-section">
          <button class="btn-danger" id="deleteSingle">Delete This Entry</button>
          <button class="btn-secondary" id="deleteAll" style="margin-left: 12px;">Delete All for This Video</button>
        </div>
      `;

      // Add export handlers
      this.attachExportHandlers(entry);

      // Add delete handlers
      document.getElementById('deleteSingle')?.addEventListener('click', () => {
        this.showDeleteModal(entry);
      });

      document.getElementById('deleteAll')?.addEventListener('click', async () => {
        if (confirm(`Delete all entries for video ${entry.videoId}?`)) {
          await this.deleteAllForVideo(entry.videoId);
        }
      });

      // Attach per-segment action handlers
      this.attachSegmentHandlers(entry);
    });
  }

  private renderExportSection(_entry: SubtitleLibraryEntry, isExportable: boolean): string {
    if (!isExportable) {
      return `
        <div class="export-section disabled">
          <h3>Export</h3>
          <p class="export-hint">Export is only available for translation-ready entries with valid translated segments.</p>
        </div>
      `;
    }

    return `
      <div class="export-section">
        <h3>Export</h3>
        <div class="export-actions">
          <button class="btn-export" data-export-format="srt">Export as SRT</button>
          <button class="btn-export" data-export-format="webvtt">Export as WebVTT</button>
          <button class="btn-export" data-export-format="json-bundle">Export as JSON Bundle</button>
        </div>
      </div>
    `;
  }

  private attachExportHandlers(entry: SubtitleLibraryEntry) {
    const buttons = document.querySelectorAll('.export-actions button[data-export-format]');
    buttons.forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const target = e.currentTarget as HTMLButtonElement;
        const format = target.getAttribute('data-export-format') as ExportFormat;
        if (!format) return;
        await this.handleExport(entry, format);
      });
    });
  }

  private async handleExport(entry: SubtitleLibraryEntry, format: ExportFormat) {
    try {
      const result = generateExport(entry, format);
      await this.downloadFile(result.filename, result.mimeType, result.content);
    } catch (err) {
      console.error('Export failed:', err);
      const message = err instanceof Error ? err.message : 'Unknown export error';
      alert(`Export failed: ${message}`);
    }
  }

  private async downloadFile(filename: string, mimeType: string, content: string) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Clean up after a short delay to allow download to start
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  private renderDiagnostics(diagnostics: QualityDiagnostics, _entry: SubtitleLibraryEntry): string {
    return `
      <div class="diagnostics">
        <div class="diagnostic-card">
          <div class="label">Source Segments</div>
          <div class="value">${diagnostics.sourceSegmentCount}</div>
        </div>
        <div class="diagnostic-card">
          <div class="label">Translated Segments</div>
          <div class="value">${diagnostics.translatedSegmentCount}</div>
        </div>
        <div class="diagnostic-card">
          <div class="label">Missing</div>
          <div class="value">${diagnostics.missingSegmentCount}</div>
        </div>
        <div class="diagnostic-card">
          <div class="label">Empty Translations</div>
          <div class="value">${diagnostics.emptyTranslationCount}</div>
        </div>
        <div class="diagnostic-card">
          <div class="label">Stale</div>
          <div class="value">${diagnostics.isStale ? 'Yes' : 'No'}</div>
        </div>
        <div class="diagnostic-card">
          <div class="label">Provider</div>
          <div class="value">${diagnostics.provider || '-'}</div>
        </div>
        <div class="diagnostic-card">
          <div class="label">Model</div>
          <div class="value">${diagnostics.providerModel || '-'}</div>
        </div>
        <div class="diagnostic-card">
          <div class="label">Prepared</div>
          <div class="value">${diagnostics.preparedAt ? formatDate(diagnostics.preparedAt) : '-'}</div>
        </div>
      </div>
    `;
  }

  private renderError(entry: SubtitleLibraryEntry): string {
    return `
      <div class="error-section">
        <h3>Error</h3>
        <pre>${this.escapeHtml(entry.errorMessage || 'Unknown error')}</pre>
        ${entry.translationProgress ? `
          <div style="margin-top: 8px; font-size: 12px;">
            Progress: ${entry.translationProgress.validatedSegmentCount}/${entry.translationProgress.totalSegmentCount} segments
            (Batch ${entry.translationProgress.currentBatch}/${entry.translationProgress.totalBatches})
          </div>
        ` : ''}
      </div>
    `;
  }

  private renderSegments(
    sourceSegments: Array<{ id: string; startMs: number; endMs: number; sourceText: string }>,
    translatedSegments: Array<{ id: string; startMs: number; endMs: number; translatedText: string }>
  ): string {
    if (sourceSegments.length === 0) {
      return '<p>No source segments available.</p>';
    }

    const translatedMap = new Map(translatedSegments.map((s) => [s.id, s]));

    const rows = sourceSegments.map((source) => {
      const translated = translatedMap.get(source.id);
      const hasTranslation = translated && translated.translatedText;
      return `
        <tr data-segment-id="${source.id}">
          <td><span class="segment-id">${source.id}</span></td>
          <td><span class="timestamp">${formatTimestamp(source.startMs)}</span></td>
          <td><span class="timestamp">${formatTimestamp(source.endMs)}</span></td>
          <td><span class="source-text">${this.escapeHtml(source.sourceText)}</span></td>
          <td><span class="translated-text">${hasTranslation ? this.escapeHtml(translated.translatedText) : '-'}</span></td>
          <td class="actions">
            ${hasTranslation ? `<button class="btn-small btn-delete" data-action="delete" data-segment-id="${source.id}">Delete</button>` : ''}
            <button class="btn-small btn-retranslate" data-action="retranslate" data-segment-id="${source.id}">Re-translate</button>
          </td>
        </tr>
      `;
    }).join('');

    return `
      <table class="segment-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Start</th>
            <th>End</th>
            <th>Source</th>
            <th>Translated</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  private attachSegmentHandlers(entry: SubtitleLibraryEntry) {
    const table = document.querySelector('.segment-table');
    if (!table) return;

    table.addEventListener('click', async (e) => {
      const target = e.target as HTMLElement;
      if (!target.matches('button[data-action]')) return;

      const segmentId = target.getAttribute('data-segment-id')!;
      const action = target.getAttribute('data-action')!;

      if (action === 'delete') {
        if (!confirm(`Delete translation for segment ${segmentId}?`)) return;
        await this.deleteSegmentTranslation(entry, segmentId);
      } else if (action === 'retranslate') {
        if (!confirm(`Re-translate segment ${segmentId}?`)) return;
        await this.retranslateSegment(entry, segmentId);
      }
    });
  }

  private async deleteSegmentTranslation(entry: SubtitleLibraryEntry, segmentId: string) {
    try {
      await chrome.runtime.sendMessage({
        type: 'DELETE_SEGMENT',
        videoId: entry.videoId,
        sourceLanguage: entry.sourceLanguage,
        targetLanguage: entry.targetLanguage,
        sourceSubtitleHash: entry.sourceSubtitleHash,
        segmentId,
      });
      // Refresh will pick up the change via polling
    } catch (err) {
      console.error('Failed to delete segment translation:', err);
      alert('Failed to delete translation');
    }
  }

  private async retranslateSegment(entry: SubtitleLibraryEntry, segmentId: string) {
    try {
      await chrome.runtime.sendMessage({
        type: 'RETRANSLATE_SEGMENT',
        videoId: entry.videoId,
        sourceLanguage: entry.sourceLanguage,
        targetLanguage: entry.targetLanguage,
        sourceSubtitleHash: entry.sourceSubtitleHash,
        segmentId,
      });
      // Status will change to preparing; polling will show progress
    } catch (err) {
      console.error('Failed to retranslate segment:', err);
      alert('Failed to start re-translation');
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  new LibraryManager();
});
