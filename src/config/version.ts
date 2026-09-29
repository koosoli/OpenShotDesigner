/**
 * Single source of truth for the user-visible app version.
 *
 * Kept in sync with `package.json` ("version"). If you bump one, bump the
 * other — a unit test (`src/config/__tests__/version.test.ts`) enforces this.
 * Display only: never enters persisted project schemas or domain logic.
 */

export const APP_VERSION = '1.0.2';

export const SPONSOR_LINKS = {
  github: 'https://github.com/sponsors/koosoli',
  coffee: 'https://buymeacoffee.com/koosoli',
} as const;
