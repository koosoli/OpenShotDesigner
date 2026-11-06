import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { Project } from '../src/types';
import { CURRENT_PROJECT_SCHEMA_VERSION } from '../src/domain/migrations';

async function exportProject(page: Page): Promise<Project> {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save project file', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Save project file format' });
  await dialog.getByLabel(/JSON/).check();
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  const download = await pending;
  return JSON.parse(await readFile((await download.path())!, 'utf8')) as Project;
}

test('aims a fixture independently, supports undo/redo and retains aim after reload/export', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('Production title (e.g. The Long Walk Home)').fill('Fixture beam aim');
  await page.getByLabel(/Start with the example scenes/).check();
  await page.getByRole('button', { name: 'Full Production', exact: true }).click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByRole('button', { name: 'Declutter Floor Plan', exact: true }).click();
  await page.getByRole('button', { name: 'Light beams', exact: true }).click();
  const fixture = page.locator('#floor-plan-canvas-container .fixture-softbox-dome').first();
  const body = await fixture.evaluate(element => element.parentElement!.getAttribute('transform'));
  await fixture.click();
  const pan = page.getByRole('slider', { name: 'Beam pan slider', exact: true });
  const tilt = page.getByRole('slider', { name: 'Beam tilt slider', exact: true });
  await pan.fill('45');
  await page.getByRole('spinbutton', { name: 'Beam tilt (degrees)', exact: true }).fill('-30');
  await page.getByRole('spinbutton', { name: 'Beam tilt (degrees)', exact: true }).press('Enter');
  await expect(tilt).toHaveValue('-30');
  const beam = page.locator('#floor-plan-canvas-container [data-beam-pan="45"]');
  await expect(beam).toHaveCount(1);
  expect(await beam.evaluate(element => element.parentElement!.getAttribute('transform'))).toBe(body);
  await page.keyboard.press('Control+z');
  await expect(tilt).toHaveValue('20');
  await page.keyboard.press('Control+z');
  await expect(pan).toHaveValue('0');
  await page.keyboard.press('Control+Shift+z');
  await page.keyboard.press('Control+Shift+z');
  await expect(pan).toHaveValue('45'); await expect(tilt).toHaveValue('-30');
  const project = await exportProject(page);
  expect(project.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
  const aimed = project.setups.flatMap(setup => setup.elements).find(element => element.type === 'light' && element.beamPanDeg === 45);
  expect(aimed?.type === 'light' && aimed.beamTiltDeg).toBe(-30);
  // File export reads memory; browser persistence has a separate debounce and
  // IndexedDB write. Reload only after the UI confirms that write is durable.
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  await page.reload();
  await fixture.click();
  await expect(pan).toHaveValue('45'); await expect(tilt).toHaveValue('-30');
  await page.getByRole('button', { name: 'Use scene tilt', exact: true }).click();
  await expect(tilt).toHaveValue('20');
});
