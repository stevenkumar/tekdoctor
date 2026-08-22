import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  // ── Dev Server ──────────────────────────────────────────────────────────────
  server: {
    port: 3000,
    proxy: {
      // All /api/* requests are forwarded to the Express backend during dev.
      // In production the Express server itself serves these routes.
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },

  // ── Production Build ────────────────────────────────────────────────────────
  build: {
    // Output always lands in frontend/dist — server.js looks here first.
    outDir: 'dist',
    // Generate source maps for production error tracking (optional — remove if not needed)
    sourcemap: false,
    // Warn on chunks > 500 kB (informational only — does not fail the build)
    chunkSizeWarningLimit: 1000,

    rollupOptions: {
      output: {
        // Split large dependencies into separate cached chunks
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('framer-motion')) return 'framer';
            if (id.includes('lucide-react')) return 'ui';
            if (id.includes('react-router-dom')) return 'router';
            if (id.includes('react') || id.includes('react-dom')) return 'vendor';
            return 'modules';
          }
        },
      },
    },
  },
})
