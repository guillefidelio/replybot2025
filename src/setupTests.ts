// Jest setup file for Chrome extension testing
import '@testing-library/jest-dom';

// Mock Chrome extension APIs
const mockChrome = {
  runtime: {
    sendMessage: jest.fn(),
    onMessage: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
    onInstalled: {
      addListener: jest.fn(),
    },
    id: 'test-extension-id',
  },
  storage: {
    local: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
      clear: jest.fn().mockResolvedValue(undefined),
    },
  },
  tabs: {
    query: jest.fn(),
    sendMessage: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  scripting: {
    executeScript: jest.fn(),
  },
  action: {
    setBadgeText: jest.fn(),
    setBadgeBackgroundColor: jest.fn(),
  },
};

// Make chrome API available globally
(global as any).chrome = mockChrome;

// Mock window.location for content script tests
Object.defineProperty(window, 'location', {
  value: {
    href: 'https://business.google.com/reviews',
    pathname: '/reviews',
    search: '',
    hash: '',
  },
  writable: true,
});

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Mock MutationObserver for content script tests
global.MutationObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  disconnect: jest.fn(),
  takeRecords: jest.fn(),
}));

// Mock ResizeObserver if needed
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// Setup DOM environment for tests
beforeEach(() => {
  // Clear all mocks
  jest.clearAllMocks();
  
  // Reset DOM
  document.body.innerHTML = '';
  
  // Reset chrome API mocks
  mockChrome.runtime.sendMessage.mockClear();
  mockChrome.storage.local.get.mockResolvedValue({});
  mockChrome.storage.local.set.mockResolvedValue(undefined);
});

afterEach(() => {
  // Cleanup after each test
  jest.clearAllTimers();
});

export { mockChrome }; 