import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { Project } from '../src/types';

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
  await page.getByRole('button', { name: 'Save & Download Project JSON' }).click();
  const download = await downloadPromise;
  const path = await download.path();
  if (!path) throw new Error('The browser did not expose the downloaded project file.');
  return JSON.parse(await readFile(path, 'utf8')) as Project;
};

const importProject = async (page: Page, project: Project) => {
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open / Import Project JSON' }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: `${project.id}.json`,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(page.locator('input[title="Click to rename project"]')).toHaveValue(project.title);
};

test.beforeEach(async ({ context }) => {
  await context.clearCookies();
});

test('creates and restores a project from browser storage', async ({ page }) => {
  const title = `E2E Persistence ${Date.now()}`;
  await createExampleProject(page, title);
  await expect(page.getByText('Saved locally')).toBeVisible();

  await page.reload();

  await expect(page.locator('input[title="Click to rename project"]')).toHaveValue(title);
  await expect(page.getByRole('button', { name: 'Open live shot tracker' })).toBeVisible();
});

test('GOOD take drives On-set coverage and the Continuity checklist', async ({ page }) => {
  await createExampleProject(page, `E2E On-set ${Date.now()}`);

  await page.getByRole('button', { name: /Templates/ }).click();
  const fillExamples = page.getByRole('button', { name: /Fill empty modules with examples/ });
  await fillExamples.click();
  await expect(fillExamples).toBeHidden();

  await page.getByRole('button', { name: 'Open live shot tracker' }).click();
  const onSet = page.getByRole('dialog', { name: 'On-set mode' });
  await expect(onSet).toBeVisible();
  await expect(onSet.getByText(/0 covered · 0 attempted · \d+ remaining/)).toBeVisible();

  await onSet.getByRole('button', { name: 'Good', exact: true }).click();
  await expect(onSet.getByText(/1 covered · 0 attempted · \d+ remaining/)).toBeVisible();
  await onSet.getByRole('button', { name: /Exit on-set mode/ }).click();
  await expect(page.getByText('Saved locally')).toBeVisible();

  // Reload proves the take was persisted rather than only reflected in local UI state.
  await page.reload();
  await page.getByRole('button', { name: 'Open live shot tracker' }).click();
  await expect(page.getByRole('dialog', { name: 'On-set mode' }).getByText(/1 covered/)).toBeVisible();
  await page.getByRole('dialog', { name: 'On-set mode' }).getByRole('button', { name: /Exit on-set mode/ }).click();

  await page.getByRole('button', { name: 'Production', exact: true }).click();
  await page.getByRole('button', { name: 'Continuity', exact: true }).click();
  await expect(page.getByText(/(?:Shooting-day|Whole-production) checklist/)).toBeVisible();
  await expect(page.getByText('1 take', { exact: true }).first()).toBeVisible();
});

test('imports an older project, migrates it and restores it after reload', async ({ page }) => {
  await createExampleProject(page, `Migration source ${Date.now()}`);
  const legacy = await exportProject(page);
  legacy.id = `legacy-e2e-${Date.now()}`;
  legacy.title = 'Migrated legacy production';
  legacy.schemaVersion = 30;

  const legacyLight = legacy.setups
    .flatMap((setup) => setup.elements)
    .find((element) => element.type === 'light');
  if (!legacyLight || legacyLight.type !== 'light') throw new Error('Example project has no light fixture.');
  legacyLight.hasBarnDoors = true;
  legacyLight.modifiers = undefined;

  await importProject(page, legacy);
  await expect(page.getByText('Saved locally')).toBeVisible();
  await page.reload();
  await expect(page.locator('input[title="Click to rename project"]')).toHaveValue(legacy.title);

  const migrated = await exportProject(page);
  const migratedLight = migrated.setups
    .flatMap((setup) => setup.elements)
    .find((element) => element.id === legacyLight.id);
  expect(migrated.schemaVersion).toBe(32);
  expect(migratedLight?.type === 'light' ? migratedLight.modifiers : undefined)
    .toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'barn_doors' })]));
});

test('deleting a shot removes schedule, storyboard, script and take references', async ({ page }) => {
  await createExampleProject(page, `Delete source ${Date.now()}`);
  const fixture = await exportProject(page);
  fixture.id = `delete-e2e-${Date.now()}`;
  fixture.title = 'Delete reference fixture';
  const setup = fixture.setups.find((entry) => entry.id === fixture.activeSetupId) ?? fixture.setups[0];
  const target = setup.shots[0];
  target.storyboardImage = 'data:image/png;base64,AA==';
  setup.storyboardOrder = [target.id, ...setup.shots.slice(1).map((shot) => shot.id)];
  fixture.takes = [{ id: 'delete-take', shotId: target.id, takeNumber: 1, isGoodTake: true }];
  fixture.scriptLines = (fixture.scriptLines ?? []).map((line, index) =>
    index === 0 ? { ...line, linkedShotId: target.id } : line,
  );
  fixture.scheduleBlocks = [
    ...(fixture.scheduleBlocks ?? []),
    { id: 'delete-strip', kind: 'shots', shotIds: [target.id] },
  ];
  fixture.productionDays = (fixture.productionDays ?? []).map((day, index) =>
    index === 0 ? { ...day, scheduleBlockIds: [...day.scheduleBlockIds, 'delete-strip'] } : day,
  );

  await importProject(page, fixture);
  await page.getByRole('button', { name: /Shot list/ }).click();
  await page.getByRole('button', { name: 'Delete Shot', exact: true }).first().click();
  await expect(page.getByText('Saved locally')).toBeVisible();

  const cleaned = await exportProject(page);
  const cleanedSetup = cleaned.setups.find((entry) => entry.id === setup.id)!;
  expect(cleanedSetup.shots.some((shot) => shot.id === target.id)).toBe(false);
  expect(cleanedSetup.storyboardOrder).not.toContain(target.id);
  expect(cleaned.takes?.some((take) => take.shotId === target.id)).toBe(false);
  expect(cleaned.scriptLines?.some((line) => line.linkedShotId === target.id)).toBe(false);
  expect(cleaned.scheduleBlocks?.some((block) => block.kind === 'shots' && block.shotIds.includes(target.id))).toBe(false);
  expect(cleaned.productionDays?.some((day) => day.scheduleBlockIds.includes('delete-strip'))).toBe(false);
});

test('a multi-role crew member has one crew row on the call sheet', async ({ page }) => {
  await createExampleProject(page, `Call sheet source ${Date.now()}`);
  const fixture = await exportProject(page);
  fixture.id = `call-sheet-e2e-${Date.now()}`;
  fixture.title = 'Multi-role call sheet';
  fixture.people = [{
    id: 'multi-role-crew',
    displayName: 'Alex Morgan',
    kind: 'crew',
    department: 'Lighting / Electric',
    role: 'Gaffer / Key Grip',
    phone: '+49 170 123',
  }];
  fixture.castAssignments = [];

  await importProject(page, fixture);
  await page.getByRole('button', { name: 'Production', exact: true }).click();
  await page.getByRole('button', { name: 'Schedule', exact: true }).click();
  await page.getByRole('button', { name: 'Call sheets', exact: true }).click();

  const preview = page.locator('article');
  await expect(preview.getByText('Gaffer / Key Grip', { exact: true })).toBeVisible();
  const crewSection = preview.getByRole('heading', { name: 'Crew', exact: true }).locator('..');
  await expect(crewSection.getByText('Alex Morgan', { exact: true })).toHaveCount(1);
  const headsSection = preview.getByRole('heading', { name: 'Heads of department' }).locator('..');
  await expect(headsSection.getByText('Alex Morgan', { exact: true })).toHaveCount(2);
  await expect(headsSection.getByText('Gaffer', { exact: true })).toBeVisible();
  await expect(headsSection.getByText('Key Grip', { exact: true })).toBeVisible();
});
