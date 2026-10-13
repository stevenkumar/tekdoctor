import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Read VITE_* vars for the active mode. These are INLINED into the bundle at
  // build time, so the production build always bakes in client/.env.production.
  const env = loadEnv(mode, __dirname, '')

  // Dev-only upstream for the API proxy. In production this whole block is
  // discarded and the bundle calls VITE_API_URL (the live domain) directly.
  // Override with VITE_DEV_PROXY_TARGET if your local backend uses another port.
  const devProxyTarget = env.VITE_DEV_PROXY_TARGET || 'http://127.0.0.1:5000'

  return {
    plugins: [
      react(),
      tailwindcss(),
    ],

    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },

    // ── Dev Server ────────────────────────────────────────────────────────────
    server: {
      port: 3000,
      // Fail loudly instead of silently drifting to 3001, which would put the
      // dev origin outside the backend's CORS allowlist.
      strictPort: true,
      proxy: {
        // All /api/* requests are forwarded to the Express backend during dev.
        // In production the Express server itself serves these routes from the
        // same domain, so no proxy is involved.
        '/api': {
          target: devProxyTarget,
          changeOrigin: true,
        },
        '/uploads': {
          target: devProxyTarget,
          changeOrigin: true,
        },
      },
    },

    // ── Production Build ──────────────────────────────────────────────────────
    build: {
      // Output always lands in frontend/dist — server.js looks here first.
      outDir: 'dist',
      // Generate source maps for production error tracking (optional — remove if not needed)
      sourcemap: false,
      // Warn on chunks > 500 kB (informational only — does not fail the build)
      chunkSizeWarningLimit: 1000,

      rollupOptions: {
        output: {
          // Split large shared dependencies into separate cached vendor chunks.
          // Note: Avoid a catch-all 'modules' chunk so on-demand dependencies
          // (such as recharts and html2pdf) remain in their own route-specific lazy chunks.
          manualChunks(id) {
            const normalized = id.replace(/\\/g, '/');
            if (normalized.includes('node_modules')) {
              if (normalized.includes('/react/') || normalized.includes('/react-dom/')) {
                return 'vendor';
              }
              if (normalized.includes('react-router-dom') || normalized.includes('react-router')) {
                return 'router';
              }
              if (normalized.includes('framer-motion')) {
                return 'framer';
              }
              if (normalized.includes('lucide-react')) {
                return 'ui';
              }
            }
          },
        },
      },
    },
  }
})
