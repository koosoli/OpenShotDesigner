import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/** Printed by this app's own screenplay PDF export (cover + two scenes). */
const FIXTURE = fileURLToPath(new URL('./fixtures/bank-job.pdf', import.meta.url));

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    try {
      localStorage.setItem('openshotdesigner_lang', 'en');
    } catch {}
  });
});

test('a screenplay PDF imports with its cover, scenes and speeches', async ({ page }) => {
  test.slow();
  await page.goto('/');
  await page.getByPlaceholder('Production title (e.g. The Long Walk Home)').fill(`PDF import ${Date.now()}`);
  await page.getByRole('button', { name: 'Full Production', exact: true }).click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.locator('#tab-script').click();
  await expect(page.getByText('No Screenplay Loaded')).toBeVisible();

  await page.locator('input[type="file"][accept*=".celtx"]').setInputFiles(FIXTURE);

  await page.getByText('Screenplay', { exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Set / location' })).toHaveCount(2);
  await expect(page.getByRole('textbox', { name: 'Set / location' }).first()).toHaveValue('BANK');
  await expect(page.getByRole('textbox', { name: 'Character cue' })).toHaveValue('ANA');
  await expect(page.getByRole('textbox', { name: 'Dialogue' })).toHaveValue('Give it back.');
  await page.getByText('Title page', { exact: true }).click();
  await expect(page.getByText('Ada Writer').first()).toBeVisible();
});

test('Reports → DOOD opens the Schedule on the day out of days', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder('Production title (e.g. The Long Walk Home)').fill(`DOOD link ${Date.now()}`);
  await page.getByLabel(/Start with the example scenes/).check();
  await page.getByRole('button', { name: 'Full Production', exact: true }).click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.locator('#tab-script').click();
  await page.getByRole('button', { name: 'Reports', exact: true }).click();
  await page.getByRole('button', { name: /^DOOD/ }).click();
  await expect(page.getByText('Day out of days', { exact: true })).toBeVisible();
});
