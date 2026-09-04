import { expect, test } from '@playwright/test';

/**
 * Firefox smoke: boot, create, persist across reload, download fallback.
 * File System Access pickers do not exist here, so every save path must
 * degrade to a plain browser download.
 */
test.beforeEach(async ({ context }) => {
  await context.clearCookies();
  await context.addInitScript(() => {
    try {
      localStorage.setItem('openshotdesigner_lang', 'en');
    } catch {}
  });
});

test('boots, creates a project and survives reload', async ({ page }) => {
  const title = `Firefox Smoke ${Date.now()}`;
  await page.goto('/');
  await page.getByPlaceholder('Production title (e.g. The Long Walk Home)').fill(title);
  await page.getByLabel(/Start with the example scenes/).check();
  await page.getByRole('button', { name: 'Full Production', exact: true }).click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('input[title="Click to rename project"]')).toHaveValue(title);

  await page.reload();
  await expect(page.locator('input[title="Click to rename project"]')).toHaveValue(title);
});

test('project JSON download works without native file handles', async ({ page }) => {
  const title = `Firefox Download ${Date.now()}`;
  await page.goto('/');
  await page.getByPlaceholder('Production title (e.g. The Long Walk Home)').fill(title);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('input[title="Click to rename project"]')).toHaveValue(title);
  await page.evaluate(() => {
    Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true });
  });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save & Download Project JSON' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.json$/);
  expect(await download.path()).toBeTruthy();
});
