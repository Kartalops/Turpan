// Background service worker for Chrome extension
chrome.runtime.onInstalled.addListener(() => {
  console.log('AI Content Helper installed');
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'analyzeText') {
    // Placeholder for AI text analysis
    sendResponse({ success: true });
  }
  return true;
});
