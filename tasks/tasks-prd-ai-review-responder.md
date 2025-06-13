# Task List: AI Review Responder Chrome Extension

Based on PRD: `prd-ai-review-responder.md`

## Relevant Files

- `package.json` - Project dependencies and scripts configuration (✓ Created)
- `vite.config.ts` - Vite build configuration for Chrome extension development (✓ Created)
- `tsconfig.json` - TypeScript configuration for the project (✓ Created)
- `tsconfig.app.json` - TypeScript configuration for application code (✓ Created)
- `tsconfig.node.json` - TypeScript configuration for Node.js environment (✓ Created)
- `index.html` - Main HTML entry point for development (✓ Created)
- `src/main.tsx` - Main React application entry point (✓ Created)
- `src/App.tsx` - Main React application component (✓ Created)
- `src/index.css` - Main CSS file with Tailwind directives and Chrome extension specific styles (✓ Configured)
- `tailwind.config.js` - Tailwind CSS configuration with Chrome extension optimizations (✓ Created)
- `postcss.config.js` - PostCSS configuration for Tailwind CSS processing (✓ Created)
- `manifest.json` - Chrome extension manifest (Manifest V3) with Google Cloud Function permissions (✓ Updated for secure backend)
- `icons/icon.svg` - Extension icon in SVG format (✓ Created)
- `src/popup/popup.html` - Basic popup HTML structure for extension settings (✓ Created)
- `src/popup/popup.tsx` - React popup component with Google Cloud Function status indicators (✓ Updated for secure backend)
- `src/background/background.ts` - Background service worker for API communications via Google Cloud Function proxy (✓ Updated with OpenAI API integration)
- `src/content/content.ts` - Main content script with trust modes and bulk processing capabilities (✓ Updated with advanced automation features)
- `package.json` - Updated with Chrome extension build scripts and dependencies (✓ Configured)
- `DEVELOPMENT.md` - Development guide with setup and workflow instructions (✓ Created)
- `.vscode/extensions.json` - VSCode workspace configuration with recommended extensions (✓ Created)
- `jest.config.cjs` - Jest testing framework configuration with Chrome extension mocks (✓ Created)
- `src/setupTests.ts` - Jest setup file with Chrome API mocks and testing utilities (✓ Created)
- `src/types/review.ts` - TypeScript interfaces for review data structures (✓ Created)
- `src/types/prompt.ts` - TypeScript interfaces for prompt management system (✓ Created)
- `src/types/extension.ts` - TypeScript interfaces for extension configuration and state (✓ Created)
- `src/background/background.test.ts` - Unit tests for background script.
- `src/popup/popup.tsx` - Main popup component for extension settings and prompt management.
- `src/popup/popup.test.tsx` - Unit tests for popup component.
- `src/components/AIResponseButton.tsx` - React component for "Respond with AI" buttons injected into pages.
- `src/components/AIResponseButton.test.tsx` - Unit tests for AI response button component.
- `src/components/PromptManager.tsx` - React component for managing custom prompts.
- `src/components/PromptManager.test.tsx` - Unit tests for prompt manager component.
- `src/components/BulkProcessor.tsx` - React component for bulk processing interface.
- `src/components/BulkProcessor.test.tsx` - Unit tests for bulk processor component.
- `src/services/gemini-api.ts` - Service layer for Gemini API integration and response generation (✓ Created)
- `src/services/gemini-api.test.ts` - Unit tests for Gemini API service.
- `src/services/storage.ts` - Chrome extension storage utilities for prompts and settings.
- `src/services/storage.test.ts` - Unit tests for storage service.
- `src/services/review-processor.ts` - Service for processing and formatting review data for AI prompts (✓ Created)
- `src/services/error-handler.ts` - Error handling service with fallback mechanisms for API unavailability (✓ Created)
- `src/services/response-validator.ts` - Response validation service for professional tone and content checking (✓ Created)
- `src/services/review-detector.ts` - Service for detecting and parsing review elements on GMB pages.
- `src/services/review-detector.test.ts` - Unit tests for review detection service.
- `src/utils/dom-utils.ts` - Utility functions for DOM manipulation and element injection.
- `src/utils/dom-utils.test.ts` - Unit tests for DOM utilities.
- `src/utils/rate-limiter.ts` - Utility for implementing rate limiting in bulk operations.
- `src/utils/rate-limiter.test.ts` - Unit tests for rate limiter utility.
- `src/types/review.ts` - TypeScript interfaces and types for review data structures.
- `src/types/prompt.ts` - TypeScript interfaces for prompt management system.
- `src/types/extension.ts` - TypeScript interfaces for extension configuration and state.
- `openai-proxy-function/package.json` - Google Cloud Function dependencies and deployment configuration (✓ Created)
- `openai-proxy-function/index.js` - Secure OpenAI API proxy with Secret Manager integration (✓ Created and deployed)

### Notes

- Unit tests should typically be placed alongside the code files they are testing (e.g., `MyComponent.tsx` and `MyComponent.test.tsx` in the same directory).
- Use `npx jest [optional/path/to/test/file]` to run tests. Running without a path executes all tests found by the Jest configuration.
- Chrome extension content scripts and background scripts require special consideration for testing due to browser API dependencies.

## Tasks

- [x] 1.0 Project Setup and Chrome Extension Infrastructure
  - [x] 1.1 Initialize Vite project with React and TypeScript templates
  - [x] 1.2 Configure Tailwind CSS for Chrome extension environment
  - [x] 1.3 Create Manifest V3 configuration with required permissions (activeTab, storage, scripting)
  - [x] 1.4 Set up build scripts for Chrome extension packaging (content scripts, background, popup)
  - [x] 1.5 Configure development environment with hot reloading for extension development
  - [x] 1.6 Set up Jest testing framework with Chrome extension mocks
  - [x] 1.7 Create project directory structure (src/content, src/background, src/popup, src/components, src/services, src/utils, src/types)
  - [x] 1.8 Initialize package.json with required dependencies (React, TypeScript, Tailwind, Vite, Jest)

- [x] 2.0 Review Detection and UI Injection System
  - [x] 2.1 Create content script to detect Google My Business review pages (business.google.com/reviews and groups URLs)
  - [x] 2.2 Implement review element detection logic to identify individual review containers
  - [x] 2.3 Build review data extraction service to parse star ratings, text content, and reviewer information
  - [x] 2.4 Create DOM utilities for safely injecting "Respond with AI" buttons next to existing response buttons
  - [x] 2.5 Implement review state detection to distinguish between answered and unanswered reviews
  - [x] 2.6 Add error handling for different Google My Business page layouts and edge cases
  - [x] 2.7 Create observer pattern to handle dynamically loaded review content
  - [x] 2.8 Implement button styling to match Google My Business interface design patterns

- [x] 3.0 AI Response Generation with Gemini API Integration
  - [x] 3.1 Create Gemini API client service with proper authentication and error handling
  - [x] 3.2 Implement background script for secure API key storage and API communications
  - [x] 3.3 Build review data processing pipeline to format review information for AI prompts
  - [x] 3.4 Create response generation logic that combines user prompts with review context
  - [x] 3.5 Implement API error handling and fallback mechanisms for service unavailability
  - [x] 3.6 Add response validation to ensure professional tone and appropriate content
  - [x] 3.7 Create messaging system between content script and background script for API calls
  - [x] 3.8 Implement loading states and progress indicators during AI response generation

- [x] 4.0 Prompt Management System and Settings Interface
  - [x] 4.1 Create popup interface using React with settings and prompt management sections
  - [x] 4.2 Build prompt CRUD operations (Create, Read, Update, Delete) with local storage
  - [x] 4.3 Implement prompt categorization system based on review scores (1-5 stars)
  - [x] 4.4 Create separate prompt handling for reviews with text vs. reviews without text
  - [x] 4.5 Design default prompt templates for immediate usability across different review types
  - [x] 4.6 Implement data export/import functionality for prompt backup and restoration
  - [x] 4.7 Add storage quota management and graceful handling of storage limits
  - [x] 4.8 Create user-friendly form validation and error messaging for prompt editing
  - [x] 4.9 Implement API key management interface with secure storage

  Got it. Here is the implementation plan with the task numbering starting from 5.

[x] 5.0 Backend: Secure OpenAI API Proxy 🔐
  [x] 5.1 Set Up Google Cloud Environment
    [x] 5.1.1 Create a new project in the Google Cloud Console.
    [x] 5.1.2 Enable the Cloud Functions API, Cloud Build API, and Secret Manager API for your project.
    [x] 5.1.3 Install and initialize the gcloud command-line tool on your local machine.
    [x] 5.1.4 Authenticate the gcloud CLI with your Google Cloud account using gcloud auth login.
  [x] 5.2 Create and Secure the API Key
    [x] 5.2.1 In the Secret Manager, create a new secret named openai-api-key.
    [x] 5.2.2 Add a new version to the secret with your actual OpenAI API key as the value.
    [x] 5.2.3 Note the full resource ID of the secret for later use.
  [x] 5.3 Develop the Cloud Function
    [x] 5.3.1 Create a new directory for your function (e.g., openai-proxy-function).
    [x] 5.3.2 Inside the directory, create a package.json file specifying a Node.js runtime and any dependencies (like @google-cloud/secret-manager).
    [x] 5.3.3 Create an index.js file for the function's code.
    [x] 5.3.4 Write the Node.js function to:
        Accept a POST request containing the user's prompt.
        Fetch the OpenAI API key from Secret Manager at runtime.
        Make a fetch call to the OpenAI API, forwarding the prompt and attaching the API key.
        Return OpenAI's response back to the caller (the Chrome extension).
    [x] 5.3.5 Implement CORS (Cross-Origin Resource Sharing) in the function's response headers to allow requests from your Chrome extension's ID (chrome-extension://YOUR_EXTENSION_ID).
  [x] 5.4 Deploy and Test the Cloud Function
    [x] 5.4.1 Deploy the function using the gcloud functions deploy command, specifying Node.js as the runtime, allowing unauthenticated invocations, and passing the secret as an environment variable.
    [x] 5.4.2 Once deployed, test the function's trigger URL using a tool like Postman or curl to ensure it correctly proxies requests.


[x] 6.0 Frontend: Chrome Extension Integration 🔌
[x] 6.1 Configure Extension Manifest

[x] 6.1.1 Open your extension's manifest.json file.
[x] 6.1.2 Add the trigger URL of your deployed Google Cloud Function to the host_permissions array.
[x] 6.1.3 Ensure the storage permission is included for saving settings and prompts.
[x] 6.2 Update API Service Logic

[x] 6.2.1 Locate the JavaScript file in your extension responsible for making API calls.
[x] 6.2.2 Modify the fetch request to target your Google Cloud Function's URL instead of the direct OpenAI API endpoint.
[x] 6.2.3 Ensure the request body sends the prompt in the format expected by your Cloud Function.
[x] 6.2.4 Remove any logic that handles a locally stored API key for making the OpenAI call.
[x] 6.3 Implement Frontend UI/UX for API Status

[x] 6.3.1 Create a visual indicator in the UI to show the status of the backend connection (e.g., "Connected", "Error").
[x] 6.3.2 Implement robust loading indicators that appear while waiting for a response from the proxy.
[x] 6.3.3 Add user-friendly error handling to display messages if the Cloud Function call fails or returns an error.

- [x] 7.0 Trust Modes and Bulk Processing Features
  - [x] 7.1 Create preview mode component that shows AI-generated response before posting
  - [x] 7.2 Implement trust mode for individual reviews that posts responses directly without preview
  - [x] 7.3 Build bulk processing interface with "Positive Trust Mode" (4-5 star reviews only)
  - [x] 7.4 Implement "Full Trust Mode" bulk processing for all unanswered reviews
  - [x] 7.5 Create rate limiting system with 10-15 second delays between automated responses
  - [x] 7.6 Add bulk operation progress tracking with cancel functionality
  - [x] 7.7 Implement success/error notifications for individual and bulk response posting
  - [x] 7.8 Create confirmation dialogs for bulk operations to prevent accidental mass responses
  - [x] 7.9 Add pause/resume functionality for long-running bulk processing operations 