/**
 * Extracts video ID from a Netflix watch URL
 * @param url - The URL to parse
 * @returns The video ID or null if not a valid watch URL
 */
export function extractVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    
    // Only process netflix.com URLs
    if (!parsed.hostname.endsWith('netflix.com')) {
      return null;
    }
    
    // Match /watch/<video-id> pattern
    const match = parsed.pathname.match(/^\/watch\/(\d+)$/);
    if (match) {
      return match[1];
    }
    
    return null;
  } catch {
    // Invalid URL
    return null;
  }
}

/**
 * Checks if a URL is a Netflix watch page
 * @param url - The URL to check
 * @returns true if the URL is a Netflix watch page
 */
export function isNetflixWatchUrl(url: string): boolean {
  return extractVideoId(url) !== null;
}
