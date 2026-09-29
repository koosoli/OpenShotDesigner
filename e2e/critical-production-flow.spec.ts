import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { Project } from '../src/types';
import { CURRENT_PROJECT_SCHEMA_VERSION } from '../src/domain/migrations';

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
  // JSON takes an explicit switch; .osd is pre-selected.
  const dialog = page.getByRole('dialog', { name: 'Save project file format' });
  await dialog.getByLabel(/JSON/).check();
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
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

const showProductionReadiness = async (page: Page) => {
  await page.getByRole('button', { name: 'Viewing Options' }).click();
  await page.getByLabel('Show Production Readiness').check();
  await page.getByRole('button', { name: 'Close viewing & opacity controls' }).click();
  await expect(page.getByTitle('Open production readiness')).toBeVisible();
};

// Review notes are opt-in chrome: hidden until switched on in Viewing Options.
const showReviewNotes = async (page: Page) => {
  await page.getByRole('button', { name: 'Viewing Options' }).click();
  await page.getByLabel('Show Review Notes').check();
  await page.getByRole('button', { name: 'Close viewing & opacity controls' }).click();
  await expect(page.getByRole('button', { name: /Review · \d/ })).toBeVisible();
};

/**
 * Wait for the autosave durability boundary before a reload assertion.
 *
 * Autosave is debounced by ~300 ms so canvas gestures do not serialize the
 * whole production on every pointer move. `markSavePending()` now flips the
 * indicator to `saving` immediately, but the write itself still lands after
 * the debounce + IndexedDB round-trip — so a bare
 * `expect(Saved locally)` can pass on the *previous* save and a fast reload
 * loses the edit. One helper keeps the three reload tests honest.
 */
const expectDurableSave = async (page: Page) => {
  await page.waitForTimeout(500);
  await expect(page.getByText('Saved locally')).toBeVisible();
};

test.beforeEach(async ({ context }) => {
  await context.clearCookies();
  // Chrome strings are translated (DE/EN toggle); pin English so role/text
  // assertions stay deterministic regardless of runner locale.
  await context.addInitScript(() => {
    try {
      localStorage.setItem('openshotdesigner_lang', 'en');
    } catch {}
  });
});

test('creates and restores a project from browser storage', async ({ page }) => {
  const title = `E2E Persistence ${Date.now()}`;
  await createExampleProject(page, title);
  await expect(page.getByText('Saved locally')).toBeVisible();

  await page.reload();

  await expect(page.locator('input[title="Click to rename project"]')).toHaveValue(title);
  await expect(page.getByRole('button', { name: 'Open live shot tracker' })).toBeVisible();
});

test('viewfinder visualises lens and sensor framing changes', async ({ page }) => {
  await createExampleProject(page, `E2E Optics ${Date.now()}`);
  await page.getByRole('button', { name: 'Viewfinder', exact: true }).click();
  const viewfinder = page.getByRole('dialog', { name: /Director's Optical Viewfinder/ });
  await expect(viewfinder).toBeVisible();
  await viewfinder.getByRole('button', { name: '50mm', exact: true }).click();
  const comparison = viewfinder.getByTestId('optical-framing-comparison');
  await expect(comparison).toBeVisible();
  await expect(comparison).toContainText('TIGHTER');
  await expect(comparison).toContainText('24mm/Super35');
  await viewfinder.getByLabel('Sensor').selectOption('FullFrame');
  await expect(comparison).toContainText('WIDER');
  await expect(comparison).toContainText('50mm/FullFrame');
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
  await expectDurableSave(page);

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
  expect(migrated.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
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

test('global command center finds production entities and readiness links to their module', async ({ page }) => {
  await createExampleProject(page, `Command center ${Date.now()}`);
  await expect(page.getByTitle('Open production readiness')).toBeHidden();
  await showProductionReadiness(page);
  await page.getByRole('button', { name: /Templates/ }).click();
  const fillExamples = page.getByRole('button', { name: /Fill empty modules with examples/ });
  await fillExamples.click();
  await expect(fillExamples).toBeHidden();

  await page.keyboard.press('Control+K');
  const commands = page.getByRole('dialog', { name: 'Global command center' });
  await expect(commands).toBeVisible();
  await commands.getByPlaceholder(/Search shots, scenes, people/).fill('1/1');
  await expect(commands.getByText(/^1\/1 —/).first()).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(commands).toBeHidden();

  await page.getByTitle('Open production readiness').click();
  const readiness = page.getByRole('dialog', { name: 'Production readiness' });
  await expect(readiness).toBeVisible();
  await expect(readiness.getByRole('button', { name: /Open (power|budget|continuity|schedule)/ }).first()).toBeVisible();
  await readiness.getByRole('button', { name: 'Close readiness' }).click();
  await expect(readiness).toBeHidden();
});

test('review notes survive reload and project storage exports a native .osd package', async ({ page }) => {
  const title = `Review package ${Date.now()}`;
  const note = `@DP — verify the 50mm option ${Date.now()}`;
  await createExampleProject(page, title);

  await expect(page.getByRole('button', { name: /Review · \d/ })).toBeHidden();
  await showReviewNotes(page);
  await page.getByRole('button', { name: /Review · 0/ }).click();
  let review = page.getByRole('dialog', { name: 'Review notes' });
  await review.getByPlaceholder('@DP — 50mm instead?').fill(note);
  await review.getByRole('button', { name: 'Add note' }).click();
  await expect(review.getByText(note, { exact: true })).toBeVisible();
  await review.getByRole('button', { name: 'Close review notes' }).click();
  await expect(page.getByRole('button', { name: /Review · 1/ })).toBeVisible();
  await expectDurableSave(page);

  await page.reload();
  await page.getByRole('button', { name: /Review · 1/ }).click();
  review = page.getByRole('dialog', { name: 'Review notes' });
  await expect(review.getByText(note, { exact: true })).toBeVisible();
  await review.getByRole('button', { name: 'Close review notes' }).click();

  await page.getByRole('button', { name: 'All projects (dashboard)' }).click();
  await page.getByRole('button', { name: 'Storage', exact: true }).click();
  const storage = page.getByRole('dialog', { name: 'Browser media storage' });
  await expect(storage.getByText('Stored files', { exact: true })).toBeVisible();
  await expect(storage.getByText('Missing referenced files', { exact: true })).toBeVisible();
  await storage.getByRole('button', { name: 'Close storage inspector' }).click();

  // Chromium exposes the File System Access picker in headed environments.
  // Force the product's documented browser-download fallback so CI can verify
  // the resulting portable file without interacting with a native OS dialog.
  await page.evaluate(() => {
    Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true });
  });
  const downloadPromise = page.waitForEvent('download');
  // Scoped to the dashboard: the top bar carries a same-named save button behind the overlay.
  const dashboard = page.locator('#project-dashboard');
  await dashboard.getByRole('button', { name: 'Save project file' }).first().click();
  // .osd is pre-selected; JSON takes an explicit switch.
  await dashboard.getByRole('dialog', { name: 'Save project file format' }).getByRole('button', { name: 'Save', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.osd$/);
  const path = await download.path();
  expect(path).toBeTruthy();
});

test('dismissed readiness findings remain recoverable after reload', async ({ page }) => {
  await createExampleProject(page, `Readiness dismissal ${Date.now()}`);
  await showProductionReadiness(page);
  const fixture = await exportProject(page);
  fixture.id = `readiness-e2e-${Date.now()}`;
  fixture.title = 'Readiness dismissal fixture';
  fixture.productionDays = [{
    id: 'dismiss-day',
    name: 'Day Dismiss',
    date: '',
    crewCall: '',
    scheduleBlockIds: [],
  }];
  await importProject(page, fixture);

  await page.getByTitle('Open production readiness').click();
  let readiness = page.getByRole('dialog', { name: 'Production readiness' });
  await expect(readiness.getByText('Day Dismiss is not ready to issue')).toBeVisible();
  await readiness.getByRole('button', { name: 'Dismiss Day Dismiss is not ready to issue' }).click();
  await expect(readiness.getByText('Day Dismiss is not ready to issue')).toBeHidden();
  await expect(readiness.getByRole('button', { name: 'Show 1 dismissed' })).toBeVisible();
  await readiness.getByRole('button', { name: 'Close readiness' }).click();

  await expectDurableSave(page);
  await page.reload();
  await expect(page.getByTitle('Open production readiness')).toContainText('1 hidden');
  await page.getByTitle('Open production readiness').click();
  readiness = page.getByRole('dialog', { name: 'Production readiness' });
  await readiness.getByRole('button', { name: 'Show 1 dismissed' }).click();
  await readiness.getByRole('button', { name: 'Restore Day Dismiss is not ready to issue' }).click();
  await expect(readiness.getByText('Day Dismiss is not ready to issue')).toBeVisible();
});

test('destructive confirm dialog aborts on cancel and proceeds on confirm', async ({ page }) => {
  // Previously a native window.confirm: untestable and invisible in headless
  // runs. The in-app dialog must guard the wipe both ways.
  await createExampleProject(page, `Dialog guard ${Date.now()}`);
  await page.locator('#tab-script').click();
  const clearButton = page.getByTitle('Clear screenplay');
  await expect(clearButton).toBeVisible();

  await clearButton.click();
  const dialog = page.getByRole('alertdialog', { name: 'Clear screenplay?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTitle('Clear screenplay')).toBeVisible();

  await clearButton.click();
  await expect(page.getByRole('alertdialog', { name: 'Clear screenplay?' })).toBeVisible();
  await page.getByRole('alertdialog', { name: 'Clear screenplay?' }).getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(page.getByTitle('Clear screenplay')).toBeHidden();
});

test('shot list downloads as a real PDF file', async ({ page }) => {
  await createExampleProject(page, `PDF export ${Date.now()}`);
  await page.getByRole('button', { name: /Shot list/ }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Shotliste als PDF exportieren' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  expect(await download.path()).toBeTruthy();
});
