import { defineConfig } from 'vitest/config';
import path from 'path';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
  test: {
    environment: 'jsdom',
    pool: 'threads',
    globals: false,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    /**
     * The default 5 s is not enough for the panel-behaviour layer. Those tests
     * render a real panel over a real project and drive it with `userEvent`,
     * which advances a timer per keystroke; the heaviest of them measures
     * around 5.3 s on a loaded machine and around 1 s on an idle one. At the
     * default they failed only when the whole suite ran — the worst kind of
     * red, because the fix looks like "run it again" and that is what people
     * learn to do.
     *
     * Deliberately a ceiling rather than a target: a scale budget belongs in
     * `largeProject.test.ts`, which asserts its own measured times.
     */
    testTimeout: 20000,
  },
});
