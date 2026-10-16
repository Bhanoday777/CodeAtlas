/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // The API's CORS setting allows only this origin; fail on a busy port instead of moving to 5174.
    port: 5173,
    strictPort: true,
  },
  build: {
    rolldownOptions: {
      output: {
        // Cytoscape and its layout are most of the bundle and change far less often than the app.
        codeSplitting: {
          groups: [{ name: 'graph-vendor', test: /node_modules[\\/](cytoscape|cytoscape-dagre|dagre|graphlib|@dagrejs)[\\/]/ }],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
