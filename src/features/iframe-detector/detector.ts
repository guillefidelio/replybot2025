import { IFRAME_CONFIG, type IframeConfig } from './central_config';
import { showOverlay, removeOverlay } from './overlay';
import { injectButtonWithRetry, removeAIButton } from './injector';

type ConfigEntry = IframeConfig[keyof IframeConfig];

let lastUrl = '';
let isInjectionInProgress = false;
const POLLING_INTERVAL = 500; // ms
const MIN_DELAY_AFTER_URL_CHANGE = 1000; // 1 second minimum delay

async function handleDetection(currentUrl: string): Promise<void> {
  if (isInjectionInProgress) {
    console.log('[IframeDetector] Injection already in progress. Skipping new detection.');
    return;
  }

  const detectionResult = detectIframeType(currentUrl);

  // Always remove the button first to handle navigation away from an injectable page
  removeAIButton();

  if (detectionResult) {
    const { key, config } = detectionResult;
    const message = config.overlayMessage || `${config.host} Iframe Detected`;
    showOverlay(message);

    if (config.injectButton) {
      isInjectionInProgress = true;
      console.log('[IframeDetector] Lock acquired. Starting injection process.');
      try {
        await injectButtonWithRetry(config, key);
      } finally {
        isInjectionInProgress = false;
        console.log('[IframeDetector] Injection process finished. Lock released.');
      }
    }
  } else {
    if (currentUrl.includes('google.com/')) {
        showOverlay('No Specific Iframe Detected');
    } else {
        removeOverlay();
    }
  }
}

export function detectIframeType(url: string): { key: string; config: ConfigEntry } | null {
  console.log(`[IframeDetector] Analyzing URL: ${url}`);
  const currentHost = new URL(url).hostname;
  
  // Get the keys and sort them by priority so we check the most specific rules first.
  const orderedKeys = Object.keys(IFRAME_CONFIG).sort((a, b) => {
    const priorityA = IFRAME_CONFIG[a as keyof typeof IFRAME_CONFIG].priority;
    const priorityB = IFRAME_CONFIG[b as keyof typeof IFRAME_CONFIG].priority;
    return priorityB - priorityA;
  });

  for (const key of orderedKeys) {
    const config = IFRAME_CONFIG[key as keyof typeof IFRAME_CONFIG];
    
    // Quick filter by host to avoid unnecessary checks
    if (!currentHost.includes(config.host)) {
      continue;
    }

    const hasUrlPattern = url.includes(config.urlPattern);
    const hasExcludePattern = config.excludePattern && url.includes(config.excludePattern);

    if (hasUrlPattern && !hasExcludePattern) {
      console.log(`[IframeDetector] SUCCESS: Matched rule "${key}"`);
      return { key, config };
    }
  }

  console.log(`[IframeDetector] FAILED: No matching rule found.`);
  return null;
}

async function pollForUrlChanges() {
  const currentUrl = window.location.href;
  if (currentUrl !== lastUrl) {
    console.log(`[IframeDetector] URL changed from ${lastUrl} to ${currentUrl}`);
    lastUrl = currentUrl;
    
    // Add a minimum delay to let the new content load before attempting injection
    console.log(`[IframeDetector] Waiting ${MIN_DELAY_AFTER_URL_CHANGE}ms for content to load...`);
    await new Promise(resolve => setTimeout(resolve, MIN_DELAY_AFTER_URL_CHANGE));
    
    // Await the handler to ensure one process completes before another can start.
    await handleDetection(currentUrl);
  }
  // Schedule the next check, creating a continuous async-aware loop.
  setTimeout(pollForUrlChanges, POLLING_INTERVAL);
}

export function initializeDetector() {
  console.log('[IframeDetector] Initializing URL polling detector...');
  
  // Use an async IIFE to handle the initial check properly.
  (async () => {
    lastUrl = window.location.href;
    await handleDetection(lastUrl); // Initial check

    // Start the polling loop
    setTimeout(pollForUrlChanges, POLLING_INTERVAL);
  })();

  console.log('[IframeDetector] Detector initialized and polling.');
} 