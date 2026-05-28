## 0. Shared Message Types

- [ ] 0.1 Add `SubtitleAppearanceConfig` to `ExtensionMessage` as a new message type (`UPDATE_SUBTITLE_STYLE`) carrying the full appearance config
- [ ] 0.2 Add `appearanceConfig` as an optional field on the existing `TOGGLE_TRANSLATION` message payload so enablement includes initial style
- [ ] 0.3 Add unit tests confirming the new message types serialize and deserialize correctly

## 1. Shared Appearance Model

- [ ] 1.1 Add shared `SubtitleAppearanceConfig` types with defaults, supported bounds, placement values, and fit behavior constants. Area dimensions (width, height, offsets) MUST be stored as percentages of video rect.
- [ ] 1.2 Add validation/normalization helpers that clamp invalid stored appearance values to safe defaults. Normalization MUST occur at the storage/popup layer before settings are sent to the content script, so the renderer always receives a valid complete config.
- [ ] 1.3 Add storage helpers to load and save the global subtitle appearance configuration from `chrome.storage.local` using a dedicated prefix (follow the `subtitle-library.ts` key prefix pattern).
- [ ] 1.4 Add unit tests for defaults, persisted settings, invalid stored values, and bounds clamping

## 2. Popup Appearance Controls

- [ ] 2.1 Add a compact subtitle appearance section to the popup controls area
- [ ] 2.2 Add a font-size control that updates pending settings and persists valid values
- [ ] 2.3 Add a placement control for bottom and top subtitle placement
- [ ] 2.4 Add popup state wiring so controls load saved settings when the popup opens
- [ ] 2.5 Add popup tests for loading, changing, saving, and reloading appearance settings

## 3. Popup Preview And Resizable Area

- [ ] 3.1 Add a popup preview area with representative sample subtitle text
- [ ] 3.2 Render the preview using the same normalized appearance config used by live subtitles
- [ ] 3.3 Add mouse resize behavior for the subtitle preview area with min/max bounds. Use a custom drag-handle implementation (`mousedown`/`mousemove`/`mouseup`) within the popup preview — no external resize library. The preview area dimensions are stored as percentages so they scale to both the popup preview and the live video overlay.
- [ ] 3.4 Persist resized subtitle area dimensions after user adjustment (as percentages)
- [ ] 3.5 Add tests for preview rendering, immediate updates, resize clamping, and persistence

## 4. Fit-To-Area Rendering

> **Spike note:** Before implementing, validate the DOM measurement approach by creating a test that measures text in both a popup-style DOM context and a content-script-style DOM context. Confirm that `white-space: pre-wrap`, `word-break: break-word`, and `line-height` produce consistent wrapping results across both contexts with the same font settings. If canvas `measureText` proves necessary for performance, evaluate whether single-line width measurement with CSS wrapping is sufficient as a hybrid approach.

- [ ] 4.1 Extract shared style calculation helpers for preferred font size, placement, area dimensions (percentage-to-pixel conversion), wrapping, and fit constraints
- [ ] 4.2 Implement bounded font-size reduction using a hidden DOM measurement element (`<span>` styled to match overlay font settings). Reduce font size iteratively from preferred to minimum until text fits the configured area width and height.
- [ ] 4.3 Ensure long text, line breaks, and unbroken words do not expand outside the configured area (use `word-break: break-word` and `overflow: hidden` as final safeguard)
- [ ] 4.4 Add unit tests for text fitting at preferred size, reduced size, minimum size, and overflow prevention

## 5. Live Renderer Integration

- [ ] 5.1 Extend `SubtitleRenderer` to accept an optional `appearanceConfig` parameter on `enable()` and add an `updateStyle(config)` method for live style changes without segment reload
- [ ] 5.2 Apply font size, placement (top/bottom), area sizing (percentage-to-pixel from `video.getBoundingClientRect()`), and fit behavior to the live overlay without losing current segments
- [ ] 5.3 Keep renderer cleanup deterministic when style updates happen during playback, fullscreen, or video navigation
- [ ] 5.4 Add renderer tests for font size, top/bottom placement, area sizing, active style updates, and disable cleanup

## 6. Messaging Integration

- [ ] 6.1 Extend `netflix.ts` message listener to handle `UPDATE_SUBTITLE_STYLE` — call `renderer.updateStyle(config)` when renderer is enabled, ignore when disabled
- [ ] 6.2 Update popup toggle handler to include current `appearanceConfig` in `TOGGLE_TRANSLATION` message payload
- [ ] 6.3 Add debounced (~100ms) style update sending in popup appearance-change handlers so rapid drag interactions produce a single renderer update
- [ ] 6.4 Preserve existing behavior when content scripts do not respond or rendering is disabled
- [ ] 6.5 Add tests for popup-to-content-script style propagation, debounced updates, message handling when renderer is disabled, and error-tolerant fallback behavior

## 7. Verification

- [ ] 7.1 Run `npm test -- --run`
- [ ] 7.2 Run `npm run lint`
- [ ] 7.3 Run `npm run test:extension-syntax`
- [ ] 7.4 Manually verify popup preview resizing and live overlay application on a local or live Netflix playback page