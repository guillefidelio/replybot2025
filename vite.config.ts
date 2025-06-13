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
        // Content script
        content: path.resolve(__dirname, 'src/content/content.ts'),
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
          return 'src/[name]/[name].js';
        },
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
      },
    },
    // Ensure compatibility with Chrome extension environment
    target: 'esnext',
    minify: 'esbuild',
    // Copy manifest and icons to dist
    copyPublicDir: false,
  },
  // Configure for Chrome extension development
  define: {
    global: 'globalThis',
    // Inject MVP environment variables at build time
    __VITE_API_URL__: JSON.stringify(process.env.VITE_API_URL || 'http://localhost:3000'),
    __VITE_OPENAI_API_KEY__: JSON.stringify(process.env.VITE_OPENAI_API_KEY || ''),
  },
})
