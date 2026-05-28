## Context

The extension currently enables translated subtitle playback from the popup and renders text through `SubtitleRenderer` in the Netflix content script. The renderer owns a fixed-position overlay with hard-coded font size, width, and bottom placement. The popup currently controls target language, translation preparation, rendering enablement, diagnostics, and a segment preview list.

This change adds user-configurable subtitle appearance from the popup. The settings affect the live Netflix overlay and are previewed in a resizable popup preview area before or while translation rendering is enabled.

## Goals / Non-Goals

**Goals:**
- Let users configure subtitle font size and placement from the popup.
- Provide a visual preview area in the popup that reflects the selected subtitle style.
- Let users resize the preview/subtitle area with the mouse.
- Make subtitle text fit inside the configured area without overflowing.
- Persist settings and apply them consistently when translated subtitles are enabled or updated.
- Keep default rendering behavior compatible with current subtitles when no settings exist.

**Non-Goals:**
- Full subtitle theme editing such as color palettes, fonts, shadows, outlines, or animation.
- Per-video/per-language style profiles; settings are global unless a later change adds profile scope.
- Editing subtitle text or timing from the preview.
- Replacing the existing translation preparation workflow.
- Building a real browser-extension E2E harness in this change.

## Decisions

### Store one global subtitle appearance config

The extension will introduce a structured `SubtitleAppearanceConfig` persisted in `chrome.storage.local`. The initial fields will cover font size, placement, subtitle area dimensions, and optional horizontal/vertical offsets needed to reproduce the preview area in the live renderer. Area dimensions (width, height, offsets) will be stored as percentages of the video rect so that settings remain valid across different viewport sizes, windowed vs fullscreen playback, and different screen resolutions. The renderer will convert stored percentages to pixel values at render time using `video.getBoundingClientRect()`.

Alternative considered: store settings per video or per language. That gives more control but creates extra UI and state complexity before there is a clear need. A single global setting matches user expectations for visual preferences and is easier to apply consistently.

### Add popup controls next to translation enablement

The popup will gain a compact appearance section under the existing controls, not a separate page. It will include a font-size control, a placement control for bottom/top, and a preview/editor region. This keeps configuration available at the moment users enable subtitles.

Alternative considered: put appearance settings in the options page. That is less discoverable because the user needs to tune the overlay while looking at a video and preview.

### Use a resizable preview area as the source of area settings

The popup preview will show sample subtitle text inside a resizable area. Mouse resizing will update the stored subtitle area dimensions. The preview will use the same style computation rules as live rendering where practical, so the user sees a close approximation before enabling the overlay.

Alternative considered: simple width/height sliders only. Sliders are easier to implement but make the feature harder to understand because users cannot directly manipulate the visual region.

### Apply style through content-script messaging

When the popup toggles translation, checks rendering status, or changes style while rendering is active, it will send the appearance config to the content script. `SubtitleRenderer` will accept style updates independently from segment updates so appearance changes can apply without reloading translated segments. Style update messages will be debounced (approximately 100ms) when the user is actively resizing the preview area or adjusting controls, to avoid flooding the content script with rapid style changes during drag interactions.

Alternative considered: have the content script read storage directly on every style change. Message-driven updates keep the popup as the configuration owner and avoid repeated storage reads during playback.

### Fit text to the configured area with bounded scaling

The renderer and preview will fit subtitle text inside the configured area using wrapping plus bounded font-size reduction. The configured font size is the preferred size; fit logic may reduce it to a minimum readable size when a line would overflow. Text must not expand beyond the configured area.

Both the popup preview and the content script renderer will use a shared `fitTextToArea` utility that measures text using a hidden DOM measurement element (a temporary `<span>` styled to match the overlay font settings). Canvas `measureText` was considered but rejected because it does not account for CSS `white-space`, `word-break`, or `line-height` — all of which affect how subtitles wrap and fill the allocated area. The DOM approach gives consistent results between preview and live rendering because both use the same font settings and text layout rules.

Recalculation is triggered only on segment text changes, style changes, overlay resize, and video resize — never per frame — to avoid layout thrashing during playback.

Alternative considered: use only CSS wrapping and overflow hidden. That avoids measurement code but can clip subtitles and makes the "fit into area" requirement unreliable.

Alternative considered: Canvas `measureText` for sizing. Faster and thrash-free, but does not account for CSS wrapping behavior, line-height, or word-break, producing inconsistent results between the preview approximation and the live overlay.

## Risks / Trade-offs

- Popup dimensions are limited → Keep controls compact and make preview resizable within popup-safe min/max bounds.
- Preview may not perfectly match Netflix fullscreen dimensions → Use shared config and style rules, and treat preview as an approximation rather than a pixel-perfect live video mirror.
- Text measurement can cause layout thrashing during playback → Use a shared DOM-based measurement utility with a hidden measurement element. Recalculate only on segment text changes, style changes, overlay resize, and video resize; avoid per-frame measurement.
- Very long unbroken text may still be hard to display → Use word-break behavior and bounded font-size reduction, with a minimum font size to preserve readability.
- Top placement can overlap Netflix controls or UI → Provide top/bottom placement only initially and keep the overlay area constrained to the video rectangle.
- Rapid style changes during drag/resize can flood the content script → Debounce style update messages from the popup (~100ms) so the renderer applies the latest state without per-pixel updates.
- Style update arriving before renderer is enabled → Ignore the message; the renderer will apply the current saved config when `enable()` is next called.
