// Store analysis results per tab
let analysisResults = new Map();

// Debug function to log the current state
function logState(context) {
  console.log(`[Next.js Analyzer] State (${context}):`, {
    mapSize: analysisResults.size,
    allEntries: Array.from(analysisResults.entries()).map(([tabId, data]) => ({
      tabId,
      timestamp: data.timestamp,
      hasData: !!data.data
    }))
  });
}

// Helper function to safely send messages to popup
async function sendToPopup(tabId, type, data) {
  try {
    await chrome.runtime.sendMessage({ type, data, tabId });
    console.log('[Next.js Analyzer] Sent message to popup:', { type, tabId, dataSnapshot: JSON.stringify(data).slice(0, 100) + '...' });
  } catch (error) {
    if (!error.message.includes('receiving end does not exist')) {
      console.warn('[Next.js Analyzer] Failed to send message to popup:', error);
    }
  }
}

// Clear results for a tab
function clearTabResults(tabId) {
  console.log('[Next.js Analyzer] Attempting to clear results for tab:', tabId);
  logState('before clear');
  if (analysisResults.has(tabId)) {
    analysisResults.delete(tabId);
    console.log('[Next.js Analyzer] Cleared results for tab:', tabId);
  }
  logState('after clear');
}

// Clear all results
function clearAllResults() {
  console.log('[Next.js Analyzer] Clearing all results');
  logState('before clear all');
  analysisResults.clear();
  logState('after clear all');
}

// Listen for installation and updates
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Next.js Analyzer] Extension installed/updated');
  clearAllResults();
});

// Listen for messages from content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender?.tab?.id || message.tabId;
  console.log('[Next.js Analyzer] Received message:', { 
    type: message.type, 
    tabId,
    sender: sender?.tab?.url || 'popup'
  });

  if (message.type === 'START_ANALYSIS') {
    console.log('[Next.js Analyzer] Starting new analysis for tab:', tabId);
    clearTabResults(tabId);
    sendResponse({ status: 'started' });
  }
  else if (message.type === 'ANALYSIS_COMPLETE') {
    if (tabId) {
      console.log('[Next.js Analyzer] Storing analysis results for tab:', tabId);
      const resultData = {
        data: message.data,
        timestamp: Date.now(),
        url: sender.tab.url
      };
      analysisResults.set(tabId, resultData);
      logState('after store');
      
      // Notify popup if it's open
      sendToPopup(tabId, 'UPDATE_ANALYSIS', message.data);
    }
  } 
  else if (message.type === 'GET_ANALYSIS') {
    console.log('[Next.js Analyzer] Get analysis request for tab:', message.tabId);
    const result = analysisResults.get(message.tabId);
    logState('on get analysis');
    
    if (!result) {
      console.log('[Next.js Analyzer] No results found for tab:', message.tabId);
      sendResponse(null);
    }
    // Check if results are stale (older than 30 seconds) or URL has changed
    else if (Date.now() - result.timestamp > 30000 || 
             (sender.tab && sender.tab.url !== result.url)) {
      console.log('[Next.js Analyzer] Results are stale or URL changed:', {
        age: Date.now() - result.timestamp,
        oldUrl: result.url,
        newUrl: sender.tab?.url
      });
      clearTabResults(message.tabId);
      sendResponse(null);
    } else {
      console.log('[Next.js Analyzer] Returning cached results for tab:', message.tabId);
      sendResponse(result.data);
    }
    return true;
  }
  else if (message.type === 'ANALYSIS_ERROR') {
    console.error('[Next.js Analyzer] Analysis error for tab:', tabId, message.error);
    if (tabId) {
      analysisResults.set(tabId, {
        data: { error: message.error },
        timestamp: Date.now(),
        url: sender.tab?.url
      });
      sendToPopup(tabId, 'UPDATE_ANALYSIS', { error: message.error });
    }
  }
  else if (message.type === 'ANALYSIS_PROGRESS') {
    sendToPopup(tabId, 'ANALYSIS_PROGRESS', message.data);
  }
  else if (message.type === 'FORCE_CLEAR') {
    console.log('[Next.js Analyzer] Force clearing all results');
    clearAllResults();
    sendResponse({ status: 'cleared' });
  }
});

// Clean up data when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  console.log('[Next.js Analyzer] Tab closed, cleaning up data for tab:', tabId);
  clearTabResults(tabId);
});

// Handle tab updates (reload/navigation)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading') {
    console.log('[Next.js Analyzer] Tab updated:', {
      tabId,
      url: tab.url,
      changeInfo
    });
    clearTabResults(tabId);
  }
});

// Handle extension updates
chrome.runtime.onUpdateAvailable.addListener(() => {
  console.log('[Next.js Analyzer] Update available, clearing data and reloading');
  clearAllResults();
  chrome.runtime.reload();
}); 