/**
 * Next.js Performance Analyzer - Background Script
 * 
 * This script manages analysis state and coordinates communication between 
 * the popup and content scripts.
 */

// Set to true for detailed logging
const DEBUG = true;

// Simple logger
function log(message, data) {
  if (DEBUG) {
    console.log(`[Next.js Analyzer - BG] ${message}`, data || '');
  }
}

// Store analysis results by tab ID
const tabResults = new Map();

// Clear results for a specific tab
function clearTab(tabId) {
  if (tabId && tabResults.has(tabId)) {
    log(`Clearing results for tab ${tabId}`);
    tabResults.delete(tabId);
    return true;
  }
  return false;
}

// Check if content script is available
async function isContentScriptAvailable(tabId) {
  try {
    log(`Checking if content script is available in tab ${tabId}`);
    const response = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
    log(`Content script ping response:`, response);
    return response && response.status === 'alive';
  } catch (error) {
    log(`Content script is not available in tab ${tabId}:`, error);
    return false;
  }
}

// Start analysis for a tab
async function startAnalysis(tabId) {
  log(`Starting analysis for tab ${tabId}`);
  
  // Always clear previous results for this tab to prevent data carryover
  clearTab(tabId);
  
  try {
    // First check if content script is available
    const isAvailable = await isContentScriptAvailable(tabId);
    if (!isAvailable) {
      log(`Content script not available in tab ${tabId}`);
      tabResults.set(tabId, {
        status: 'error',
        error: 'Please refresh the page and try again. The extension needs to be initialized.',
        timestamp: Date.now()
      });
      return { 
        success: false, 
        error: 'Please refresh the page and try again. The extension needs to be initialized.' 
      };
    }
    
    // Store initial state with explicit reset of metrics
    tabResults.set(tabId, {
      status: 'in_progress',
      progress: 0,
      timestamp: Date.now(),
      metrics: null // Explicitly set metrics to null
    });
    
    // Send message to content script to start analysis
    try {
      await chrome.tabs.sendMessage(tabId, { action: 'startAnalysis' });
      log(`Sent startAnalysis message to tab ${tabId}`);
      return { success: true };
    } catch (err) {
      console.error(`[Next.js Analyzer - BG] Error sending message to content script:`, err);
      tabResults.set(tabId, {
        status: 'error',
        error: 'Could not communicate with content script. Please refresh the page and try again.',
        timestamp: Date.now()
      });
      return { success: false, error: 'Could not communicate with content script. Please refresh the page and try again.' };
    }
  } catch (error) {
    console.error(`[Next.js Analyzer - BG] Error starting analysis:`, error);
    
    // Update state with error
    tabResults.set(tabId, {
      status: 'error',
      error: error.message,
      timestamp: Date.now()
    });
    
    return { success: false, error: error.message };
  }
}

// Get current results for a tab
function getResults(tabId) {
  if (!tabId) return { status: 'error', error: 'No tab ID provided' };
  
  if (!tabResults.has(tabId)) {
    return { status: 'not_started' };
  }
  
  return tabResults.get(tabId);
}

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = message.tabId || (sender.tab && sender.tab.id);
  
  log(`Received message: ${message.action}`, { tabId, message });
  
  // Handle messages from the popup
  if (message.action === 'startAnalysis') {
    // Always clear results first
    clearTab(tabId);
    
    startAnalysis(message.tabId)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
  }
  
  // Handle request for current results
  else if (message.action === 'getResults') {
    sendResponse(getResults(message.tabId));
    return false;
  }
  
  // Handle clear results request
  else if (message.action === 'clearResults') {
    const success = clearTab(message.tabId);
    sendResponse({ success });
    return false;
  }
  
  // Handle analysis progress updates from content script
  else if (message.action === 'progressUpdate' && tabId) {
    // Update the stored results with progress
    const currentData = tabResults.get(tabId) || {};
    tabResults.set(tabId, {
      ...currentData,
      status: 'in_progress',
      progress: message.progress,
      message: message.message,
      timestamp: Date.now()
    });
    
    // Forward to popup if this tab is active
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].id === tabId) {
        chrome.runtime.sendMessage({
          action: 'progressUpdate',
          progress: message.progress,
          message: message.message
        }).catch(() => {}); // Ignore errors if popup is closed
      }
    });
    
    sendResponse({ success: true });
    return false;
  }
  
  // Handle analysis completion from content script
  else if (message.action === 'analysisCompleted' && tabId) {
    // Store the complete results
    tabResults.set(tabId, {
      status: 'completed',
      results: message,
      timestamp: Date.now()
    });
    
    // Forward to popup if this tab is active
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].id === tabId) {
        chrome.runtime.sendMessage({
          action: 'analysisCompleted',
          results: message
        }).catch(() => {}); // Ignore errors if popup is closed
      }
    });
    
    sendResponse({ success: true });
    return false;
  }
  
  // Handle analysis errors from content script
  else if (message.action === 'analysisError' && tabId) {
    // Store the error
    tabResults.set(tabId, {
      status: 'error',
      error: message.error,
      timestamp: Date.now()
    });
    
    // Forward to popup if this tab is active
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].id === tabId) {
        chrome.runtime.sendMessage({
          action: 'analysisError',
          error: message.error
        }).catch(() => {}); // Ignore errors if popup is closed
      }
    });
    
    sendResponse({ success: true });
    return false;
  }
});

// Clean up when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  clearTab(tabId);
});

// Log when extension is loaded
log('Background script initialized'); 