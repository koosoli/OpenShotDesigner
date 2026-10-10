import { expect, test, type Page } from '@playwright/test';

/**
 * Smoke tests for the production paperwork: script reports, the schedule's
 * one-liner / DOOD / time report, scouting, and the shortcut sheet — clicked
 * through in a real browser on a fresh example project.
 */

const createExampleProject = async (page: Page, title: string) => {
  await page.goto('/');
  await page.getByPlaceholder('Production title (e.g. The Long Walk Home)').fill(title);
  await page.getByLabel(/Start with the example scenes/).check();
  await page.getByRole('button', { name: 'Full Production', exact: true }).click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('input[title="Click to rename project"]')).toHaveValue(title);
};

const openSchedule = async (page: Page) => {
  await page.getByRole('button', { name: /^Production modules/ }).click();
  await page.getByRole('button', { name: 'Schedule', exact: true }).click();
};

test.describe('production paperwork', () => {
  test.beforeEach(async ({ page }) => {
    await createExampleProject(page, 'Paperwork Smoke');
  });

  test('script reports show page counts, breakdown sheets and props', async ({ page }) => {
    await page.locator('#tab-script').click();
    await page.getByRole('button', { name: 'Reports', exact: true }).click();
    await expect(page.getByText('Scene list · page count')).toBeVisible();
    await expect(page.getByLabel('Page length of scene 1')).not.toHaveValue('—');

    await page.getByRole('button', { name: 'Sheets', exact: true }).click();
    await expect(page.getByText('Breakdown sheets', { exact: true })).toBeVisible();
    await expect(page.getByText('Detective grabs suspect from behind')).toBeVisible();

    await page.getByRole('button', { name: 'Props', exact: true }).click();
    await expect(page.getByRole('cell', { name: /Ledger/ })).toBeVisible();
  });

  test('the schedule has the one-liner, the DOOD and the time report', async ({ page }) => {
    await openSchedule(page);

    await page.getByRole('button', { name: 'One-liner', exact: true }).click();
    await expect(page.getByText(/days · .* pages\. Coloured like the board\./)).toBeVisible();

    await page.getByRole('button', { name: 'DOOD', exact: true }).click();
    await expect(page.getByText('Day out of days', { exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Stunts' })).toBeVisible();

    await page.getByRole('button', { name: 'Time report', exact: true }).click();
    await expect(page.getByText('Performers production time report')).toBeVisible();
    await expect(page.getByText(/meal penalty period/)).toBeVisible();
  });

  test('a DOOD cell can be marked by hand and the menu closes on Escape', async ({ page }) => {
    await openSchedule(page);
    await page.getByRole('button', { name: 'DOOD', exact: true }).click();
    const cell = page.getByRole('button', { name: /, (Start-work-finish|Fitting|Off)/ }).first();
    await cell.click();
    await expect(page.getByRole('menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toBeHidden();
  });

  test('locations carry an example scouting report', async ({ page }) => {
    await page.getByRole('button', { name: /^Production modules/ }).click();
    await page.getByRole('button', { name: 'Locations', exact: true }).click();
    await page.getByText('Riverside Diner', { exact: true }).first().click();
    await expect(page.getByText('Scouting', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Photos \(2\)/)).toBeVisible();
  });

  test('? opens the keyboard shortcut sheet', async ({ page }) => {
    await page.locator('body').click();
    await page.keyboard.press('?');
    await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeHidden();
  });
});
