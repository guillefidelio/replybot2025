# Development Guide - AI Review Responder Chrome Extension

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Build the extension:**
   ```bash
   npm run build:extension
   ```

3. **Load extension in Chrome:**
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked" and select the `dist` folder

## Development Workflow

### Hot Reloading Development

1. **Start development mode with auto-rebuild:**
   ```bash
   npm run dev:extension
   ```
   This will:
   - Watch for file changes and automatically rebuild
   - Show notifications when files are updated
   - You'll need to manually reload the extension in Chrome

2. **Manual reload process:**
   - After changes are built, go to `chrome://extensions/`
   - Click the refresh icon on the AI Review Responder extension
   - Refresh any Google My Business tabs to see content script changes

### Available Scripts

- `npm run dev:extension` - Development mode with file watching
- `npm run build:extension` - Build extension for production
- `npm run build:watch` - Build and watch for changes
- `npm run pack:extension` - Create ZIP package for Chrome Web Store
- `npm run clean` - Clean dist directory

## Testing the Extension

1. **Content Script Testing:**
   - Navigate to `https://business.google.com/reviews`
   - Look for "🤖 Respond with AI" buttons next to reviews
   - Check browser console for debug messages

2. **Popup Testing:**
   - Click the extension icon in Chrome toolbar
   - Verify popup opens with settings interface

3. **Background Script Testing:**
   - Check `chrome://extensions/` → AI Review Responder → "service worker"
   - Monitor console for background script messages

## File Structure

```
src/
├── background/     # Service worker scripts
├── content/        # Content scripts for page injection
├── popup/          # Popup interface components
├── components/     # Reusable React components
├── services/       # API and utility services
├── utils/          # Helper functions
└── types/          # TypeScript type definitions
```

## Development Tips

1. **Chrome DevTools:** Use F12 to inspect content script behavior on Google My Business pages
2. **Extension DevTools:** Go to `chrome://extensions/` and click "service worker" to debug background scripts
3. **Storage Inspection:** Use `chrome://extensions/` → Details → Storage to view extension storage
4. **Manifest Changes:** Require extension reload in Chrome
5. **Content Script Changes:** Require page refresh after extension reload

## Troubleshooting

- **Extension not loading:** Check manifest.json syntax and permissions
- **Content script not injecting:** Verify page URL matches manifest patterns
- **Build errors:** Check TypeScript compilation and dependency issues
- **Hot reload not working:** Restart `npm run dev:extension` 