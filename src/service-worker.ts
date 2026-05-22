// Netflix Translator - Service Worker
// Handles cross-origin requests, coordination between content scripts and popup

console.log('[Netflix Translator] Service worker initialized');

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Service Worker] Received message:', message, 'from:', sender);
  
  // TODO: Handle subtitle fetch requests, translation coordination, etc.
  
  sendResponse({ status: 'acknowledged' });
  return true; // Keep channel open for async responses
});

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[Netflix Translator] Extension installed:', details.reason);
});
