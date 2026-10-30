import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { Project } from '../src/types';

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (error) => console.error('Screenplay browser error:', error.message));
});

const SOURCE = `<?xml version="1.0"?><FinalDraft><Content>
<Paragraph Type="Outline 1"><Text>ACT ONE</Text></Paragraph>
<Paragraph Type="Scene Heading" Number="1"><Text>INT. BANK - DAY</Text></Paragraph>
<Paragraph Type="Action"><Text Style="Bold">Coffee</Text><Text> waits.</Text></Paragraph>
<Paragraph Type="Character"><Text>ЕВА</Text></Paragraph>
<Paragraph Type="Dialogue"><Text>Привет, мир!</Text></Paragraph>
<Paragraph Type="Scene Heading" Number="2"><Text>EXT. STREET - NIGHT</Text></Paragraph>
<Paragraph Type="Action"><Text>Another Coffee waits.</Text></Paragraph>
</Content></FinalDraft>`;

async function openScript(page: Page) {
  await page.goto(process.env.WRITING_TEST_BASE_URL ?? '/');
  await page.getByPlaceholder('Production title (e.g. The Long Walk Home)').fill('Writing smoke test');
  await page.getByLabel(/Start with the example scenes/).uncheck();
  await page.getByRole('button', { name: 'Full Production', exact: true }).click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.locator('#tab-script').click();
  await page.locator('input[type="file"][accept*=".celtx"]').setInputFiles({ name: 'writing.fdx', mimeType: 'application/xml', buffer: Buffer.from(SOURCE) });
  await page.getByText('Screenplay', { exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Dialogue', exact: true })).toHaveValue('Привет, мир!');
}
async function exportProject(page: Page): Promise<Project> {
  const save = page.getByRole('button', { name: 'Save project file', exact: true });
  if (!await save.isVisible()) await page.getByRole('button', { name: 'More controls', exact: true }).click();
  await save.click();
  const dialog = page.getByRole('dialog', { name: 'Save project file format' });
  await dialog.getByLabel(/JSON/).check();
  const pending = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  const path = await (await pending).path();
  if (!path) throw new Error('No project download');
  return JSON.parse(await readFile(path, 'utf8')) as Project;
}

test('writing tools preserve styles, anchors, variants, IDs and scene structure through save and reload', async ({ page }) => {
  test.setTimeout(120000);
  await openScript(page);
  const before = await exportProject(page);
  await page.getByRole('button', { name: 'Writing tools', exact: true }).click();
  const tools = page.getByRole('region', { name: 'Screenplay writing tools' });
  await tools.getByLabel('Find in screenplay', { exact: true }).fill('Coffee');
  await tools.getByRole('button', { name: 'Go to match', exact: true }).click();
  await expect(tools.getByRole('button', { name: 'Italic', exact: true })).toBeEnabled();
  await tools.getByRole('button', { name: 'Italic', exact: true }).click();
  await tools.getByLabel('New note text', { exact: true }).fill('Keep this prop');
  await tools.getByLabel('Note author', { exact: true }).fill('Éva');
  await tools.getByRole('button', { name: 'Add note', exact: true }).click();
  await tools.getByLabel('Paragraph bookmark', { exact: true }).fill('Prop review');
  await tools.getByLabel('Paragraph bookmark', { exact: true }).press('Tab');
  await tools.getByLabel('Replacement text', { exact: true }).fill('Tea');
  await tools.getByRole('button', { name: 'Replace all', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Action', exact: true }).first()).toHaveValue('Tea waits.');
  await expect(page.getByRole('textbox', { name: 'Action', exact: true }).last()).toHaveValue('Another Tea waits.');
  await page.getByRole('button', { name: 'Undo (Ctrl+Z)', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Action', exact: true }).first()).toHaveValue('Coffee waits.');
  await expect(page.getByRole('textbox', { name: 'Action', exact: true }).last()).toHaveValue('Another Coffee waits.');
  await page.getByRole('button', { name: 'Redo (Ctrl+Y)', exact: true }).click();
  await page.getByRole('textbox', { name: 'Dialogue', exact: true }).click();
  await tools.getByLabel('New dialogue alternative', { exact: true }).fill('Другой вариант.');
  await tools.getByRole('button', { name: 'Save alternative', exact: true }).click();
  await tools.getByRole('button', { name: 'Use alternative', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Dialogue', exact: true })).toHaveValue('Другой вариант.');
  await tools.getByText(/^Scene cards and outline/).click();
  await tools.getByRole('button', { name: 'Move scene down', exact: true }).first().click();
  const after = await exportProject(page);
  expect(after.schemaVersion).toBe(38);
  expect(after.scriptLines?.filter((l) => l.type === 'scene').map((l) => l.id)).toEqual(before.scriptLines?.filter((l) => l.type === 'scene').map((l) => l.id).reverse());
  const action = after.scriptLines?.find((l) => l.bookmark === 'Prop review');
  expect(action?.id).toBe(before.scriptLines?.find((l) => l.text === 'Coffee waits.')?.id);
  expect(action?.styles).toEqual([{ start: 0, end: 3, bold: true, italic: true }]);
  expect(action?.notes?.[0]).toMatchObject({ text: 'Keep this prop', author: 'Éva', start: 0, end: 3 });
  const dialogue = after.scriptLines?.find((l) => l.type === 'dialogue');
  expect(dialogue?.alternates?.[0].text).toBe('Привет, мир!');
  expect(after.scriptLines?.find((l) => l.structure?.length)?.structure?.[0]).toMatchObject({ level: 1, title: 'ACT ONE' });
  // A file download and browser autosave are separate operations. Reload after the durable-save indicator.
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  await page.reload();
  await page.locator('#tab-script').click();
  await page.getByText('Screenplay', { exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Dialogue', exact: true })).toHaveValue('Другой вариант.');
  const reloaded = await exportProject(page);
  expect(reloaded.scriptLines).toEqual(after.scriptLines);
  await page.getByRole('button', { name: 'Writing tools', exact: true }).click();
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.getByLabel('Open side panel full screen', { exact: true }).click();
  await page.getByRole('textbox', { name: 'Action', exact: true }).last().click();
  await expect(tools.getByLabel('Edit note text', { exact: true })).toHaveValue('Keep this prop');
  await tools.getByLabel('Edit note text', { exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/scriptcraft-writing-smoke.png', fullPage: true });
});

test('the browser exports a styled Unicode screenplay PDF under the deployed base path', async ({ page }) => {
  test.slow();
  await openScript(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: /Skript als PDF exportieren|Export script as PDF/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Download PDF', exact: true }).click();
  const download = await pending;
  const path = await download.path();
  expect(path).toBeTruthy();
  expect((await readFile(path!)).subarray(0, 5).toString()).toBe('%PDF-');
  expect(errors).toEqual([]);
});
