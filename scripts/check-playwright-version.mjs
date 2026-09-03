/**
 * Fail CI when the installed Playwright does not match package-lock.json.
 *
 * The e2e browsers are versioned per Playwright release (e.g. chromium-1200
 * for 1.57 vs chromium-1234 for 1.62). A lockfile that pins 1.57 with a
 * node_modules carrying 1.62 downloads nothing (`npx playwright install`
 * fetches the *installed* version's browsers) and every e2e run dies with
 * "Executable doesn't exist". `npm ci` is the fix; this check makes the
 * mismatch loud instead of a 30 s browser-launch timeout.
 */
import { readFileSync } from 'node:fs';

const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const locked = lock.packages?.['node_modules/@playwright/test']?.version;
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const installed = JSON.parse(readFileSync('node_modules/@playwright/test/package.json', 'utf8')).version;

if (!locked) {
  console.error('package-lock.json does not pin @playwright/test.');
  process.exit(1);
}
if (installed !== locked) {
  console.error(
    `Playwright mismatch: installed ${installed} but lockfile pins ${locked} ` +
      `(package.json allows ${pkg.devDependencies?.['@playwright/test']}). ` +
      `Run \`npm ci\` — never \`npm install\` — to fix.`,
  );
  process.exit(1);
}
console.log(`Playwright ${installed} matches lockfile.`);
