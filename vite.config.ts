import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { viteStaticCopy } from 'vite-plugin-static-copy'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: 'manifest.json',
          dest: '.'
        },
        {
          src: 'icons',
          dest: '.'
        }
      ]
    })
  ],
  build: {
    rollupOptions: {
      input: {
        // Main popup entry point
        popup: path.resolve(__dirname, 'src/popup/popup.html'),
        // Background service worker
        background: path.resolve(__dirname, 'src/background/background.ts'),
        // Original Content script
        content: path.resolve(__dirname, 'src/content/content.ts'),
        // New Google Content script
        content_script_google: path.resolve(__dirname, 'src/content/content_script_google.ts'),
      },
      output: {
        entryFileNames: (chunk) => {
          // Ensure proper naming for different entry points
          if (chunk.name === 'background') {
            return 'src/background/background.js';
          }
          if (chunk.name === 'content') {
            return 'src/content/content.js';
          }
          if (chunk.name === 'content_script_google') {
            return 'src/content/content_script_google.js';
          }
          return 'src/[name]/[name].js';
        },
        // Only allow chunks if we explicitly need them
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          // Handle CSS files
          if (assetInfo.name?.endsWith('.css')) {
            if (assetInfo.name.includes('content')) {
              return 'src/content/content.css';
            }
            return 'src/popup/popup.css';
          }
          return 'assets/[name]-[hash][extname]';
        },
        // Keep dynamic imports disabled for compatibility
        inlineDynamicImports: false,
        // Sophisticated chunking strategy - minimize Firebase chunks
        manualChunks: (id) => {
          // Only create chunks for very specific cases
          // Force Firebase to be included in main files instead of separate chunks
          if (id.includes('firebase') || id.includes('@firebase')) {
            return undefined; // Include in main entry files
          }
          
          // Force all node_modules (except Firebase) to be included in main files
          if (id.includes('node_modules')) {
            return undefined; // Include in main entry files
          }
          
          // Don't create chunks for any other dependencies
          return undefined;
        },
      },
      // Optimize for tree-shaking
      treeshake: {
        moduleSideEffects: false,
        propertyReadSideEffects: false,
        tryCatchDeoptimization: false,
      },
      // External dependencies - force bundling of Firebase
      external: [],
    },
    // Ensure compatibility with Chrome extension environment
    target: 'esnext',
    minify: 'esbuild',
    // Copy manifest and icons to dist
    copyPublicDir: false,
    // Disable module preloading for service worker compatibility
    modulePreload: false,
    // Optimize bundle size
    chunkSizeWarningLimit: 1000,
    // Disable source maps in production for smaller bundle
    sourcemap: false,
    // Force more aggressive bundling
    assetsInlineLimit: 0, // Don't inline assets
  },
  // Configure for Chrome extension development
  define: {
    global: 'globalThis',
    // Inject MVP environment variables at build time
    __VITE_API_URL__: JSON.stringify(process.env.VITE_API_URL || 'http://localhost:3000'),
    __VITE_OPENAI_API_KEY__: JSON.stringify(process.env.VITE_OPENAI_API_KEY || ''),
  },
  // Optimize dependencies
  optimizeDeps: {
    include: [
      'firebase/app',
      'firebase/auth',
      'firebase/firestore',
      'firebase/functions'
    ],
    exclude: [
      // Exclude any packages that should not be pre-bundled
    ]
  },
})
