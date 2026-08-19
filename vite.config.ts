import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
    host: true,
    strictPort: true,
    hmr: {
      clientPort: 3000,
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  // GitHub Pages serves the app from https://koosoli.github.io/OpenShotDesigner/.
  // The deploy workflow sets GH_PAGES=true so built assets get the correct base path.
  // Local development (npm run dev) keeps the default '/' base.
  base: process.env.GH_PAGES === 'true' ? '/OpenShotDesigner/' : '/',
});