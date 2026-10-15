import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { Project } from '../src/types';

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    try {
      localStorage.setItem('openshotdesigner_lang', 'en');
    } catch {}
  });
});

const createExampleProject = async (page: Page, title: string) => {
  await page.goto('/');
  await page.getByPlaceholder('Production title (e.g. The Long Walk Home)').fill(title);
  await page.getByLabel(/Start with the example scenes/).check();
  await page.getByRole('button', { name: 'Full Production', exact: true }).click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('input[title="Click to rename project"]')).toHaveValue(title);
};

const exportProject = async (page: Page): Promise<Project> => {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save project file' }).click();
  const dialog = page.getByRole('dialog', { name: 'Save project file format' });
  await dialog.getByLabel(/JSON/).check();
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  const path = await (await downloadPromise).path();
  if (!path) throw new Error('The browser did not expose the downloaded project file.');
  return JSON.parse(await readFile(path, 'utf8')) as Project;
};

const focusedLabel = (page: Page) => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '');

test('a scene is written from the keyboard alone and gets a floor-plan setup', async ({ page }) => {
  // Two project exports and a long typed walk-through.
  test.slow();
  await createExampleProject(page, `Keyboard scene ${Date.now()}`);
  await page.locator('#tab-script').click();
  await page.getByText('Screenplay', { exact: true }).click();
  const before = await exportProject(page);

  // The one click: into the last line of the screenplay.
  const lastLine = page.locator('[data-line-input]').last();
  await lastLine.click();
  await page.keyboard.press('End');

  // Enter starts a new line; Tab changes its kind until it is a scene heading
  // (action → character → transition → scene heading, as in Final Draft).
  await page.keyboard.press('Enter');
  for (let i = 0; i < 6 && (await focusedLabel(page)) !== 'Set / location'; i++) await page.keyboard.press('Tab');
  expect(await focusedLabel(page)).toBe('Set / location');

  // Typing the whole heading fills the INT/EXT picker; " - du" offers DUSK.
  await page.keyboard.type('ext. harbour - du');
  const times = page.getByRole('listbox', { name: 'Time of day' });
  await expect(times.getByRole('option', { name: 'DUSK' })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(times).toBeHidden();
  const heading = page.getByRole('textbox', { name: 'Set / location' }).last();
  await expect(heading).toHaveValue(/^harbour$/i);
  await expect(page.getByRole('combobox', { name: 'Interior or exterior' }).last()).toHaveValue('EXT.');
  await expect(page.getByRole('combobox', { name: 'Time of day' }).last()).toHaveValue('DUSK');

  // Alt+↑/↓ changes INT/EXT without leaving the field.
  await page.keyboard.press('Alt+ArrowUp');
  await expect(page.getByRole('combobox', { name: 'Interior or exterior' }).last()).toHaveValue('INT.');
  await page.keyboard.press('Alt+ArrowDown');
  await expect(page.getByRole('combobox', { name: 'Interior or exterior' }).last()).toHaveValue('EXT.');

  // Enter goes on to the action line; Tab at its end starts a character cue.
  await page.keyboard.press('Enter');
  await page.keyboard.type('Gulls circle the empty quay.');
  await page.keyboard.press('Tab');
  expect(await focusedLabel(page)).toBe('Character cue');
  await page.keyboard.type('MARA (v');
  await expect(page.getByRole('listbox').getByRole('option', { name: 'V.O.' })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('textbox', { name: 'Character cue' }).last()).toHaveValue('MARA (V.O.)');
  // Taking the suggestion with Enter moved on to the dialogue.
  await expect.poll(() => focusedLabel(page)).toBe('Dialogue');

  // ↑ walks back up to the heading.
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  expect(await focusedLabel(page)).toBe('Set / location');

  // Leaving the new heading created its setup — one example camera, the
  // open setup unchanged.
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(500);
  const after = await exportProject(page);
  const added = after.setups.filter((setup) => !before.setups.some((existing) => existing.id === setup.id));
  expect(added).toHaveLength(1);
  expect(added[0].name).toMatch(/· EXT\. HARBOUR - DUSK$/);
  expect(added[0].elements.map((element) => element.type)).toEqual(['camera']);
  expect(after.activeSetupId).toBe(before.activeSetupId);
  // The new set is a project location now, ready for an address.
  expect((after.locations ?? []).map((location) => location.name)).toContain('HARBOUR');
  expect((before.locations ?? []).map((location) => location.name)).not.toContain('HARBOUR');

  // The heading's ▾ offers it alongside the existing locations.
  const picker = page.getByRole('combobox', { name: 'Pick a location' }).last();
  await expect(picker.locator('option', { hasText: 'HARBOUR' })).toHaveCount(1);
  const other = (before.locations ?? [])[0]?.name;
  if (other) {
    await picker.selectOption(other);
    await expect(page.getByRole('textbox', { name: 'Set / location' }).last()).toHaveValue(new RegExp(`^${other}$`, 'i'));
  }
});

test('Final Draft element flow, the int. shortcut and dual dialogue', async ({ page }) => {
  test.slow();
  await createExampleProject(page, `Element flow ${Date.now()}`);
  await page.locator('#tab-script').click();
  await page.getByText('Screenplay', { exact: true }).click();

  const lastLine = page.locator('[data-line-input]').last();
  await lastLine.click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');

  // Make sure the new line is an action line, then "int. " turns it into a heading.
  for (let i = 0; i < 6 && (await focusedLabel(page)) !== 'Action'; i++) await page.keyboard.press('Shift+Tab');
  expect(await focusedLabel(page)).toBe('Action');
  await page.keyboard.type('int. ');
  await expect.poll(() => focusedLabel(page)).toBe('Set / location');
  await page.keyboard.type('vault');
  await page.keyboard.press('Escape');

  // Heading → Enter → action → Tab → cue → Enter → dialogue → Enter → action.
  await page.keyboard.press('Enter');
  expect(await focusedLabel(page)).toBe('Action');
  await page.keyboard.type('The door swings shut.');
  await page.keyboard.press('Tab');
  expect(await focusedLabel(page)).toBe('Character cue');
  await page.keyboard.type('ANA');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Enter');
  expect(await focusedLabel(page)).toBe('Dialogue');
  await page.keyboard.type('Give it back.');
  await page.keyboard.press('Enter');
  expect(await focusedLabel(page)).toBe('Action');

  // An empty action line + Tab is a cue; Ctrl+D sets it beside ANA.
  await page.keyboard.press('Tab');
  expect(await focusedLabel(page)).toBe('Character cue');
  await page.keyboard.type('BEN');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+d');
  await expect(page.getByRole('button', { name: 'Dual dialogue' }).last()).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Enter');
  await page.keyboard.type('No.');

  // Enter mid-line splits the dialogue.
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  await expect.poll(() => focusedLabel(page)).toBe('Dialogue');

  const project = await exportProject(page);
  const lines = project.scriptLines ?? [];
  const ben = lines.findIndex((line) => line.type === 'character' && line.text === 'BEN');
  expect(lines[ben].dual).toBe(true);
  expect(lines.slice(ben + 1, ben + 3).map((line) => [line.type, line.text])).toEqual([
    ['dialogue', 'No'],
    ['dialogue', '.'],
  ]);
  expect(lines.some((line) => line.type === 'scene' && /^INT\. VAULT/.test(line.text))).toBe(true);
});

test('Enter on an empty line opens the element list', async ({ page }) => {
  await createExampleProject(page, `Element list ${Date.now()}`);
  await page.locator('#tab-script').click();
  await page.getByText('Screenplay', { exact: true }).click();
  const lastLine = page.locator('[data-line-input]').last();
  await lastLine.click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  // The new line is empty: Enter offers the elements; 3 picks Character.
  await page.keyboard.press('Enter');
  await expect(page.getByRole('listbox', { name: 'Element (1–7)' })).toBeVisible();
  await page.keyboard.press('3');
  await expect(page.getByRole('listbox', { name: 'Element (1–7)' })).toBeHidden();
  await expect.poll(() => focusedLabel(page)).toBe('Character cue');
  // Esc closes the list without changing the line.
  await page.keyboard.press('Enter');
  await expect(page.getByRole('listbox', { name: 'Element (1–7)' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox', { name: 'Element (1–7)' })).toBeHidden();
  expect(await focusedLabel(page)).toBe('Character cue');
});
