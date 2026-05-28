## ADDED Requirements

### Requirement: Persist subtitle appearance settings
The extension SHALL persist a global subtitle appearance configuration that controls translated subtitle rendering.

#### Scenario: Default appearance is used
- **WHEN** no subtitle appearance configuration has been saved
- **THEN** translated subtitles SHALL render with the current default visual behavior, including a readable font size and bottom placement

#### Scenario: Area dimensions are stored as percentages
- **WHEN** the user configures subtitle area dimensions
- **THEN** the extension SHALL store width, height, and offset values as percentages of the video rectangle so that settings remain valid across different viewport sizes and fullscreen transitions

#### Scenario: User saves appearance settings
- **WHEN** the user changes subtitle appearance settings in the popup
- **THEN** the extension SHALL save the new configuration in extension local storage
- **AND** subsequent popup sessions SHALL load the saved configuration

#### Scenario: Invalid stored settings are encountered
- **WHEN** stored subtitle appearance settings are missing fields or contain values outside supported bounds
- **THEN** the extension SHALL fall back to valid defaults for those fields without preventing subtitle rendering
- **AND** normalization SHALL occur at the storage/popup layer before settings are sent to the content script, so the renderer always receives a valid complete config

### Requirement: Configure subtitle font size
The popup SHALL allow users to change the preferred translated subtitle font size.

#### Scenario: User changes font size
- **WHEN** the user selects a supported font size in the popup
- **THEN** the popup preview SHALL update to show the selected font size
- **AND** the setting SHALL be persisted as part of the subtitle appearance configuration

#### Scenario: Font size changes while subtitles are enabled
- **WHEN** translated subtitles are currently enabled and the user changes font size
- **THEN** the live subtitle overlay SHALL apply the new preferred font size without requiring translation to be disabled and re-enabled

### Requirement: Configure subtitle placement
The popup SHALL allow users to place translated subtitles at the top or bottom of the video area.

#### Scenario: User selects bottom placement
- **WHEN** the user selects bottom placement
- **THEN** the popup preview SHALL show subtitles in the bottom area
- **AND** the live subtitle overlay SHALL render translated subtitles near the bottom of the video area

#### Scenario: User selects top placement
- **WHEN** the user selects top placement
- **THEN** the popup preview SHALL show subtitles in the top area
- **AND** the live subtitle overlay SHALL render translated subtitles near the top of the video area

#### Scenario: Placement changes while subtitles are enabled
- **WHEN** translated subtitles are currently enabled and the user changes placement
- **THEN** the live subtitle overlay SHALL move to the new placement without reloading translated segments

### Requirement: Preview subtitle appearance in popup
The popup SHALL provide a visual subtitle appearance preview that reflects the current subtitle appearance configuration.

#### Scenario: Popup opens with saved settings
- **WHEN** the popup opens and saved subtitle appearance settings exist
- **THEN** the preview SHALL render sample subtitle text using the saved font size, placement, and area settings

#### Scenario: User adjusts appearance controls
- **WHEN** the user changes font size, placement, or subtitle area size
- **THEN** the preview SHALL update immediately to reflect the pending appearance

#### Scenario: No translated segments are available
- **WHEN** the current video has no ready translated subtitle segments
- **THEN** the preview SHALL still display representative sample subtitle text for appearance tuning

### Requirement: Resize subtitle area with mouse
The popup preview SHALL allow users to resize the subtitle area using mouse interaction.

#### Scenario: User resizes preview area
- **WHEN** the user drags the preview area's resize handle
- **THEN** the preview subtitle area SHALL resize within supported minimum and maximum bounds
- **AND** the updated area dimensions SHALL be persisted as part of the subtitle appearance configuration

#### Scenario: User attempts unsupported area size
- **WHEN** the user drags the preview area smaller or larger than supported bounds
- **THEN** the extension SHALL clamp the area to the nearest supported dimensions

#### Scenario: Area size changes while subtitles are enabled
- **WHEN** translated subtitles are currently enabled and the user resizes the preview subtitle area
- **THEN** the live subtitle overlay SHALL apply the new area sizing without requiring translation to be disabled and re-enabled
- **AND** style update messages SHALL be debounced so that rapid sizing changes during a drag interaction are coalesced into a single renderer update

### Requirement: Fit subtitle text inside configured area
The popup preview and live subtitle overlay SHALL ensure translated subtitle text fits inside the configured subtitle area.

#### Scenario: Text fits at preferred font size
- **WHEN** the subtitle text fits inside the configured area at the preferred font size
- **THEN** the preview and live overlay SHALL render the text at the preferred font size without clipping

#### Scenario: Text exceeds configured area
- **WHEN** the subtitle text would overflow the configured area at the preferred font size
- **THEN** the preview and live overlay SHALL wrap text and reduce font size within supported bounds until the text fits

#### Scenario: Text cannot fully fit after reduction
- **WHEN** the subtitle text still cannot fully fit after reaching the minimum supported font size
- **THEN** the preview and live overlay SHALL prevent layout overflow and preserve readable text as much as possible without expanding outside the configured area

### Requirement: Apply appearance to live translated subtitle rendering
The content script renderer SHALL apply the saved subtitle appearance configuration whenever translated subtitles are enabled, updated, or styled while active.

#### Scenario: User enables translated subtitles
- **WHEN** the user enables translated subtitles from the popup
- **THEN** the content script SHALL render subtitles using the saved subtitle appearance configuration

#### Scenario: User updates appearance while active
- **WHEN** translated subtitles are active and the popup sends an updated subtitle appearance configuration
- **THEN** the content script SHALL update the existing overlay styles without losing the current translated segment list

#### Scenario: User disables translated subtitles
- **WHEN** the user disables translated subtitles
- **THEN** the renderer SHALL remove the live subtitle overlay while preserving the saved subtitle appearance configuration

#### Scenario: Style update arrives before renderer is enabled
- **WHEN** the popup sends a subtitle appearance configuration before the content script renderer has been enabled
- **THEN** the content script SHALL ignore the style update message
- **AND** the rendered overlay SHALL apply the current saved appearance configuration when `enable()` is next called

#### Scenario: No active video when style is changed
- **WHEN** the user changes appearance settings while no video is playing
- **THEN** the extension SHALL persist the settings and apply them when a video is later detected and subtitles are enabled
