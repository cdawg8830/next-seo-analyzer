/**
 * Next.js Performance Analyzer - Content Script
 * 
 * This script analyzes the current page for Next.js characteristics,
 * collects performance metrics, and generates recommendations.
 */

// Set to true for detailed logging
const DEBUG = true;

// Simple logger
function log(message, data) {
  if (DEBUG) {
    console.log(`[Next.js Analyzer - Content] ${message}`, data || '');
  }
}

// Track analysis state
let isAnalyzing = false;
let observers = {};
let timeouts = {};

// Clean up function to reset state between analyses
function cleanup() {
  log('Cleaning up resources');
  
  // Disconnect all observers
  Object.values(observers).forEach(observer => {
    try {
      if (observer && typeof observer.disconnect === 'function') {
        observer.disconnect();
      }
    } catch (err) {
      console.error('Error disconnecting observer:', err);
    }
  });
  
  // Clear all timeouts
  Object.values(timeouts).forEach(timeout => {
    clearTimeout(timeout);
  });
  
  // Reset state
  observers = {};
  timeouts = {};
  isAnalyzing = false;
}

// Helper function to safely send messages to background script
async function sendMessage(action, data = {}) {
  try {
    log(`Sending message: ${action}`, data);
    const response = await chrome.runtime.sendMessage({
      action,
      ...data
    });
    log(`Response for ${action}:`, response);
    return response;
  } catch (error) {
    console.error(`[Next.js Analyzer - Content] Message error (${action}):`, error);
    return { error: error.message };
  }
}

/**
 * Core Detection Functions
 */

// Check if the page is built with Next.js
function detectNextJS() {
  log('Checking for Next.js...');
  
  try {
    // Look for definitive signs of Next.js
    const signatures = [
      // Check for next.js script chunks
      !!document.querySelector('script[src*="_next/static/chunks/"]'),
      // Check for next.js data script
      !!document.querySelector('script#__NEXT_DATA__'),
      // Check for next.js CSS
      !!document.querySelector('link[rel="stylesheet"][href*="_next/static/css/"]'),
      // Check for next.js preloads
      !!document.querySelector('link[rel="preload"][href*="_next/"]'),
      // Check for next meta tag
      !!document.querySelector('meta[name="next-head-count"]'),
      // Check for common Next.js HTML structure
      !!document.getElementById('__next'),
      // Check if window.__NEXT_DATA__ is defined
      typeof window.__NEXT_DATA__ !== 'undefined'
    ];
    
    // Convert to proper boolean values and filter out false values
    const validSignatures = signatures.filter(Boolean);
    
    // Consider it Next.js if we find at least one signature
    const isNextJS = validSignatures.length > 0;
    
    log(`Next.js detection result: ${isNextJS ? 'Yes' : 'No'}`, {
      validSignatures: validSignatures.length,
      totalChecks: signatures.length
    });
    
    return isNextJS;
  } catch (error) {
    console.error('[Next.js Analyzer] Detection error:', error);
    return false;
  }
}

// Detect Next.js configuration (App Router vs Pages Router)
function detectConfiguration() {
  try {
    // Check for App Router (Next.js 13+) specific patterns
    const appRouterPatterns = [
      document.querySelector('script[src*="_next/static/chunks/app"]'),
      document.querySelector('script:not([src])') && 
        document.querySelector('script:not([src])').textContent.includes('next/navigation')
    ];
    
    const hasAppRouterIndicators = appRouterPatterns.some(Boolean);
    
    // Get Next.js data if available
    let nextData = null;
    try {
      const nextDataScript = document.getElementById('__NEXT_DATA__');
      if (nextDataScript) {
        nextData = JSON.parse(nextDataScript.textContent);
      }
    } catch (e) {
      log('Error parsing __NEXT_DATA__', e);
    }
    
    // Determine features
    const features = {
      imageOptimization: !!document.querySelector('img[data-nimg]'),
      fontOptimization: !!document.querySelector('link[data-next-font]'),
      i18n: !!document.querySelector('link[rel="alternate"][hreflang]') || 
            !!document.documentElement.lang
    };
    
    return {
      router: hasAppRouterIndicators ? 'App' : 'Pages',
      buildId: nextData?.buildId || null,
      features
    };
  } catch (error) {
    log('Error detecting Next.js configuration', error);
    return { router: 'unknown', features: {} };
  }
}

// Detect page structure details
function detectPageStructure() {
  try {
    // Count different types of elements (for reference only)
    const elements = {
      'Meta Tags': document.querySelectorAll('meta').length,
      'OpenGraph Tags': document.querySelectorAll('meta[property^="og:"]').length,
      'Structured Data': document.querySelectorAll('script[type="application/ld+json"]').length,
      'Image Count': document.querySelectorAll('img').length,
      'Script Count': document.querySelectorAll('script').length,
      'Link Count': document.querySelectorAll('link').length
    };
    
    // Language/i18n check
    if (document.documentElement.lang) {
      elements['Language'] = document.documentElement.lang;
    }
    
    const configDetails = detectConfiguration();
    
    return {
      elements,
      router_type: configDetails.router
    };
  } catch (error) {
    log('Error detecting page structure', error);
    return {
      elements: {},
      router_type: 'Unknown'
    };
  }
}

/**
 * Performance Metric Collection
 */

// Get navigation timing metrics
function getNavigationTiming() {
  const navigation = performance.getEntriesByType('navigation')[0];
  if (!navigation) return null;

  return {
    ttfb: navigation.responseStart - navigation.requestStart,
    domLoad: navigation.domContentLoadedEventEnd - navigation.requestStart,
    windowLoad: navigation.loadEventEnd - navigation.requestStart
  };
}

// Get resource metrics
function getResourceMetrics() {
  const resources = performance.getEntriesByType('resource');
  const totalBytes = resources.reduce((acc, r) => acc + (r.transferSize || 0), 0);
  
  // Count JavaScript resources separately (relevant for CSR detection)
  const jsResources = resources.filter(r => 
    r.name.endsWith('.js') || 
    r.name.endsWith('.jsx') || 
    r.initiatorType === 'script'
  );
  
  const jsBytes = jsResources.reduce((acc, r) => acc + (r.transferSize || 0), 0);
  
  return {
    totalBytes,
    jsBytes,
    totalResources: resources.length,
    jsResourceCount: jsResources.length,
    slowResources: resources.filter(r => r.duration > 1000).length
  };
}

// Promise-based LCP collection
function getLCP() {
  return new Promise((resolve) => {
    let lcp = 0;
    let resolved = false;
    
    // Use Performance Observer to get LCP
    observers.lcp = new PerformanceObserver((entryList) => {
      const entries = entryList.getEntries();
      if (entries.length > 0) {
        // Get the latest LCP value
        const latestEntry = entries[entries.length - 1];
        lcp = latestEntry.startTime / 1000;  // Convert to seconds
        
        if (!resolved && document.readyState === 'complete') {
          resolved = true;
          observers.lcp.disconnect();
          resolve(lcp);
        }
      }
    });
    
    // Start observing
    observers.lcp.observe({ type: 'largest-contentful-paint', buffered: true });
    
    // Set a timeout in case LCP doesn't fire
    timeouts.lcp = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        observers.lcp.disconnect();
        
        // Fallback to navigation timing
        const timing = getNavigationTiming();
        const fallbackLCP = timing ? 
          timing.domLoad / 1000 + 0.2 : // DOM load plus a bit for rendering (in seconds)
          3.0; // Default fallback (in seconds)
        
        log(`Using fallback LCP: ${fallbackLCP}s`);
        resolve(fallbackLCP);
      }
    }, 5000);
  });
}

// Calculate speed score (0-100) with CSR adjustment
function calculateSpeedScore(resourceMetrics, routerType) {
  const resourceSizeKB = resourceMetrics.totalBytes / 1024;
  const jsResourceSizeKB = resourceMetrics.jsBytes / 1024;
  
  // Base score calculation
  let speedScore = Math.max(0, 100 - (resourceSizeKB / 50));
  
  // CSR detection - consider high JS ratio and router type
  const jsRatio = jsResourceSizeKB / (resourceSizeKB || 1); // Prevent division by zero
  const isCsrLikely = jsRatio > 0.4 || resourceMetrics.jsResourceCount > 15;
  
  // Apply penalty for likely CSR sites
  if (isCsrLikely) {
    // More significant penalty for Pages Router (which lacks RSC benefits)
    if (routerType === 'Pages') {
      speedScore = Math.max(0, speedScore - 20);
    } else {
      speedScore = Math.max(0, speedScore - 10);
    }
  }
  
  // Apply additional penalty for extremely large JS bundles
  if (jsResourceSizeKB > 1000) { // More than 1MB of JS
    speedScore = Math.max(0, speedScore - 15);
  }
  
  return Math.min(100, Math.round(speedScore));
}

// Promise-based CLS collection
function getCLS() {
  return new Promise((resolve) => {
    let clsValue = 0;
    let resolved = false;
    
    observers.cls = new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        if (!entry.hadRecentInput) {
          clsValue += entry.value;
        }
      }
    });
    
    observers.cls.observe({ type: 'layout-shift', buffered: true });
    
    // Set a timeout to resolve - reduced from 3s to 2s for better performance
    timeouts.cls = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        observers.cls.disconnect();
        resolve(clsValue);
      }
    }, 2000);
  });
}

// Promise-based INP collection
function getINP() {
  return new Promise((resolve) => {
    let inp = 0;
    let resolved = false;
    
    // Check if the browser supports the Event Timing API
    if (!window.PerformanceEventTiming) {
      log('Event Timing API not supported, using simulated INP');
      resolved = true;
      resolve(250 / 1000); // 250ms converted to seconds as a fallback value
      return;
    }
    
    // Use Performance Observer to get INP
    try {
      observers.inp = new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        
        if (entries.length > 0) {
          // INP calculation: sort by duration and pick the 98th percentile
          const sortedEntries = entries
            .filter(entry => entry.interactionId) // Only consider interaction events
            .sort((a, b) => b.duration - a.duration); // Sort by duration (descending)
          
          if (sortedEntries.length > 0) {
            // Get the 98th percentile (approximation of INP)
            const percentileIndex = Math.floor(sortedEntries.length * 0.02);
            const inpEntry = sortedEntries[Math.min(percentileIndex, sortedEntries.length - 1)];
            inp = inpEntry.duration / 1000; // Convert to seconds
            
            log(`Current INP: ${inp}s from ${sortedEntries.length} interactions`);
            
            if (!resolved && document.readyState === 'complete' && sortedEntries.length >= 5) {
              resolved = true;
              observers.inp.disconnect();
              // Ensure we never return 0 or very low values which are unrealistic
              resolve(Math.max(inp, 0.1)); // Minimum 100ms
            }
          }
        }
      });
      
      // Observe event timing entries
      observers.inp.observe({ type: 'event', buffered: true });
      
    } catch (error) {
      log('Error setting up INP observer', error);
      resolved = true;
      resolve(250 / 1000); // 250ms as a fallback
    }
    
    // Set a timeout in case we don't get enough interactions - reduced from 3s to 2s for better performance
    timeouts.inp = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        try {
          observers.inp.disconnect();
        } catch (e) {
          // Ignore error
        }
        
        log('INP timeout reached, using current value or fallback');
        // Always use a realistic fallback if we have no real measurements or the value is too low
        // Using 200ms which is a "good" value according to Google's guidelines
        resolve(Math.max(inp, 200 / 1000)); // Minimum 200ms as fallback (in seconds)
      }
    }, 2000); // 2 second timeout instead of 3s
  });
}

// Generate technical recommendations based on metrics
function generateRecommendations(metrics, pageDetails) {
  const recommendations = {
    technical: []
  };
  
  // Get resource metrics for use in multiple recommendations
  const resourceMetrics = getResourceMetrics();
  
  // Performance Score based recommendations
  if (metrics.speed_score < 60) {
    // Low performance score - provide more in-depth Next.js recommendations
    
    // Performance Recommendations for JavaScript heavy apps
    if (resourceMetrics.jsResourceCount > 10 || resourceMetrics.jsBytes > 500 * 1024) {
      recommendations.technical.push({
        title: 'Reduce JavaScript Bundle Size',
        description: `Your page loads ${Math.round(resourceMetrics.jsBytes / 1024)} KB of JavaScript across ${resourceMetrics.jsResourceCount} resources.`,
        impact: 'High',
        implementation: 'Use dynamic imports with next/dynamic, enable React.lazy() for client components, and properly configure code splitting in your Next.js config.'
      });
      
      recommendations.technical.push({
        title: 'Implement Next.js Server Components',
        description: 'Large JavaScript bundles indicate client-heavy rendering that could be optimized with Server Components.',
        impact: 'High',
        implementation: 'Convert non-interactive components to Server Components to eliminate client-side JavaScript. Use "use server" and "use client" directives effectively.'
      });
    }
    
    // Next.js caching strategies
    recommendations.technical.push({
      title: 'Optimize Next.js Data Fetching',
      description: 'Improve performance with proper data fetching strategies.',
      impact: 'High',
      implementation: 'Use getStaticProps with revalidation (ISR) for dynamic content that doesn\'t change frequently. Implement proper cache headers with next/headers. Use server actions for mutations.'
    });
    
    // For Pages Router specifically
    if (pageDetails.router_type === 'Pages') {
      recommendations.technical.push({
        title: 'Configure SWC Minifier',
        description: 'Ensure you are using Next.js built-in Rust-based SWC compiler for faster builds and optimized output.',
        impact: 'Medium',
        implementation: 'Add "swcMinify: true" to your next.config.js file to use the faster SWC minifier instead of Terser.'
      });
    }
  }
  
  // LCP Recommendations
  if (metrics.lcp > 2.5) {
    recommendations.technical.push({
      title: 'Optimize Largest Contentful Paint (LCP)',
      description: 'Your LCP is too slow which impacts perceived loading speed.',
      impact: 'High',
      implementation: 'Use next/image with priority for hero images. Implement server components for faster rendering. Add preload tags for critical resources.'
    });
    
    // Additional LCP recommendations for very slow sites
    if (metrics.lcp > 4.0) {
      recommendations.technical.push({
        title: 'Implement Next.js Font Optimization',
        description: 'Slow LCP may be affected by font loading.',
        impact: 'Medium',
        implementation: 'Use next/font with the display: swap options to prevent font blocking. Configure font loading in your _app.js or layout.js file.'
      });
    }
  }
  
  // CLS Recommendations
  if (metrics.cls > 0.1) {
    recommendations.technical.push({
      title: 'Reduce Layout Shifts',
      description: 'Your page has noticeable layout shifts during loading.',
      impact: 'Medium',
      implementation: 'Add width and height to all image elements. Use next/image to automatically reserve space. Implement proper container sizing.'
    });
  }
  
  // Next.js Router Recommendations
  if (pageDetails.router_type === 'Pages') {
    recommendations.technical.push({
      title: 'Upgrade to App Router',
      description: 'You are using the older Pages Router.',
      impact: 'Medium',
      implementation: 'App Router provides better performance through React Server Components and simplified routing. Migration guides are available in the Next.js documentation.'
    });
  } else {
    // App Router optimizations
    recommendations.technical.push({
      title: 'Optimize App Router Usage',
      description: 'Ensure your App Router implementation follows best practices.',
      impact: 'Medium',
      implementation: 'Use parallel routes for complex layouts, intercepting routes for modals, and group routes for organization without affecting URL structure.'
    });
  }
  
  // Check for image optimization
  const imgTags = document.querySelectorAll('img');
  const nonOptimizedImages = Array.from(imgTags).filter(img => !img.hasAttribute('data-nimg')).length;
  
  if (nonOptimizedImages > 2) {
    recommendations.technical.push({
      title: 'Use Next.js Image Optimization',
      description: `You have ${nonOptimizedImages} images that aren't using Next.js image optimization.`,
      impact: 'Medium',
      implementation: 'Replace <img> tags with next/image to improve loading performance and Core Web Vitals. Configure domains in next.config.js for external images.'
    });
  }
  
  // Check page size
  if (resourceMetrics.totalBytes > 1000000) { // 1MB
    recommendations.technical.push({
      title: 'Reduce Page Size',
      description: `Your page loads ${Math.round(resourceMetrics.totalBytes / 1024)} KB of resources.`,
      impact: 'High',
      implementation: 'Use next/dynamic with { ssr: false, loading: () => <Placeholder /> } for below-the-fold components. Implement proper code splitting in Next.js.'
    });
  }
  
  return recommendations;
}

/**
 * Main Analysis Function
 */
async function runAnalysis() {
  // Prevent multiple analyses
  if (isAnalyzing) {
    log('Analysis already in progress, ignoring request');
    return { success: false, error: 'Analysis already in progress' };
  }
  
  isAnalyzing = true;
  log('Starting analysis');
  
  try {
    // Clean up previous resources
    cleanup();
    
    // Report initial progress
    await sendMessage('progressUpdate', { progress: 10, message: 'Checking for Next.js...' });
    
    // 1. Check if this is a Next.js site
    const isNextJS = detectNextJS();
    if (!isNextJS) {
      log('Not a Next.js site, ending analysis');
      await sendMessage('analysisCompleted', { is_nextjs: false });
      isAnalyzing = false;
      return { success: true };
    }
    
    // 2. Detect configuration
    await sendMessage('progressUpdate', { progress: 30, message: 'Detecting configuration...' });
    const configDetails = detectConfiguration();
    
    // 3. Detect page structure
    await sendMessage('progressUpdate', { progress: 50, message: 'Analyzing page structure...' });
    const pageDetails = detectPageStructure();
    
    // 4. Collect performance metrics
    await sendMessage('progressUpdate', { progress: 70, message: 'Measuring performance...' });
    
    // Wait for LCP
    const lcp = await getLCP();
    
    // Get CLS - use shorter timeout to improve overall performance
    const cls = await getCLS();
    
    // Get INP - use shorter timeout to improve overall performance
    let inp = await getINP();
    
    // Extra safety check to ensure INP is never 0
    if (inp <= 0 || isNaN(inp)) {
      log('INP was invalid, using fallback value');
      inp = 200 / 1000; // 200ms as fallback (in seconds)
    }
    
    // Calculate speed score with CSR detection
    const resourceMetrics = getResourceMetrics();
    const speedScore = calculateSpeedScore(resourceMetrics, pageDetails.router_type);
    
    // Collect all metrics
    const metrics = {
      lcp,
      cls,
      inp,
      speed_score: speedScore
    };
    
    log('Collected metrics:', metrics);
    
    // 5. Generate recommendations
    await sendMessage('progressUpdate', { progress: 90, message: 'Generating recommendations...' });
    const recommendations = generateRecommendations(metrics, pageDetails);
    
    // 6. Build final result
    const result = {
      is_nextjs: true,
      metrics,
      config_details: configDetails,
      marketing_burden: pageDetails, // Keep this for backward compatibility
      recommendations
    };
    
    // 7. Send complete result
    log('Analysis complete, sending results');
    await sendMessage('analysisCompleted', result);
    
    // 8. Clean up and reset
    isAnalyzing = false;
    return { success: true };
    
  } catch (error) {
    console.error('[Next.js Analyzer] Analysis error:', error);
    
    // Report error
    await sendMessage('analysisError', { 
      error: error.message || 'Unknown error during analysis' 
    });
    
    // Clean up and reset
    isAnalyzing = false;
    return { success: false, error: error.message };
  }
}

/**
 * Message Listener
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  log('Received message', message);
  
  if (message.action === 'startAnalysis') {
    log('Received analysis request');
    
    // Run analysis asynchronously
    runAnalysis()
      .then(result => {
        log('Analysis finished', result);
        sendResponse(result);
      })
      .catch(error => {
        console.error('[Next.js Analyzer - Content] Analysis failed:', error);
        sendResponse({ success: false, error: error.message || 'Unknown error during analysis' });
      });
    
    // Return true to indicate we'll send a response asynchronously
    return true;
  } else if (message.action === 'ping') {
    // Simple ping to check if content script is loaded
    log('Received ping');
    sendResponse({ status: 'alive', timestamp: Date.now() });
    return false;
  }
  
  // For other messages, send a response immediately
  sendResponse({ received: true, action: message.action });
  return false;
});

// Log that we're ready
log('Content script loaded and ready for analysis requests'); 