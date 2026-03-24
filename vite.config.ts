import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'prompt',
        injectRegister: null,
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        includeAssets: ['icon.svg', 'apple-touch-icon.svg', 'offline.html'],
        manifest: {
          name: 'RFE Foam Pro',
          short_name: 'RFE Pro',
          description: 'Enterprise Spray Foam Estimation & Rig Management Suite',
          id: 'rfe-foam-pro-desktop',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          display_override: ['window-controls-overlay', 'minimal-ui', 'standalone'],
          background_color: '#0F172A',
          theme_color: '#0F172A',
          orientation: 'any',
          prefer_related_applications: false,
          categories: ['business', 'productivity', 'utilities', 'finance'],
          launch_handler: { client_mode: 'focus-existing' },
          icons: [
            {
              src: '/icon.svg',
              sizes: 'any',
              type: 'image/svg+xml',
              purpose: 'any',
            },
            {
              src: '/icon.svg',
              sizes: 'any',
              type: 'image/svg+xml',
              purpose: 'maskable',
            },
            {
              src: '/apple-touch-icon.svg',
              sizes: '180x180',
              type: 'image/svg+xml',
              purpose: 'any',
            },
          ],
          shortcuts: [
            {
              name: 'New Estimate',
              short_name: 'New Job',
              description: 'Start a new spray foam calculation',
              url: '/?action=new_estimate',
              icons: [{ src: '/icon.svg', sizes: 'any' }],
            },
            {
              name: 'Inventory',
              short_name: 'Stock',
              description: 'Check chemical sets and supplies',
              url: '/?action=warehouse',
              icons: [{ src: '/icon.svg', sizes: 'any' }],
            },
          ],
          screenshots: [
            {
              src: '/icon.svg',
              sizes: '512x512',
              type: 'image/svg+xml',
              form_factor: 'wide',
              label: 'RFE Foam Pro Dashboard',
            },
            {
              src: '/icon.svg',
              sizes: '512x512',
              type: 'image/svg+xml',
              form_factor: 'narrow',
              label: 'RFE Foam Pro Mobile',
            },
          ],
        },
        injectManifest: {
          globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        },
        devOptions: {
          enabled: false,
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
