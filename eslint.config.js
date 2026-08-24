/**
 * ESLint flat config.
 *
 * `npm run lint` was a typecheck plus the encoding check, which is not a lint:
 * nothing enforced the React rules, so the `eslint-disable` comments in the
 * codebase suppressed rules that never ran. Three of the bugs fixed in recent
 * sessions were stale-closure / stale-dependency bugs that
 * `react-hooks/exhaustive-deps` flags by construction, so this config exists
 * mainly to catch that class before it reaches the app.
 *
 * Type-aware linting is deliberately NOT enabled: `tsc --noEmit` already runs
 * in `npm run lint` and covers the type errors, and the type-aware rule set
 * would multiply lint time on a 65k-line codebase for very little extra signal.
 */
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';

export default tseslint.config(
  {
    // Build output, deps, and the generated fixture snapshot (1.2 MB of data
    // that is validated by its own schema-contract test, not by a linter).
    ignores: ['dist/**', 'node_modules/**', 'src/generated/**', 'coverage/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.es2022 },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: {
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,

      // The whole point of adding a linter here. Effects that close over stale
      // state have caused real data loss in this app, so a missing dependency
      // is an error, not a warning.
      'react-hooks/exhaustive-deps': 'error',

      // Rule 5 in AGENTS.md: no NEW `any`. The existing escapes are
      // grandfathered as warnings so the build stays green while they are paid
      // down; they are not silently accepted. The `--max-warnings` ceiling in
      // the `lint` script is the ratchet that stops the count from growing.
      '@typescript-eslint/no-explicit-any': 'warn',

      // Caught by tsc with better messages, and the TS-aware version
      // understands type-only imports.
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],

      // Empty catch blocks are a deliberate, documented pattern here: storage,
      // clipboard and geocode failures degrade rather than throw.
      'no-empty': ['error', { allowEmptyCatch: true }],

      // This codebase wraps its controls — <label>Caption<input/></label> —
      // which is valid and accessible, but the rule only looks two elements
      // deep by default and the wrappers here are grid/flex cells.
      // WARN, not error, and it is finding something real: ~114 captions are
      // rendered as a <label> SIBLING of their control with no htmlFor, so a
      // screen reader announces those inputs unlabelled. The honest fix is
      // per-site (id/htmlFor pairs, or restructuring the wrapper) — a codemod
      // that wraps the control would inherit the caption's opacity and text
      // size onto it and change the look of 114 places. Tracked as debt in
      // docs/codebase-audit-2026-08-23.md rather than silenced.
      'jsx-a11y/label-has-associated-control': ['warn', { assert: 'either', depth: 5 }],

      // autoFocus is used only where a form or dialog has just been opened by
      // a deliberate user action and the first field is the obvious target.
      'jsx-a11y/no-autofocus': 'off',

      // The canvas is a pointer-driven surface; SVG groups carry their own
      // keyboard paths through the inspector and the context menu rather than
      // being individually focusable.
      'jsx-a11y/no-noninteractive-element-interactions': 'off',
      'jsx-a11y/click-events-have-key-events': 'off',
      'jsx-a11y/no-static-element-interactions': 'off',

      // `role="group"` containers are made focusable on purpose in a couple of
      // places so a paste or a shortcut lands on the right panel. The rule does
      // not accept group as an interactive role; the alternative would be a
      // hidden focus-trap input, which is worse for a screen-reader user.
      //
      // `role="application"` is on the list for the same reason and is the more
      // clear-cut case: the headshot reframer is a two-axis direct-manipulation
      // control with real arrow-key handling, which is exactly what the role is
      // for, and it must be focusable or the keyboard path does not exist.
      'jsx-a11y/no-noninteractive-tabindex': [
        'warn',
        { roles: ['application', 'group'], tags: [] },
      ],
    },
  },
  {
    // The service worker runs in a ServiceWorkerGlobalScope, not a window.
    files: ['public/sw.js'],
    languageOptions: { globals: { ...globals.serviceworker, ...globals.browser } },
  },
  {
    // Tests may lean on `any` for fixtures of deliberately malformed data.
    files: ['**/__tests__/**', '**/*.test.{ts,tsx}', 'vitest.setup.ts'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  {
    files: ['scripts/**/*.{mjs,ts}', '*.config.{ts,js}'],
    languageOptions: { globals: { ...globals.node } },
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
);
