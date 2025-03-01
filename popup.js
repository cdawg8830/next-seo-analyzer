/**
 * Next.js Performance Analyzer - Popup Script
 * 
 * Handles UI updates and communicates with the background script
 * to analyze the current page and display the results.
 */

const DEBUG = true;

// UI Elements
const elements = {
  loadingContainer: document.getElementById('loading-container'),
  loadingText: document.getElementById('loading-text'),
  progressBar: document.getElementById('progress-bar'),
  errorContainer: document.getElementById('error-container'),
  errorMessage: document.getElementById('error-message'),
  retryButton: document.getElementById('retry-button'),
  notNextjsContainer: document.getElementById('not-nextjs-container'),
  resultsContainer: document.getElementById('results-container'),
  
  // Next.js Configuration
  routerType: document.getElementById('router-type'),
  featuresContainer: document.getElementById('features-container'),
  
  // Metrics
  lcpValue: document.getElementById('lcp-value'),
  inpValue: document.getElementById('inp-value'),
  clsValue: document.getElementById('cls-value'),
  speedValue: document.getElementById('speed-value'),
  speedMarker: document.getElementById('speed-spectrum-marker'),
  
  // Recommendations
  technicalRecommendations: document.getElementById('technical-recommendations'),
  
  // CTA
  ctaButton: document.getElementById('cta-button')
};

// Helper functions
function log(message, data) {
  if (DEBUG) {
    console.log(`[Popup] ${message}`, data || '');
  }
}

function showView(viewElement) {
  // Hide all views
  elements.loadingContainer.style.display = 'none';
  elements.errorContainer.style.display = 'none';
  elements.notNextjsContainer.style.display = 'none';
  elements.resultsContainer.style.display = 'none';
  
  // Show the requested view
  if (viewElement) {
    viewElement.style.display = 'block';
  }
}

function updateProgressBar(percent) {
  if (elements.progressBar) {
    elements.progressBar.style.width = `${percent}%`;
  }
}

function updateLoadingText(text) {
  if (elements.loadingText) {
    elements.loadingText.textContent = text;
  }
}

function showError(message) {
  log('Showing error:', message);
  if (elements.errorMessage) {
    elements.errorMessage.textContent = message || 'An error occurred during analysis.';
  }
  showView(elements.errorContainer);
}

// Format the metrics based on their values
function formatMetric(value, type) {
  if (value === undefined || value === null) {
    return '--';
  }
  
  let formattedValue;
  let metricClass = '';
  
  switch (type) {
    case 'lcp':
      formattedValue = `${value.toFixed(1)}s`;
      if (value < 2.5) metricClass = 'good';
      else if (value < 4) metricClass = 'moderate';
      else metricClass = 'poor';
      break;
    
    case 'inp':
      formattedValue = `${value.toFixed(0)}ms`;
      if (value < 200) metricClass = 'good';
      else if (value < 500) metricClass = 'moderate';
      else metricClass = 'poor';
      break;
      
    case 'cls':
      formattedValue = value.toFixed(2);
      if (value < 0.1) metricClass = 'good';
      else if (value < 0.25) metricClass = 'moderate';
      else metricClass = 'poor';
      break;
      
    case 'speed':
      formattedValue = value.toFixed(0);
      if (value > 80) metricClass = 'good';
      else if (value > 50) metricClass = 'moderate';
      else metricClass = 'poor';
      break;
      
    default:
      formattedValue = value.toString();
  }
  
  return { value: formattedValue, class: metricClass };
}

function displayNextJSConfig(data) {
  if (!data || !data.marketing_burden) return;
  
  // Update router type
  const routerType = data.marketing_burden.router_type || 'Pages';
  if (elements.routerType) {
    elements.routerType.textContent = `${routerType} Router`;
    elements.routerType.className = `router-badge ${routerType.toLowerCase()}`;
  }
  
  // Display features
  if (elements.featuresContainer && data.config_details && data.config_details.features) {
    elements.featuresContainer.innerHTML = '';
    
    const features = data.config_details.features;
    
    // Add feature badges
    if (features.imageOptimization) {
      addFeatureBadge('Image Optimization');
    }
    
    if (features.fontOptimization) {
      addFeatureBadge('Font Optimization');
    }
    
    if (features.i18n) {
      addFeatureBadge('i18n Support');
    }
    
    // Add build ID if available
    if (data.config_details.buildId) {
      addFeatureBadge(`Build: ${data.config_details.buildId.substring(0, 7)}`);
    }
  }
}

function addFeatureBadge(text) {
  const badge = document.createElement('div');
  badge.className = 'feature-badge';
  badge.textContent = text;
  elements.featuresContainer.appendChild(badge);
}

function displayMetrics(metrics) {
  if (!metrics) return;
  
  // Format and display each metric
  const lcp = formatMetric(metrics.lcp, 'lcp');
  const inp = formatMetric(metrics.inp * 1000, 'inp'); // Convert to ms for display
  const cls = formatMetric(metrics.cls, 'cls');
  const speed = formatMetric(metrics.speed_score, 'speed');
  
  elements.lcpValue.textContent = lcp.value;
  elements.lcpValue.className = `metric-value ${lcp.class}`;
  
  elements.inpValue.textContent = inp.value;
  elements.inpValue.className = `metric-value ${inp.class}`;
  
  elements.clsValue.textContent = cls.value;
  elements.clsValue.className = `metric-value ${cls.class}`;
  
  // Update speed value and visual spectrum
  elements.speedValue.textContent = `${speed.value}/100`;
  elements.speedValue.className = `metric-value small ${speed.class}`;
  
  // Update the speed spectrum marker position (0-100%)
  if (elements.speedMarker) {
    const percentage = Math.max(0, Math.min(100, metrics.speed_score));
    elements.speedMarker.style.left = `${percentage}%`;
  }
}

function createRecommendationElement(rec) {
  const recElement = document.createElement('div');
  recElement.className = 'recommendation technical';
  
  const titleElement = document.createElement('div');
  titleElement.className = 'recommendation-title';
  titleElement.textContent = rec.title;
  recElement.appendChild(titleElement);
  
  const descElement = document.createElement('div');
  descElement.className = 'recommendation-description';
  descElement.textContent = rec.description;
  recElement.appendChild(descElement);
  
  if (rec.impact) {
    const impactElement = document.createElement('span');
    impactElement.className = `recommendation-impact ${rec.impact.toLowerCase()}`;
    impactElement.textContent = `${rec.impact} Impact`;
    recElement.appendChild(impactElement);
  }
  
  if (rec.implementation) {
    const implElement = document.createElement('div');
    implElement.className = 'recommendation-implementation';
    implElement.textContent = rec.implementation;
    recElement.appendChild(implElement);
  }
  
  return recElement;
}

function displayRecommendations(recommendations) {
  if (!recommendations) return;
  
  // Clear existing recommendations
  elements.technicalRecommendations.innerHTML = '';
  
  // Add technical recommendations
  if (recommendations.technical && recommendations.technical.length > 0) {
    recommendations.technical.forEach(rec => {
      const recElement = createRecommendationElement(rec);
      elements.technicalRecommendations.appendChild(recElement);
    });
  } else {
    elements.technicalRecommendations.innerHTML = '<p>No technical recommendations found.</p>';
  }
}

function displayResults(results) {
  log('Displaying results', results);
  
  if (!results || !results.is_nextjs) {
    showView(elements.notNextjsContainer);
    return;
  }
  
  // Display Next.js configuration
  displayNextJSConfig(results);
  
  // Display performance metrics
  displayMetrics(results.metrics);
  
  // Display recommendations
  displayRecommendations(results.recommendations);
  
  // Show the results view
  showView(elements.resultsContainer);
}

// Reset all metric displays to their default state
function resetMetricsDisplay() {
  log('Resetting metrics display');
  
  // Reset all metric values
  elements.lcpValue.textContent = '--';
  elements.lcpValue.className = 'metric-value';
  
  elements.inpValue.textContent = '--';
  elements.inpValue.className = 'metric-value';
  
  elements.clsValue.textContent = '--';
  elements.clsValue.className = 'metric-value';
  
  elements.speedValue.textContent = '--';
  elements.speedValue.className = 'metric-value';
  
  // Clear recommendations
  if (elements.technicalRecommendations) {
    elements.technicalRecommendations.innerHTML = '';
  }
  
  // Clear features
  if (elements.featuresContainer) {
    elements.featuresContainer.innerHTML = '';
  }
  
  // Reset router type
  if (elements.routerType) {
    elements.routerType.textContent = 'Router';
    elements.routerType.className = 'router-badge';
  }
}

function startAnalysis() {
  log('Starting analysis');
  
  // Reset metrics display to prevent carryover from previous tabs
  resetMetricsDisplay();
  
  // Show loading view
  showView(elements.loadingContainer);
  updateProgressBar(10);
  updateLoadingText('Initiating analysis...');
  
  // Get the active tab and send a message to the background script
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (!tabs || !tabs[0]) {
      showError('Could not find the active tab.');
      return;
    }
    
    const tabId = tabs[0].id;
    log(`Starting analysis for tab ${tabId}`);
    
    // Start the analysis
    chrome.runtime.sendMessage({ action: 'startAnalysis', tabId }, response => {
      if (chrome.runtime.lastError) {
        log('Runtime error:', chrome.runtime.lastError);
        showError(`Error starting analysis: ${chrome.runtime.lastError.message}`);
        return;
      }
      
      log('Got response from background script:', response);
      
      if (!response) {
        showError('No response received from the background script.');
        return;
      }
      
      if (response.error) {
        showError(response.error || 'Failed to start the analysis.');
        return;
      }
      
      // Analysis started successfully, check for results
      checkResults(tabId);
    });
  });
}

function checkResults(tabId) {
  log(`Checking results for tab ${tabId}`);
  chrome.runtime.sendMessage({ action: 'getResults', tabId }, response => {
    if (chrome.runtime.lastError) {
      log('Runtime error while checking results:', chrome.runtime.lastError);
      showError(`Error checking results: ${chrome.runtime.lastError.message}`);
      return;
    }
    
    log('Got results response:', response);
    
    if (!response) {
      showError('No response received from background script.');
      return;
    }
    
    if (response.error) {
      showError(response.error);
      return;
    }
    
    // Handle the current state of the analysis
    if (response.status === 'completed') {
      log('Analysis complete, displaying results');
      displayResults(response.results);
    } else if (response.status === 'in_progress') {
      // Update the progress bar and loading text
      log(`Analysis in progress: ${response.progress}%`);
      updateProgressBar(response.progress || 30);
      updateLoadingText(response.message || 'Analyzing...');
      
      // Check again in 500ms
      setTimeout(() => checkResults(tabId), 500);
    } else if (response.status === 'not_nextjs') {
      log('Not a Next.js site');
      showView(elements.notNextjsContainer);
    } else if (response.status === 'error') {
      log('Analysis error:', response.message);
      showError(response.message || 'An error occurred during analysis.');
    } else if (response.status === 'not_started') {
      log('Analysis not started yet, starting now');
      // Start the analysis if it hasn't been started yet
      startAnalysis();
    } else {
      log('Unknown analysis status:', response.status);
      showError('Unknown analysis status.');
    }
  });
}

function clearResults() {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (!tabs || !tabs[0]) return;
    
    chrome.runtime.sendMessage({ 
      action: 'clearResults', 
      tabId: tabs[0].id 
    }, () => {
      startAnalysis();
    });
  });
}

// Initialize popup
function initializePopup() {
  log('Initializing popup');
  
  // Reset metrics display when popup opens
  resetMetricsDisplay();
  
  // Set up event listeners
  if (elements.retryButton) {
    elements.retryButton.addEventListener('click', clearResults);
  }
  
  // Set CTA button URL and text
  if (elements.ctaButton) {
    elements.ctaButton.href = 'https://thenextseoplugin.com';
    elements.ctaButton.target = '_blank';
    elements.ctaButton.rel = 'noopener noreferrer';
  }
  
  // Start the analysis
  startAnalysis();
  
  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    log('Received message', message);
    
    if (message.action === 'progressUpdate') {
      updateProgressBar(message.progress || 50);
      updateLoadingText(message.message || 'Analyzing...');
    } else if (message.action === 'analysisCompleted') {
      chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        if (!tabs || !tabs[0]) return;
        checkResults(tabs[0].id);
      });
    } else if (message.action === 'analysisError') {
      showError(message.error || 'An error occurred during analysis.');
    }
    
    sendResponse({ received: true });
    return true;
  });
}

// Start the popup
document.addEventListener('DOMContentLoaded', initializePopup); 