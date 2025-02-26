// Initialize UI elements
const status = document.getElementById('status');
const metrics = document.getElementById('metrics');
const loading = document.getElementById('loading');
const loadingText = document.getElementById('loading-text');
const progressBar = document.getElementById('progress');

// Track current analysis state
let currentTabId = null;
let analysisInProgress = false;
let lastAnalysisTimestamp = null;

// Show loading state with progress
function showLoading(message, progress = null) {
  console.log('[Next.js Analyzer Popup] Showing loading:', { message, progress });
  status.className = 'status loading';
  status.innerHTML = '<div class="spinner"></div>Analyzing page...';
  metrics.style.display = 'none';
  
  loading.style.display = 'block';
  loadingText.textContent = message;
  
  if (progress !== null) {
    progressBar.style.width = `${progress}%`;
  }
}

// Show error state
function showError(message) {
  console.log('[Next.js Analyzer Popup] Showing error:', message);
  loading.style.display = 'none';
  status.className = 'status error';
  status.innerHTML = message;
  metrics.style.display = 'none';
}

// Reset UI state
function resetUI() {
  console.log('[Next.js Analyzer Popup] Resetting UI');
  status.className = 'status';
  status.innerHTML = '';
  metrics.style.display = 'none';
  loading.style.display = 'none';
  progressBar.style.width = '0%';
  analysisInProgress = false;
  lastAnalysisTimestamp = null;
}

// Force clear all results
async function forceCleanState() {
  console.log('[Next.js Analyzer Popup] Force cleaning state');
  try {
    await chrome.runtime.sendMessage({ type: 'FORCE_CLEAR' });
  } catch (e) {
    console.warn('[Next.js Analyzer Popup] Error clearing state:', e);
  }
}

// Update UI with results
function updateUI(data) {
  console.log('[Next.js Analyzer Popup] Updating UI with data:', {
    isNextJS: data.isNextJS,
    hasMetrics: !!data.metrics,
    timestamp: Date.now()
  });

  // Hide loading bar
  loading.style.display = 'none';
  analysisInProgress = false;
  lastAnalysisTimestamp = Date.now();

  // Handle non-Next.js sites
  if (!data.isNextJS) {
    status.className = 'status error';
    status.innerHTML = 'This page is not using Next.js';
    metrics.style.display = 'none';
    return;
  }

  // Show success state
  status.className = 'status success';
  status.innerHTML = 'Analysis complete';
  metrics.style.display = 'block';

  // Helper function to format metric values
  const formatMetricValue = (value, metric) => {
    switch(metric) {
      case 'LCP':
        return `${(value / 1000).toFixed(2)}s`;
      case 'FID':
        return `${value.toFixed(0)}ms`;
      case 'CLS':
        return value.toFixed(3);
      default:
        return value.toFixed(0);
    }
  };

  // Helper function to get score class and score
  const getScoreInfo = (value, metric) => {
    const thresholds = {
      LCP: { good: 2500, poor: 4000 }, // milliseconds
      FID: { good: 100, poor: 300 },   // milliseconds
      CLS: { good: 0.1, poor: 0.25 },  // unitless
      Speed: { good: 80, poor: 50 }    // percentage
    };

    const t = thresholds[metric];
    if (!t) return { class: 'score-poor', score: 0 };

    let score;
    let scoreClass;

    if (metric === 'Speed') {
      // For Speed, the value is already a percentage
      score = value;
      if (score >= t.good) scoreClass = 'score-good';
      else if (score >= t.poor) scoreClass = 'score-average';
      else scoreClass = 'score-poor';
    } else {
      // For Core Web Vitals, lower is better
      if (value <= t.good) {
        score = 100;
        scoreClass = 'score-good';
      } else if (value <= t.poor) {
        score = Math.round(((t.poor - value) / (t.poor - t.good)) * 50 + 50);
        scoreClass = 'score-average';
      } else {
        score = Math.max(0, Math.round((1 - (value - t.poor) / t.poor) * 50));
        scoreClass = 'score-poor';
      }
    }

    return { class: scoreClass, score: Math.round(score) };
  };

  // Update Core Web Vitals
  ['LCP', 'FID', 'CLS'].forEach(metric => {
    const value = data.metrics[metric].value;
    const scoreElement = document.getElementById(`${metric.toLowerCase()}-score`);
    const valueElement = document.getElementById(`${metric.toLowerCase()}-value`);
    
    if (scoreElement && valueElement) {
      const { class: scoreClass, score } = getScoreInfo(value, metric);
      scoreElement.className = `score-circle ${scoreClass}`;
      scoreElement.textContent = score;
      valueElement.textContent = formatMetricValue(value, metric);
    }
  });

  // Update Performance Score
  const performanceScore = data.metrics.Speed.value;
  const performanceScoreElement = document.getElementById('performance-score');
  const performanceValueElement = document.getElementById('performance-value');
  
  if (performanceScoreElement && performanceValueElement) {
    const { class: scoreClass, score } = getScoreInfo(performanceScore, 'Speed');
    performanceScoreElement.className = `score-circle ${scoreClass}`;
    performanceScoreElement.textContent = score;
    performanceValueElement.textContent = `${score}/100`;
  }

  // Update Recommendations
  const recommendationsContainer = document.getElementById('recommendations');
  const marketingRecommendationsContainer = document.getElementById('marketing-recommendations');
  
  if (recommendationsContainer && marketingRecommendationsContainer) {
    const technicalRecs = data.recommendations.filter(rec => rec.type === 'technical');
    const marketingRecs = data.recommendations.filter(rec => rec.type === 'marketing');

    // Technical recommendations
    if (technicalRecs.length > 0) {
      recommendationsContainer.innerHTML = technicalRecs
        .map(rec => `
          <div class="recommendation technical">
            <div class="recommendation-header">
              <div class="recommendation-title">${rec.recommendation}</div>
              <div class="recommendation-impact impact-${rec.impact}">${rec.impact}</div>
            </div>
            ${rec.metric !== 'Next.js Optimization' ? `
              <div class="recommendation-metric">
                ${rec.metric}: ${formatMetricValue(rec.currentValue, rec.metric)} 
                (Threshold: ${formatMetricValue(rec.threshold, rec.metric)})
              </div>
            ` : ''}
            <div class="recommendation-implementation">${rec.implementation}</div>
          </div>
        `)
        .join('');
    } else {
      recommendationsContainer.innerHTML = '<div class="recommendation">No technical recommendations at this time.</div>';
    }

    // Marketing recommendations
    if (marketingRecs.length > 0) {
      marketingRecommendationsContainer.innerHTML = marketingRecs
        .map(rec => `
          <div class="recommendation marketing">
            <div class="recommendation-header">
              <div class="recommendation-title">${rec.recommendation}</div>
              <div class="recommendation-impact impact-${rec.impact}">${rec.impact}</div>
            </div>
            <div class="recommendation-implementation">${rec.implementation}</div>
          </div>
        `)
        .join('');
    } else {
      marketingRecommendationsContainer.innerHTML = '<div class="recommendation">No marketing recommendations at this time.</div>';
    }
  }

  // Update CTA button (placeholder URL for now)
  const ctaButton = document.getElementById('cta-button');
  if (ctaButton) {
    ctaButton.href = '#'; // We'll update this later
    ctaButton.onclick = (e) => {
      e.preventDefault();
      console.log('CTA clicked - will implement detailed analysis page later');
    };
  }
}

// Initialize analysis when popup opens
async function initializeAnalysis() {
  try {
    console.log('[Next.js Analyzer Popup] Initializing analysis');
    
    // Reset UI state
    resetUI();
    
    // Force clear if we detect potential stale state
    await forceCleanState();
    
    // Get the current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTabId = tab.id;
    
    console.log('[Next.js Analyzer Popup] Analyzing tab:', {
      id: tab.id,
      url: tab.url
    });
    
    if (!tab.url.startsWith('http')) {
      showError('Please navigate to a website to analyze');
      return;
    }

    // Show initial loading state
    showLoading('Initializing analysis...', 0);
    analysisInProgress = true;

    // Start new analysis
    await chrome.runtime.sendMessage({
      type: 'START_ANALYSIS',
      tabId: currentTabId
    });

    // Inject content script if not already injected
    try {
      await chrome.scripting.executeScript({
        target: { tabId: currentTabId },
        func: () => {
          // Check if our script is already running
          if (!window.__nextAnalyzerRunning) {
            window.__nextAnalyzerRunning = true;
            // This will trigger the content script to run again if it hasn't
            window.dispatchEvent(new Event('load'));
          }
        }
      });
    } catch (e) {
      console.warn('[Next.js Analyzer Popup] Script injection error:', e);
    }

    // Request analysis from background script
    chrome.runtime.sendMessage({
      type: 'GET_ANALYSIS',
      tabId: currentTabId
    }, (response) => {
      if (chrome.runtime.lastError) {
        showError('Failed to get analysis results');
        return;
      }
      
      if (response) {
        updateUI(response);
      } else {
        showLoading('Starting analysis...', 10);
      }
    });
  } catch (error) {
    console.error('[Next.js Analyzer Popup] Initialization error:', error);
    showError(`Error: ${error.message}`);
  }
}

// Start analysis when popup opens
document.addEventListener('DOMContentLoaded', initializeAnalysis);

// Listen for updates from background script
chrome.runtime.onMessage.addListener((message) => {
  console.log('[Next.js Analyzer Popup] Received message:', {
    type: message.type,
    tabId: message.tabId,
    currentTabId
  });

  // Only process messages for current tab
  if (message.tabId !== currentTabId) {
    console.log('[Next.js Analyzer Popup] Ignoring message for different tab');
    return;
  }

  if (message.type === 'UPDATE_ANALYSIS') {
    updateUI(message.data);
  } else if (message.type === 'ANALYSIS_PROGRESS') {
    showLoading(message.data.message, message.data.progress);
  }
}); 