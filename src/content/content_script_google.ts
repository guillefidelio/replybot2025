/**
 * This content script is dedicated to running on google.com pages.
 * Its sole purpose is to initialize the page manager.
 */
import { pageManager } from '../features/iframe-detector/page_manager';

console.log('[ContentScript-Google] Loaded. Page manager initialized automatically.');

// The page manager initializes itself in its constructor, so no need to call initialize()
// Just ensure it's imported and the singleton is created

// Clean up on page unload
window.addEventListener('beforeunload', () => {
  pageManager.destroy();
}); 