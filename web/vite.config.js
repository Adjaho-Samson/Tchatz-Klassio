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
    target: 'es2019',
    chunkSizeWarningLimit: 900,
  },
});
