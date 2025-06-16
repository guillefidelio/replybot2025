let overlayElement: HTMLElement | null = null;
export const OVERLAY_ID = 'chrome-extension-iframe-detector-overlay';

// Extract the style from the config, or use a default
const OVERLAY_STYLE = {
  position: 'fixed',
  top: '10px',
  right: '10px',
  backgroundColor: 'rgba(255, 99, 71, 0.85)',
  color: 'white',
  padding: '10px 20px',
  borderRadius: '8px',
  zIndex: '99999',
  fontFamily: 'Arial, sans-serif',
  fontSize: '14px',
  fontWeight: 'bold',
  boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
  transition: 'opacity 0.3s ease-in-out',
};

/**
 * Creates and displays the overlay with a specific message.
 * If the overlay already exists, it updates the message.
 * @param {string} message - The message to display.
 */
export function showOverlay(message: string) {
  // Check if the element exists in the DOM from a previous render
  if (!overlayElement) {
    overlayElement = document.getElementById(OVERLAY_ID);
  }

  // If it still doesn't exist, create it
  if (!overlayElement) {
    overlayElement = document.createElement('div');
    overlayElement.id = OVERLAY_ID;
    Object.assign(overlayElement.style, OVERLAY_STYLE);
    document.body.appendChild(overlayElement);
  }

  overlayElement.textContent = message;
  overlayElement.style.opacity = '1';
}

/**
 * Removes the overlay from the DOM.
 */
export function removeOverlay() {
  overlayElement = document.getElementById(OVERLAY_ID);
  if (overlayElement && overlayElement.parentNode) {
    overlayElement.style.opacity = '0';
    // Allow fade-out transition before removing
    setTimeout(() => {
        if(overlayElement && overlayElement.parentNode) {
            overlayElement.parentNode.removeChild(overlayElement);
            overlayElement = null;
        }
    }, 300);
  }
} 