/**
 * Live Netflix smoke tests - MANUAL VALIDATION ONLY
 *
 * These tests are skipped in CI. They are for manual verification
 * that Netflix-specific selectors (used in CSS injection for subtitle hiding)
 * still exist on the live Netflix player UI.
 *
 * Run manually: npx vitest run --testNamePattern="Live Netflix"
 *
 * Prerequisites:
 * - Must be logged into Netflix in a Chrome browser with the extension loaded
 * - Must be on a watch page (/watch/XXXXX)
 */
import { describe, it, expect } from 'vitest';

describe.skip('Live Netflix smoke tests (manual only, not CI)', () => {
  it('Netflix subtitle selectors .player-timedtext still exist on live page', () => {
    // This test cannot run in CI. It requires a live Netflix page.
    // Purpose: Verify that the CSS injection selectors in SubtitleRenderer
    // (.player-timedtext, .player-timedtext-container, [data-uia="player-timedtext"])
    // still match real Netflix DOM elements.
    //
    // If this test fails (selectors not found), update the CSS in
    // SubtitleRenderer.NATIVE_SUBTITLE_CSS to match Netflix's current DOM.
    expect(true).toBe(true);
  });

  it('Overlay renders correctly on live Netflix player', () => {
    // Verify that the extension-owned overlay (nt-subtitle-overlay)
    // attaches to document.body with position:fixed and renders subtitles
    // at the correct position relative to the <video> element.
    //
    // Manual steps:
    // 1. Open a Netflix video
    // 2. Enable translated subtitles in the extension popup
    // 3. Verify the overlay appears at the bottom of the video
    // 4. Verify the native subtitles are hidden
    // 5. Try fullscreen mode and verify overlay remains visible
    expect(true).toBe(true);
  });

  it('Network metadata intercept provides video title without DOM scraping', () => {
    // Verify that nt-video-metadata events provide high-confidence metadata
    // without relying on Netflix DOM selectors.
    //
    // Manual steps:
    // 1. Open a Netflix video
    // 2. Check the debug overlay for metadata source
    // 3. Verify source is 'metadata-response' (network) not 'dom-title-selector'
    expect(true).toBe(true);
  });
});