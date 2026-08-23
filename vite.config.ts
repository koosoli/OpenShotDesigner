import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';

/**
 * Stamp a unique build id into the service worker so each deploy gets its
 * own cache namespace (old caches are purged on activate). Without this the
 * worker bytes never change and browsers keep serving the previous bundle.
 */
const serviceWorkerBuildId = (): Plugin => {
  const buildId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  let outDir = 'dist';
  return {
    name: 'service-worker-build-id',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    async closeBundle() {
      const swPath = path.resolve(outDir, 'sw.js');
      try {
        const source = await readFile(swPath, 'utf8');
        await writeFile(swPath, source.replace(/__BUILD_ID__/g, buildId), 'utf8');
      } catch {
        // No service worker in this build — nothing to stamp.
      }
    },
  };
};

export default defineConfig({
  plugins: [react(), tailwindcss(), serviceWorkerBuildId()],
  build: {
    rollupOptions: {
      output: {
        /**
         * React and the icon set change far less often than app code, so
         * giving them their own chunks lets a returning visitor reuse them
         * across deploys instead of re-downloading them inside the entry
         * chunk. `react-dom` is tested first because `node_modules/react`
         * is a prefix of `node_modules/react-dom` and would otherwise
         * swallow it.
         */
        manualChunks(id: string) {
          if (id.includes('node_modules/react-dom')) return 'vendor-react';
          if (id.includes('node_modules/react/')) return 'vendor-react';
          if (id.includes('node_modules/scheduler')) return 'vendor-react';
          if (id.includes('node_modules/lucide-react')) return 'vendor-icons';
          return undefined;
        },
      },
    },
  },
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
