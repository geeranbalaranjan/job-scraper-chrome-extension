// Initialize storage on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get('settings', data => {
    if (data.settings === undefined) {
      chrome.storage.sync.set({ settings: {} });
    }
  });
});

// Listen for popup’s “inject” request
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.action === 'inject' && msg.tabId) {
    chrome.scripting.executeScript({
      target: { tabId: msg.tabId, allFrames: true },
      files: ['content_script.js']
    }).catch(console.error);
  }
});
