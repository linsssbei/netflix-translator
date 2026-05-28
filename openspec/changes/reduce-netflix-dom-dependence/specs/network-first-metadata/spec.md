## ADDED Requirements

### Requirement: Network metadata cache primary source
The system SHALL cache `nt-video-metadata` events by video ID and use cached data as the primary metadata source for video detection and subtitle context. When network metadata is available, the system SHALL NOT resort to Netflix DOM selectors for title, synopsis, maturity rating, or genres.

#### Scenario: Network metadata arrives before video detection
- **WHEN** an `nt-video-metadata` event is dispatched with a matching `videoId`
- **THEN** the system SHALL use the event's `title`, `synopsis`, `maturityRating`, and `genres` fields as the video's metadata with `confidence: 'high'` and `source: 'metadata-response'`

#### Scenario: Network metadata arrives after initial video detection
- **WHEN** a video is detected via URL change but no network metadata is cached yet
- **THEN** the system SHALL start a metadata wait loop that checks the cache on each iteration, falling back to DOM primitives only after the wait loop exhausts its retries

#### Scenario: Multiple metadata events for the same video
- **WHEN** multiple `nt-video-metadata` events arrive for the same `videoId`
- **THEN** the system SHALL use the most recent event (by `timestamp`) as the authoritative metadata

### Requirement: DOM metadata fallback with stable primitives only
The system SHALL provide a fallback metadata extraction function that uses only stable browser primitives: `document.title`, `<meta>` tags (`og:title`, `og:description`, `twitter:title`, `twitter:description`, `description`), and `<script type="application/ld+json">` (JSON-LD). The fallback SHALL NOT use Netflix-specific `[data-uia]` attributes, Netflix CSS classes, or generic `<script>` text scanning.

#### Scenario: No network metadata available
- **WHEN** no cached network metadata exists for the current video ID after retries are exhausted
- **THEN** the system SHALL extract metadata from `document.title`, `<meta>` tags, and JSON-LD, and assign `confidence: 'low'` and `source: 'dom-fallback'`

#### Scenario: JSON-LD provides title
- **WHEN** the page contains a `<script type="application/ld+json">` element with a `name` or `title` field
- **THEN** the system SHALL use that title with `confidence: 'medium'` and `source: 'json-ld'`

#### Scenario: Only document.title available
- **WHEN** no JSON-LD, meta tags, or network metadata provide a title
- **THEN** the system SHALL use `document.title` (stripped of Netflix suffix) with `confidence: 'low'` and `source: 'document-title'`

### Requirement: Metadata staleness handling
The system SHALL support subtitle acquisition and translation even when metadata is partial or missing. A missing or stale title SHALL NOT prevent subtitle download or display.

#### Scenario: Empty or stale metadata
- **WHEN** video metadata returns empty `title` and `synopsis` fields
- **THEN** the system SHALL still proceed with subtitle acquisition and translation, using the video ID as the sole identifier

#### Scenario: Metadata arrives after subtitle candidate
- **WHEN** a subtitle candidate arrives before network metadata is cached
- **THEN** the system SHALL process the subtitle immediately and update the associated metadata when network metadata arrives later