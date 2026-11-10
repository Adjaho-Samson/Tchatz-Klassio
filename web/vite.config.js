import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Tchatz Klassio — configuration Vite
// `base: './'` permet un déploiement statique sur n'importe quel hébergeur
// (Vercel, Netlify, GitHub Pages…) sans configuration supplémentaire.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    allowedHosts: true,
  },
  preview: {
    host: true,
    port: 4173,
    strictPort: true,
    allowedHosts: true,
  },
  build: {
    // Pas de source maps en production : le code interne n'est pas exposé.
    sourcemap: false,
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('pdf.worker')) return 'viewer-pdf-worker-fallback';
          if (id.includes('pdfjs-dist')) return 'viewer-pdf';
          if (id.includes('docx-preview')) return 'viewer-docx';
          if (id.includes('pptxtojson') || id.includes('txml') || id.includes('tinycolor2')) return 'viewer-pptx';
          if (id.includes('/xlsx/') || id.includes('/cfb/') || id.includes('/ssf/')) return 'viewer-sheet';
          if (id.includes('jszip') || id.includes('pako')) return 'viewer-zip';
          return undefined;
        },
      },
    },
  },
});
