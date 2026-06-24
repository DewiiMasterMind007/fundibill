import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Electron builds load files locally via file:// — they need a relative base.
// Vercel and local dev both serve from the root, so they use '/'.
const isElectron = process.env.ELECTRON === 'true'

export default defineConfig({
  base: isElectron ? './' : '/',

  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.png', 'icon.ico'],
      manifest: {
        name: 'FundiBill',
        short_name: 'FundiBill',
        description: 'SA Built Invoicing Software',
        theme_color: '#008080',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: 'https://app.fundibill.online',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/, /\.[a-z0-9]+$/i],
        cleanupOutdatedCaches: true,
      },
    }),
  ],

  resolve: {
    alias: {
      buffer: 'buffer',
    },
  },

  define: {
    global: 'globalThis',
  },

  optimizeDeps: {
    include: ['buffer'],
  },

  build: {
    outDir: 'dist/renderer',
    emptyOutDir: true,
  },

  server: {
    port: 5173,
    strictPort: true,
  },
})
