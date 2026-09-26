import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_VERSION } from '../version';

describe('app version', () => {
  it('matches package.json', () => {
    const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
    const pkg = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf8')) as {
      version: string;
    };
    expect(APP_VERSION).toBe(pkg.version);
  });

  it('looks like semver', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
