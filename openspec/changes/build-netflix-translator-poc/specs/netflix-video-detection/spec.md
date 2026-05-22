## ADDED Requirements

### Requirement: Detect Netflix watch pages
The extension SHALL activate its Netflix playback workflow only when the active tab is on a Netflix watch page.

#### Scenario: User opens a Netflix watch URL
- **WHEN** the active tab URL matches `https://www.netflix.com/watch/<video-id>`
- **THEN** the extension detects the page as a supported Netflix video page

#### Scenario: User opens a non-watch Netflix URL
- **WHEN** the active tab URL is a Netflix page that does not match the watch URL pattern
- **THEN** the extension does not start subtitle extraction or rendering

### Requirement: Extract active video ID
The extension SHALL extract the active Netflix video ID from the current watch URL.

#### Scenario: Watch URL contains numeric video ID
- **WHEN** the active Netflix watch URL contains a video ID path segment
- **THEN** the extension stores that video ID as the current video identifier

#### Scenario: Netflix single-page navigation changes video
- **WHEN** Netflix changes from one watch URL to another without a full page reload
- **THEN** the extension updates the current video identifier and restarts the subtitle workflow for the new video

### Requirement: Report unsupported page state
The extension SHALL expose a clear unsupported state when a Netflix video ID cannot be determined.

#### Scenario: Watch page has no usable video ID
- **WHEN** the extension cannot extract a video ID from the active Netflix page
- **THEN** it does not attempt subtitle extraction and reports that the current page is unsupported
