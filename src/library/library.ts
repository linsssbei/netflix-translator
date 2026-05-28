import {
  listAllEntries,
  loadEntryDetails,
  removeEntry,
  removeEntriesForVideo,
  computeQualityDiagnostics,
} from '../shared/library-management';
import type { SubtitleLibraryEntry, QualityDiagnostics, TranslationContextProfile, AutoFillResult } from '../shared/types';
import { loadContextProfile, saveContextProfile, createEmptyProfile } from '../shared/context-profile';
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

export function mergeAutoFillResultIntoProfile(
  profile: TranslationContextProfile,
  result: AutoFillResult,
  currentValues?: Pick<TranslationContextProfile, 'tone' | 'backgroundNotes' | 'characterNames' | 'glossary'>
): TranslationContextProfile {
  const merged: TranslationContextProfile = {
    ...profile,
    tone: currentValues?.tone ?? profile.tone,
    backgroundNotes: currentValues?.backgroundNotes ?? profile.backgroundNotes,
    characterNames: currentValues?.characterNames ?? profile.characterNames,
    glossary: currentValues?.glossary ?? profile.glossary,
  };

  if (!merged.tone) merged.tone = result.tone;
  if (!merged.backgroundNotes) merged.backgroundNotes = result.backgroundNotes;
  if (merged.characterNames.length === 0) merged.characterNames = result.characterNames;
  if (merged.glossary.length === 0) merged.glossary = result.glossary;

  merged.sourceURLs = result.sourceURLs;
  merged.autoFilled = true;

  return merged;
}

class LibraryManager {
  private entries: SubtitleLibraryEntry[] = [];
  private filteredEntries: SubtitleLibraryEntry[] = [];
  private currentEntry: SubtitleLibraryEntry | null = null;
  private currentProfile: TranslationContextProfile | null = null;
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
    if (this.currentEntry) {
      const refreshed = this.entries.find((entry) => entry.key === this.currentEntry?.key);
      if (refreshed) {
        this.currentEntry = refreshed;
      }
    }
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
    const title = entry.videoTitle || `Netflix Video ${entry.videoId}`;
    const langName = LANGUAGE_NAMES[entry.targetLanguage] || entry.targetLanguage;
    const diagnostics = computeQualityDiagnostics(entry);

    return `
      <div class="entry-card">
        <div class="entry-header">
          <div>
            <div class="entry-title">${this.escapeHtml(title)}</div>
            <div class="entry-video-id">${entry.videoTitle ? `Video ID: ${entry.videoId}` : 'Title not detected yet'}</div>
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

      const freshEntry = details.entry;
      this.currentEntry = freshEntry;
      const diagnostics = computeQualityDiagnostics(freshEntry);
      const title = freshEntry.videoTitle || `Netflix Video ${freshEntry.videoId}`;
      const langName = LANGUAGE_NAMES[freshEntry.targetLanguage] || freshEntry.targetLanguage;

      const eligibility = checkExportEligibility(freshEntry);
      const isExportable = eligibility.eligible;

      content.innerHTML = `
        <div class="detail-header">
          <h2>${this.escapeHtml(title)}</h2>
          <div class="meta">
            <span>Video ID: ${freshEntry.videoId}</span> |
            <span>${freshEntry.sourceLanguage} → ${langName}</span> |
            <span class="status-badge ${getStatusClass(freshEntry.status)}">${freshEntry.status}</span> |
            <span>Source Hash: ${freshEntry.sourceSubtitleHash}</span> |
            <span>Captured: ${formatDate(freshEntry.subtitleResource?.discoveredAt || freshEntry.updatedAt)}</span>
          </div>
        </div>

        ${this.renderExportSection(freshEntry, isExportable)}
        ${this.renderProfileSection(freshEntry)}
        ${this.renderDiagnostics(diagnostics, freshEntry)}
        ${freshEntry.status !== 'translation-ready' && freshEntry.errorMessage ? this.renderError(freshEntry) : ''}
        ${this.renderSegments(details.sourceSegments, details.translatedSegments)}

        <div class="delete-section">
          <button class="btn-danger" id="deleteSingle">Delete This Entry</button>
          <button class="btn-secondary" id="deleteAll" style="margin-left: 12px;">Delete All for This Video</button>
        </div>
      `;

      // Add export handlers
      this.attachExportHandlers(freshEntry);

      // Add delete handlers
      document.getElementById('deleteSingle')?.addEventListener('click', () => {
        this.showDeleteModal(freshEntry);
      });

      document.getElementById('deleteAll')?.addEventListener('click', async () => {
        if (confirm(`Delete all entries for video ${freshEntry.videoId}?`)) {
          await this.deleteAllForVideo(freshEntry.videoId);
        }
      });

      // Attach per-segment action handlers
      this.attachSegmentHandlers(freshEntry);

      // Load and render context profile
      this.loadAndRenderProfile(freshEntry);
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
            (Batch ${entry.translationProgress.completedBatches ?? entry.translationProgress.currentBatch}/${entry.translationProgress.totalBatches}${entry.translationProgress.failedBatches ? `, ${entry.translationProgress.failedBatches} failed` : ''})
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

  private async loadAndRenderProfile(entry: SubtitleLibraryEntry) {
    const profile = await loadContextProfile(
      entry.videoId,
      entry.sourceLanguage,
      entry.targetLanguage,
      entry.sourceSubtitleHash
    );
    this.renderProfileFields(profile);
    this.attachProfileHandlers(entry, profile);
  }

  private renderProfileSection(_entry: SubtitleLibraryEntry): string {
    return `
      <div class="profile-section">
        <h3>Translation Context Profile</h3>
        <p class="profile-hint">Edit context to improve translation consistency. Profiles are included in every batch prompt.</p>
        <div class="profile-controls">
          <button class="btn-secondary" id="autofill-profile">Auto-fill from Online Sources</button>
          <span id="autofill-status" class="autofill-status"></span>
        </div>
        <div class="profile-fields">
          <div class="profile-field">
            <label for="profile-tone">Tone Instructions</label>
            <textarea id="profile-tone" rows="2" placeholder="e.g., Keep the tone casual and humorous"></textarea>
          </div>
          <div class="profile-field">
            <label for="profile-notes">Background Notes</label>
            <textarea id="profile-notes" rows="3" placeholder="e.g., A sci-fi series about time travel"></textarea>
          </div>
          <div class="profile-field">
            <label for="profile-names">Character Names (one per line: Original → Translation)</label>
            <textarea id="profile-names" rows="3" placeholder="e.g.,主人公 → Hero"></textarea>
          </div>
          <div class="profile-field">
            <label for="profile-glossary">Glossary (one per line: Term → Translation)</label>
            <textarea id="profile-glossary" rows="3" placeholder="e.g.,魔法 → Magic"></textarea>
          </div>
          <button class="btn-primary" id="save-profile">Save Profile</button>
          <span id="profile-save-status" class="profile-status"></span>
        </div>
      </div>
    `;
  }

  private renderProfileFields(profile: TranslationContextProfile | null) {
    const toneEl = document.getElementById('profile-tone') as HTMLTextAreaElement;
    const notesEl = document.getElementById('profile-notes') as HTMLTextAreaElement;
    const namesEl = document.getElementById('profile-names') as HTMLTextAreaElement;
    const glossaryEl = document.getElementById('profile-glossary') as HTMLTextAreaElement;
    if (!toneEl || !notesEl || !namesEl || !glossaryEl) return;

    if (profile) {
      toneEl.value = profile.tone;
      notesEl.value = profile.backgroundNotes;
      namesEl.value = profile.characterNames
        .map((n) => `${n.original} → ${n.translation}`)
        .join('\n');
      glossaryEl.value = profile.glossary
        .map((g) => `${g.term} → ${g.translation}`)
        .join('\n');
    } else {
      toneEl.value = '';
      notesEl.value = '';
      namesEl.value = '';
      glossaryEl.value = '';
    }
  }

  private attachProfileHandlers(entry: SubtitleLibraryEntry, profile: TranslationContextProfile | null) {
    this.currentProfile = profile || createEmptyProfile(
      entry.videoId,
      entry.sourceLanguage,
      entry.targetLanguage,
      entry.sourceSubtitleHash
    );
    this.renderProfileFields(profile);

    const saveBtn = document.getElementById('save-profile');
    saveBtn?.addEventListener('click', async () => {
      await this.saveCurrentProfile(entry);
    });

    const autofillBtn = document.getElementById('autofill-profile');
    autofillBtn?.addEventListener('click', async () => {
      await this.autoFillProfile(entry);
    });
  }

  private async saveCurrentProfile(_entry: SubtitleLibraryEntry) {
    const profile = this.currentProfile;
    if (!profile) return;

    profile.tone = (document.getElementById('profile-tone') as HTMLTextAreaElement)?.value || '';
    profile.backgroundNotes = (document.getElementById('profile-notes') as HTMLTextAreaElement)?.value || '';
    profile.characterNames = this.parseNameEntries(
      (document.getElementById('profile-names') as HTMLTextAreaElement)?.value || ''
    );
    profile.glossary = this.parseGlossaryEntries(
      (document.getElementById('profile-glossary') as HTMLTextAreaElement)?.value || ''
    );

    await saveContextProfile(profile);

    const statusEl = document.getElementById('profile-save-status');
    if (statusEl) {
      statusEl.textContent = 'Profile saved!';
      setTimeout(() => { statusEl.textContent = ''; }, 3000);
    }
  }

  private async autoFillProfile(entry: SubtitleLibraryEntry) {
    const statusEl = document.getElementById('autofill-status');
    if (statusEl) statusEl.textContent = 'Looking up context...';

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'AUTOFILL_CONTEXT_PROFILE',
        videoId: entry.videoId,
        videoTitle: entry.videoTitle,
        sourceLanguage: entry.sourceLanguage,
        targetLanguage: entry.targetLanguage,
        sourceSubtitleHash: entry.sourceSubtitleHash,
      });

      const result: AutoFillResult | null = response?.result;

      if (result) {
        const profile = this.currentProfile;
        if (!profile) return;

        const mergedProfile = mergeAutoFillResultIntoProfile(profile, result, {
          tone: (document.getElementById('profile-tone') as HTMLTextAreaElement)?.value || '',
          backgroundNotes: (document.getElementById('profile-notes') as HTMLTextAreaElement)?.value || '',
          characterNames: this.parseNameEntries(
            (document.getElementById('profile-names') as HTMLTextAreaElement)?.value || ''
          ),
          glossary: this.parseGlossaryEntries(
            (document.getElementById('profile-glossary') as HTMLTextAreaElement)?.value || ''
          ),
        });
        this.currentProfile = mergedProfile;

        await saveContextProfile(mergedProfile);
        this.renderProfileFields(mergedProfile);

        if (statusEl) statusEl.textContent = 'Auto-fill applied!';
        setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 3000);
      } else {
        if (statusEl) statusEl.textContent = response?.error || 'Auto-fill failed.';
      }
    } catch (err) {
      if (statusEl) statusEl.textContent = 'Auto-fill error.';
      console.error('Auto-fill error:', err);
    }
  }

  private parseNameEntries(text: string): Array<{ original: string; translation: string }> {
    return text.split('\n')
      .map((line) => line.trim())
      .filter((line) => line)
      .map((line) => {
        const parts = line.split('→').map((s) => s.trim());
        if (parts.length === 2 && parts[0] && parts[1]) {
          return { original: parts[0], translation: parts[1] };
        }
        return null;
      })
      .filter((entry): entry is { original: string; translation: string } => entry !== null);
  }

  private parseGlossaryEntries(text: string): Array<{ term: string; translation: string }> {
    return text.split('\n')
      .map((line) => line.trim())
      .filter((line) => line)
      .map((line) => {
        const parts = line.split('→').map((s) => s.trim());
        if (parts.length === 2 && parts[0] && parts[1]) {
          return { term: parts[0], translation: parts[1] };
        }
        return null;
      })
      .filter((entry): entry is { term: string; translation: string } => entry !== null);
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  new LibraryManager();
});
