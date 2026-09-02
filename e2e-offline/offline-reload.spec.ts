import { expect, test } from '@playwright/test';

test('reopens the saved production with the network unavailable', async ({ page, context }) => {
  const title = `Offline production ${Date.now()}`;
  await page.goto('/');
  await page.getByPlaceholder('Production title (e.g. The Long Walk Home)').fill(title);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('input[title="Click to rename project"]')).toHaveValue(title);
  await expect(page.getByText('Saved locally')).toBeVisible();

  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // The worker registers after the first load. One controlled online reload
  // lets its stale-while-revalidate handler cache every hashed app chunk.
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await expect(page.locator('input[title="Click to rename project"]')).toHaveValue(title);

  await context.setOffline(true);
  await page.reload();

  await expect(page.locator('input[title="Click to rename project"]')).toHaveValue(title);
  await expect(page.getByRole('button', { name: 'Open live shot tracker' })).toBeVisible();
});
