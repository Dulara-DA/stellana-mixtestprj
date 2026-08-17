import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // sockjs-client still references the Node-style `global` name in its
  // development bundle. Browsers expose the equivalent object as globalThis.
  define: {
    global: 'globalThis',
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: 'globalThis',
      },
    },
  },
  server: {
    host: '0.0.0.0',
    allowedHosts: [
      'dularas-macbook-pro.tail3ca682.ts.net',
      'statement-signature-challenged-silk.trycloudflare.com',
      'infections-workshops-interface-hdtv.trycloudflare.com',
      'amongst-inspections-dentists-thought.trycloudflare.com',
    ],
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8080',
      '/ws': {
        target: 'http://localhost:8080',
        ws: true,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
  },
})
