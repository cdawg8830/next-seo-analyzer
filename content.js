// Ensure we're not running multiple instances
if (window.__nextAnalyzerCleanup) {
  window.__nextAnalyzerCleanup();
}

// Create a unique instance ID for this analysis
const instanceId = Date.now().toString(36) + Math.random().toString(36).substr(2);
console.log('[Next.js Analyzer] Starting new instance:', instanceId);

// Store cleanup function
window.__nextAnalyzerCleanup = () => {
  console.log('[Next.js Analyzer] Cleaning up instance:', instanceId);
  // Disconnect all observers
  Object.values(observers).forEach(observer => observer.disconnect());
  // Clear all timeouts
  Object.values(timeouts).forEach(timeout => clearTimeout(timeout));
  // Reset running flag
  window.__nextAnalyzerRunning = false;
};

// Store all observers and timeouts for cleanup
const observers = {};
const timeouts = {};

// This script runs in the context of web pages
async function getLCP() {
  return new Promise(resolve => {
    let serverLCP = 0;
    let resolved = false;
    let entries = [];

    // Immediately capture the current DOM state
    const initialElements = Array.from(document.querySelectorAll('img, video, h1, h2, div'))
      .filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight;
      });

    observers.lcp = new PerformanceObserver((list) => {
      const newEntries = list.getEntries();
      entries = entries.concat(newEntries);

      // Only consider entries that happened before any client-side updates
      const validEntries = entries.filter(entry => {
        // Filter out entries that are clearly post-hydration
        return !entry.element?.hasAttribute('data-mounted') && 
               !entry.element?.closest('[data-mounted]') &&
               entry.startTime < 5000; // Focus on early LCP candidates
      });

      if (validEntries.length > 0) {
        const maxServerLCP = Math.max(...validEntries.map(e => e.startTime));
        serverLCP = Math.max(serverLCP, maxServerLCP);
      }
    });

    observers.lcp.observe({ entryTypes: ['largest-contentful-paint'] });

    // Use a shorter timeout to focus on server-rendered content
    timeouts.lcp = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        observers.lcp.disconnect();

        if (serverLCP > 0) {
          console.log(`[Next.js Analyzer] Server LCP: ${serverLCP}ms`);
          resolve(serverLCP);
        } else {
          // Fallback to navigation timing focusing on server metrics
          const timing = getNavigationTiming();
          const fallbackLCP = timing ? 
            Math.max(
              timing.ttfb + 500, // TTFB plus minimal rendering time
              timing.domLoad     // DOM content loaded
            ) : 4000;
          
          console.log(`[Next.js Analyzer] Using fallback Server LCP: ${fallbackLCP}ms`);
          resolve(fallbackLCP);
        }
      }
    }, 5000); // Shorter timeout since we only care about initial render
  });
}

async function getFID() {
  return new Promise(resolve => {
    let fid = 0;
    let resolved = false;

    observers.fid = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      // Take the first FID value we get
      if (entries.length > 0 && !resolved) {
        fid = entries[0].processingStart - entries[0].startTime;
        resolved = true;
        observers.fid.disconnect();
        resolve(fid);
      }
    });

    observers.fid.observe({ entryTypes: ['first-input'] });

    // Wait longer for FID
    timeouts.fid = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        observers.fid.disconnect();
        resolve(100); // More realistic default
      }
    }, 5000);
  });
}

async function getCLS() {
  return new Promise(resolve => {
    let clsValue = 0;
    let resolved = false;
    let sessionEntries = [];

    observers.cls = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) {
          sessionEntries.push(entry);
          // Calculate session windows
          let sessionValues = [];
          let currentSession = { value: 0, startTime: 0 };

          sessionEntries.forEach(entry => {
            if (entry.startTime - currentSession.startTime > 5000 || entry.startTime < currentSession.startTime) {
              if (currentSession.value > 0) {
                sessionValues.push(currentSession.value);
              }
              currentSession = { value: entry.value, startTime: entry.startTime };
            } else {
              currentSession.value += entry.value;
            }
          });
          sessionValues.push(currentSession.value);
          
          // Use max session value
          clsValue = Math.max(...sessionValues);
        }
      }
    });

    observers.cls.observe({ entryTypes: ['layout-shift'] });

    // Wait longer to collect CLS
    timeouts.cls = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        observers.cls.disconnect();
        resolve(clsValue || 0.1); // More realistic default
      }
    }, 5000);
  });
}

// Helper function to safely send messages
async function sendMessage(type, data) {
  try {
    await chrome.runtime.sendMessage({ 
      type, 
      data,
      instanceId // Include instance ID in messages
    });
    console.log(`[Next.js Analyzer] Instance ${instanceId} sent ${type} message`);
  } catch (error) {
    // Ignore "receiving end does not exist" errors as they're expected when popup is closed
    if (!error.message.includes('receiving end does not exist')) {
      console.warn(`[Next.js Analyzer] Instance ${instanceId} failed to send ${type} message:`, error);
    }
  }
}

// Helper function to get navigation timing metrics
function getNavigationTiming() {
  const navigation = performance.getEntriesByType('navigation')[0];
  if (!navigation) return null;

  return {
    ttfb: navigation.responseStart - navigation.requestStart,
    domLoad: navigation.domContentLoadedEventEnd - navigation.requestStart,
    windowLoad: navigation.loadEventEnd - navigation.requestStart
  };
}

// Get all resource sizes
function getResourceMetrics() {
  const resources = performance.getEntriesByType('resource');
  const totalBytes = resources.reduce((acc, r) => acc + (r.transferSize || 0), 0);
  const totalResources = resources.length;
  const slowResources = resources.filter(r => r.duration > 1000).length;
  
  return {
    totalBytes,
    totalResources,
    slowResources
  };
}

async function analyzeNextJS() {
  try {
    console.log(`[Next.js Analyzer] Instance ${instanceId} starting analysis`);
    await sendMessage('ANALYSIS_PROGRESS', { progress: 0, message: 'Starting analysis...' });

    // Basic Next.js detection
    const nextData = document.getElementById('__NEXT_DATA__');
    const nextScripts = Array.from(document.querySelectorAll('script[src*="/_next/"]'));
    const nextMeta = document.querySelector('meta[name="next-head-count"]');
    const nextImage = document.querySelector('img[src*="/_next/image"]');
    const nextDataNimg = document.querySelector('img[data-nimg]');

    const isNextJS = !!(nextData || nextScripts.length > 0 || nextMeta || nextImage || nextDataNimg);
    console.log(`[Next.js Analyzer] Instance ${instanceId} isNextJS:`, isNextJS);

    // Send initial progress
    await sendMessage('ANALYSIS_PROGRESS', { progress: 10, message: 'Detecting Next.js...' });

    // If not Next.js, return early
    if (!isNextJS) {
      console.log(`[Next.js Analyzer] Instance ${instanceId} Not a Next.js site, completing early`);
      await sendMessage('ANALYSIS_COMPLETE', { isNextJS: false });
      return;
    }

    // Feature Detection
    const features = {
      hasAppDir: nextScripts.some(s => s.src.includes('/app/')),
      hasPagesDir: nextScripts.some(s => s.src.includes('/pages/')),
      usesImageOptimization: !!(nextImage || nextDataNimg),
      usesFontOptimization: !!document.querySelector('link[data-next-font]'),
      usesServerComponents: !!document.querySelector('[data-rsc]'),
      usesClientComponents: Array.from(document.querySelectorAll('script:not([src])'))
        .some(s => s.textContent.includes('"use client"'))
    };
    console.log(`[Next.js Analyzer] Instance ${instanceId} Features detected:`, features);

    // Send progress update
    await sendMessage('ANALYSIS_PROGRESS', { progress: 30, message: 'Analyzing features...' });

    // Run performance metrics with a global timeout
    console.log(`[Next.js Analyzer] Instance ${instanceId} Starting performance metrics collection`);
    await sendMessage('ANALYSIS_PROGRESS', { progress: 50, message: 'Collecting performance metrics...' });

    let metrics;
    try {
      // Collect metrics in parallel with individual timeouts
      const metricsPromises = {
        lcp: Promise.race([
          getLCP(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('LCP timeout')), 8000))
        ]).catch(err => {
          console.warn(`[Next.js Analyzer] Instance ${instanceId} LCP collection error:`, err);
          const timing = getNavigationTiming();
          return timing ? timing.domLoad : 15000;
        }),

        fid: Promise.race([
          getFID(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('FID timeout')), 8000))
        ]).catch(err => {
          console.warn(`[Next.js Analyzer] Instance ${instanceId} FID collection error:`, err);
          return 300;
        }),

        cls: Promise.race([
          getCLS(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('CLS timeout')), 8000))
        ]).catch(err => {
          console.warn(`[Next.js Analyzer] Instance ${instanceId} CLS collection error:`, err);
          return 0.7;
        })
      };

      // Wait for all metrics with progress updates
      const [lcp, fid, cls] = await Promise.all([
        metricsPromises.lcp.then(value => {
          sendMessage('ANALYSIS_PROGRESS', { progress: 60, message: 'LCP collected...' });
          return value;
        }),
        metricsPromises.fid.then(value => {
          sendMessage('ANALYSIS_PROGRESS', { progress: 70, message: 'FID collected...' });
          return value;
        }),
        metricsPromises.cls.then(value => {
          sendMessage('ANALYSIS_PROGRESS', { progress: 80, message: 'CLS collected...' });
          return value;
        })
      ]);
      
      const navTiming = getNavigationTiming();
      const resourceMetrics = getResourceMetrics();
      
      console.log(`[Next.js Analyzer] Instance ${instanceId} Metrics collected:`, { 
        lcp, fid, cls, 
        navTiming,
        resourceMetrics
      });
      
      // Calculate performance score similar to Lighthouse
      const performanceScore = (() => {
        const weights = {
          lcp: 0.35,  // Increased weight for LCP
          fid: 0.15,  // Reduced FID weight
          cls: 0.25,
          ttfb: 0.15,
          resources: 0.10
        };

        // More strict scoring curves aligned with Lighthouse
        const scores = {
          lcp: Math.max(0, Math.min(100, 100 - Math.pow(lcp / 2500, 2) * 100)),
          fid: Math.max(0, Math.min(100, 100 - Math.pow(fid / 100, 2) * 100)),
          cls: Math.max(0, Math.min(100, 100 - Math.pow(cls / 0.1, 2) * 100)),
          ttfb: navTiming ? Math.max(0, Math.min(100, 100 - Math.pow(navTiming.ttfb / 600, 2) * 100)) : 50,
          resources: Math.max(0, Math.min(100, 100 - (resourceMetrics.totalBytes / 1500000) * 100))
        };

        return Math.round(
          scores.lcp * weights.lcp +
          scores.fid * weights.fid +
          scores.cls * weights.cls +
          scores.ttfb * weights.ttfb +
          scores.resources * weights.resources
        );
      })();
      
      metrics = {
        LCP: { value: lcp, threshold: 2500 },
        FID: { value: fid, threshold: 100 },
        CLS: { value: cls, threshold: 0.1 },
        Speed: {
          value: performanceScore,
          threshold: 80,
          details: {
            ttfb: navTiming?.ttfb,
            domLoad: navTiming?.domLoad,
            windowLoad: navTiming?.windowLoad,
            totalBytes: resourceMetrics.totalBytes,
            totalResources: resourceMetrics.totalResources,
            slowResources: resourceMetrics.slowResources
          }
        }
      };
    } catch (e) {
      console.warn(`[Next.js Analyzer] Instance ${instanceId} Metrics collection error:`, e);
      // Use navigation timing to get more accurate fallback values
      const timing = getNavigationTiming();
      metrics = {
        LCP: { value: timing ? timing.domLoad : 15000, threshold: 2500 },
        FID: { value: 300, threshold: 100 },
        CLS: { value: 0.7, threshold: 0.1 },
        Speed: { value: 1, threshold: 80 }
      };
    }

    // Send progress update
    await sendMessage('ANALYSIS_PROGRESS', { progress: 80, message: 'Generating recommendations...' });

    // Generate Recommendations
    const recommendations = [];

    // Technical Recommendations
    if (metrics.LCP.value > metrics.LCP.threshold) {
      recommendations.push({
        recommendation: 'Optimize Largest Contentful Paint',
        impact: 'high',
        metric: 'LCP',
        currentValue: metrics.LCP.value,
        threshold: metrics.LCP.threshold,
        implementation: 'Use next/image with priority prop for above-the-fold images',
        type: 'technical'
      });
    }

    if (metrics.FID.value > metrics.FID.threshold) {
      recommendations.push({
        recommendation: 'Improve First Input Delay',
        impact: 'high',
        metric: 'FID',
        currentValue: metrics.FID.value,
        threshold: metrics.FID.threshold,
        implementation: 'Use next/dynamic for heavy components and optimize third-party scripts',
        type: 'technical'
      });
    }

    if (metrics.CLS.value > metrics.CLS.threshold) {
      recommendations.push({
        recommendation: 'Reduce Layout Shifts',
        impact: 'high',
        metric: 'CLS',
        currentValue: metrics.CLS.value,
        threshold: metrics.CLS.threshold,
        implementation: 'Add width/height to images and use next/image component',
        type: 'technical'
      });
    }

    if (!features.usesImageOptimization) {
      recommendations.push({
        recommendation: 'Enable Image Optimization',
        impact: 'high',
        metric: 'Next.js Optimization',
        implementation: 'Replace <img> tags with next/image components',
        type: 'technical'
      });
    }

    if (!features.usesFontOptimization) {
      recommendations.push({
        recommendation: 'Enable Font Optimization',
        impact: 'medium',
        metric: 'Next.js Optimization',
        implementation: 'Use next/font for automatic font optimization',
        type: 'technical'
      });
    }

    // Marketing Recommendations
    recommendations.push({
      recommendation: 'Update Page Titles and Meta Data',
      impact: 'high',
      metric: 'Marketing',
      implementation: 'Make titles and descriptions more actionable to increase CTR',
      type: 'marketing'
    });

    recommendations.push({
      recommendation: 'Ensure Proper Redirects',
      impact: 'medium',
      metric: 'Marketing',
      implementation: 'Implement proper redirects to maintain crawl budget and spread authority',
      type: 'marketing'
    });

    recommendations.push({
      recommendation: 'Optimize Robots.txt',
      impact: 'medium',
      metric: 'Marketing',
      implementation: 'Update robots.txt with correct rules for optimal crawling',
      type: 'marketing'
    });

    // Sort recommendations: technical high impact first, then marketing
    recommendations.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'technical' ? -1 : 1;
      }
      return b.impact === 'high' ? 1 : a.impact === 'high' ? -1 : 0;
    });

    console.log(`[Next.js Analyzer] Instance ${instanceId} Analysis complete, sending results`);
    
    // Send final progress update
    await sendMessage('ANALYSIS_PROGRESS', { progress: 100, message: 'Analysis complete!' });

    // Send Analysis Results
    await sendMessage('ANALYSIS_COMPLETE', {
      isNextJS: true,
      url: window.location.href,
      features,
      metrics,
      recommendations: recommendations.sort((a, b) => 
        b.impact === 'high' ? 1 : a.impact === 'high' ? -1 : 0
      )
    });

  } catch (error) {
    console.error(`[Next.js Analyzer] Instance ${instanceId} Analysis error:`, error);
    await sendMessage('ANALYSIS_ERROR', { error: error.message });
  } finally {
    // Clean up this instance if it fails
    if (window.__nextAnalyzerCleanup) {
      window.__nextAnalyzerCleanup();
    }
  }
}

// Run analysis when page loads with retry mechanism and delay
let retryCount = 0;
const MAX_RETRIES = 3;

async function runAnalysis() {
  if (retryCount >= MAX_RETRIES) {
    console.error(`[Next.js Analyzer] Instance ${instanceId} max retries reached`);
    await sendMessage('ANALYSIS_ERROR', { error: 'Analysis failed after multiple attempts' });
    return;
  }

  console.log(`[Next.js Analyzer] Instance ${instanceId} attempt ${retryCount + 1} of ${MAX_RETRIES}`);
  setTimeout(async () => {
    try {
      await analyzeNextJS();
    } catch (e) {
      console.warn(`[Next.js Analyzer] Instance ${instanceId} analysis attempt failed:`, e);
      retryCount++;
      await runAnalysis();
    }
  }, 2000 + (retryCount * 1000)); // Increasing delay between retries
}

// Wait for page to be fully loaded before starting analysis
if (document.readyState === 'complete') {
  runAnalysis();
} else {
  window.addEventListener('load', () => {
    setTimeout(runAnalysis, 1000); // Add a small delay after load
  });
}

// Watch for route changes in SPA with debouncing
let lastUrl = location.href;
let routeChangeTimeout;

new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    clearTimeout(routeChangeTimeout);
    routeChangeTimeout = setTimeout(() => {
      console.log(`[Next.js Analyzer] Instance ${instanceId} Route change detected, rerunning analysis`);
      retryCount = 0; // Reset retry count for new route
      runAnalysis();
    }, 1000);
  }
}).observe(document, { subtree: true, childList: true });

// Cleanup when the script is about to be reinjected
window.addEventListener('beforeunload', () => {
  if (window.__nextAnalyzerCleanup) {
    window.__nextAnalyzerCleanup();
  }
}); 