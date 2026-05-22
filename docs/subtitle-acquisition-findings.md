# Subtitle Acquisition Findings

## Task 3.6/3.7: Manual Verification Results

### ✅ Subtitle Acquisition is VIABLE

The extension successfully discovers and acquires Netflix subtitle files.

---

## Observed Subtitle Format

| Attribute | Value |
|-----------|-------|
| **Format** | TTML (Timed Text Markup Language) |
| **Size** | ~106KB for a full episode |
| **Content Type** | `application/ttml+xml` |
| **Source** | Netflix Open Connect CDN (`*.oca.nflxvideo.net`) |
| **URL Pattern** | `https://ipv4-*-*.oca.nflxvideo.net/...` |
| **Acquisition Method** | Page-world response cloning (fallback) |

---

## How It Works

1. **Page-world observer** intercepts `fetch()` and `XMLHttpRequest`
2. **URL pattern matching** detects subtitle-related URLs:
   - Contains `subtitle`, `caption`, `timedtext` keywords
   - File extensions: `.vtt`, `.ttml`, `.srt`, `.xml`, `.json`, `.dfxp`
3. **Content type matching** detects `text/vtt`, `application/ttml`, `application/xml`
4. **Response cloning** copies the subtitle payload without consuming the original
5. **Validation** checks for timing information and subtitle markers
6. **Re-fetch attempt** tries to get the file from extension context (usually blocked by CORS/session)
7. **Fallback** uses the cloned payload from page-world observer

---

## Netflix-Specific Challenges

### Internal APIs That Look Like Subtitles

Netflix uses JSON/XML for internal APIs that return `application/json` or `application/xml` content types. These were incorrectly matched initially:

| Endpoint | Purpose | Status |
|----------|---------|--------|
| `/log/www/1` | Analytics logging | Filtered out |
| `/nq/website/memberapi/release/metadata` | Video metadata | Filtered out |
| `/msl/playapi/cadmium/licensedmanifest` | Stream manifest | Filtered out |
| `/api/graphql` | GraphQL queries | Filtered out |

### Solution

Added `NETFLIX_IGNORE_PATTERNS` to skip these endpoints before content-type matching.

---

## Required Permissions

```json
{
  "permissions": ["storage", "activeTab"],
  "host_permissions": ["*://*.netflix.com/*"]
}
```

No additional permissions needed for subtitle acquisition via page-world observer.

---

## Format Detection

The TTML format is detected by:
- Content type: `application/ttml+xml`
- Payload markers: `<?xml`, `<tt`, `<body`, `<div`, `xml:lang`
- Timing attributes: `begin="..."`, `end="..."`

---

## Hash Computation

SHA-256 hash is computed over the full subtitle payload for deduplication and stale detection.

---

## Conclusion

**Subtitle acquisition is viable for the POC.** The extension successfully:
- ✅ Discovers subtitle requests on Netflix
- ✅ Acquires TTML subtitle payloads (106KB verified)
- ✅ Computes content hashes
- ✅ Validates subtitle format
- ✅ Filters out Netflix internal APIs

**Next Steps:**
- Task 4.1: Implement TTML parser
- Task 4.2: Normalize into timed segments
