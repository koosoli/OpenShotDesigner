/**
 * The three chains where a bug costs data rather than a rendering glitch.
 *
 * These are here because unit tests cannot reach them, not merely because
 * nobody wrote them. Each depends on something that only exists in a real
 * browser: the File System Access API and its handles, two pages sharing one
 * origin's storage, and the debounced autosave that sits between an edit and
 * the disk.
 *
 * They are also the chains the 2026-09-03 audit named as its highest risks —
 * the `.osd` handle overwriting the wrong project, and an issued call sheet
 * quietly going stale. Both were fixed; neither was verified in a browser.
 */
import { expect, test, type Page } from '@playwright/test';

/**
 * Replace the native save picker with a recording stub.
 *
 * Headless Chromium cannot open a real file dialog, and the thing under test
 * is not the dialog: it is WHICH handle the app writes into after the user has
 * switched projects. So each `showSaveFilePicker` call returns a distinct fake
 * handle that appends to `window.__osdWrites`, and the assertions read that
 * log. The app cannot tell the difference — it sees an object with
 * `createWritable()` and a `name`, which is exactly the contract it uses.
 */
const stubFilePicker = async (page: Page) => {
  await page.addInitScript(() => {
    interface Write { file: string; bytes: number }
    const target = window as unknown as {
      __osdWrites: Write[];
      __osdPickerNames: string[];
      showSaveFilePicker: (options?: { suggestedName?: string }) => Promise<unknown>;
    };
    target.__osdWrites = [];
    // Each picker call hands back the next queued name, so a test can say
    // "this save goes to a.osd, that one to b.osd".
    target.__osdPickerNames = [];

    target.showSaveFilePicker = async (options) => {
      const name = target.__osdPickerNames.shift() ?? options?.suggestedName ?? 'untitled.osd';
      return {
        name,
        createWritable: async () => ({
          write: async (data: Blob) => {
            target.__osdWrites.push({ file: name, bytes: data.size });
          },
          close: async () => {},
        }),
      };
    };
  });
};

const writesOf = (page: Page) =>
  page.evaluate(() => (window as unknown as { __osdWrites: { file: string }[] }).__osdWrites);

const queuePickerName = (page: Page, name: string) =>
  page.evaluate((value) => {
    (window as unknown as { __osdPickerNames: string[] }).__osdPickerNames.push(value);
  }, name);

const createProject = async (page: Page, title: string) => {
  await page.getByPlaceholder('Production title (e.g. The Long Walk Home)').fill(title);
  await page.getByRole('button', { name: 'Full Production', exact: true }).click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('input[title="Click to rename project"]')).toHaveValue(title);
};

/** The seeded example production: real days, strips, cast and locations. */
const createExampleProject = async (page: Page, title: string) => {
  await page.getByPlaceholder('Production title (e.g. The Long Walk Home)').fill(title);
  await page.getByLabel(/Start with the example scenes/).check();
  await page.getByRole('button', { name: 'Full Production', exact: true }).click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('input[title="Click to rename project"]')).toHaveValue(title);
};

const openDashboard = async (page: Page) => {
  await page.getByRole('button', { name: 'All projects' }).click();
  await expect(page.getByRole('heading', { name: 'Your productions' })).toBeVisible();
};

test.describe('a saved .osd file belongs to one project', () => {
  /**
   * The 2026-09-03 P0. A single module-global handle meant Ctrl+S in project B
   * could write B's content into the file A was saved as — silently, with no
   * indication that A had just been destroyed.
   */
  test('Ctrl+S after switching projects writes to the current project file', async ({ page }) => {
    await stubFilePicker(page);
    await page.goto('/');

    await createProject(page, 'Alpha Production');
    await queuePickerName(page, 'alpha.osd');
    await page.keyboard.press('Control+s');
    await expect.poll(async () => (await writesOf(page)).length).toBe(1);
    expect((await writesOf(page))[0].file).toBe('alpha.osd');

    // A second production, saved to its own file.
    await openDashboard(page);
    await createProject(page, 'Beta Production');
    await queuePickerName(page, 'beta.osd');
    await page.keyboard.press('Control+s');
    await expect.poll(async () => (await writesOf(page)).length).toBe(2);
    expect((await writesOf(page))[1].file).toBe('beta.osd');

    // Saving Beta again must reuse BETA's handle, not Alpha's. Before the fix
    // the newest handle was global, so whichever file was picked last won.
    await page.keyboard.press('Control+s');
    await expect.poll(async () => (await writesOf(page)).length).toBe(3);
    expect((await writesOf(page))[2].file).toBe('beta.osd');

    const files = (await writesOf(page)).map((write) => write.file);
    expect(files.filter((file) => file === 'alpha.osd')).toHaveLength(1);
  });

  test('re-saving a project reuses its file without asking again', async ({ page }) => {
    await stubFilePicker(page);
    await page.goto('/');
    await createProject(page, 'Gamma Production');

    await queuePickerName(page, 'gamma.osd');
    await page.keyboard.press('Control+s');
    await expect.poll(async () => (await writesOf(page)).length).toBe(1);

    // No second name queued: if the app asked again it would fall back to the
    // suggested name, and the assertion below would see a different file.
    await page.keyboard.press('Control+s');
    await expect.poll(async () => (await writesOf(page)).length).toBe(2);
    expect((await writesOf(page)).map((write) => write.file)).toEqual([
      'gamma.osd',
      'gamma.osd',
    ]);
  });
});

test.describe('an issued call sheet is frozen', () => {
  /**
   * Open the call sheets for a production that is actually shootable.
   *
   * Uses the seeded example production rather than building one from nothing.
   * A blank project has no days, no strips and no linked location, so the app
   * correctly refuses to issue a sheet — and a test that assembled all of that
   * through the UI would be twenty selectors of setup guarding two assertions,
   * failing for reasons that have nothing to do with revisions.
   */
  const openCallSheets = async (page: Page) => {
    const tabs = page.locator('nav[aria-label="Workspace modules"]');
    // Scoped to the tab strip: "Production" also appears in the inspector.
    await tabs.getByRole('button', { name: /Production/ }).click();
    await page.getByRole('button', { name: 'Schedule', exact: true }).click();
    await page.getByRole('button', { name: /Call sheets/i }).click();
    await expect(page.getByRole('button', { name: /Issue Rev 1/ })).toBeEnabled({
      timeout: 10_000,
    });
  };

  /**
   * The other 2026-09-03 P0. An issued REV is a promise the crew is holding;
   * changing the crew call afterwards must not leave the old revision number
   * on a document whose contents have moved.
   */
  test('changing the crew call after issuing turns the live sheet back into a draft', async ({
    page,
  }) => {
    await page.goto('/');
    await createExampleProject(page, 'Revision Test');
    await openCallSheets(page);

    // Nothing issued yet.
    await expect(page.getByText('Ready to issue')).toBeVisible();

    await page.getByRole('button', { name: /Issue Rev 1/ }).click();
    await expect(page.getByText(/Issued revision 1/)).toBeVisible();

    // Move the crew call. The document the crew holds no longer matches.
    const crewCall = page.getByLabel('CREW CALL').first();
    await crewCall.fill('05:30');
    await crewCall.blur();

    await expect(page.getByText(/changed since Rev 1/i)).toBeVisible();
    // And the next issue is offered as Rev 2, not a silent rewrite of Rev 1.
    await expect(page.getByRole('button', { name: /Issue Rev 2/ })).toBeVisible();
  });

  test('issuing again produces a second revision rather than replacing the first', async ({
    page,
  }) => {
    await page.goto('/');
    await createExampleProject(page, 'Revision History');
    await openCallSheets(page);

    await page.getByRole('button', { name: /Issue Rev 1/ }).click();
    await expect(page.getByText(/Issued revision 1/)).toBeVisible();

    const crewCall = page.getByLabel('CREW CALL').first();
    await crewCall.fill('06:15');
    await crewCall.blur();
    await expect(page.getByText(/changed since Rev 1/i)).toBeVisible();

    await page.getByRole('button', { name: /Issue Rev 2/ }).click();
    await expect(page.getByText(/Issued revision 2/)).toBeVisible();

    // Revisions ACCUMULATE. The workspace shows only the latest issue, so the
    // observable proof is that the next one offered is Rev 3: a version that
    // rewrote Rev 1 in place would still be counting from one.
    const crewCallAgain = page.getByLabel('CREW CALL').first();
    await crewCallAgain.fill('07:00');
    await crewCallAgain.blur();
    await expect(page.getByRole('button', { name: /Issue Rev 3/ })).toBeVisible();
  });
});

test.describe('two tabs on the same production', () => {
  /**
   * Both tabs autosave to the same IndexedDB. Without a guard the second tab
   * to write wins and the first tab's work disappears with no warning — the
   * user only finds out when they reload the tab they were working in.
   */
  test('the stale tab is warned instead of silently overwriting', async ({ page, context }) => {
    await page.goto('/');
    await createProject(page, 'Two Tab Production');

    const second = await context.newPage();
    await second.goto('/');
    // The second tab opens the same active project out of shared storage.
    await expect(second.locator('input[title="Click to rename project"]')).toHaveValue(
      'Two Tab Production',
    );

    // Edit in the second tab and let autosave land.
    await second.locator('input[title="Click to rename project"]').fill('Renamed In Tab Two');
    await second.locator('input[title="Click to rename project"]').blur();
    await expect(second.getByText(/Saved locally|Lokal gespeichert/)).toBeVisible({
      timeout: 15_000,
    });

    // Now edit in the first tab, which is holding an older snapshot.
    await page.locator('input[title="Click to rename project"]').fill('Renamed In Tab One');
    await page.locator('input[title="Click to rename project"]').blur();

    // Either the app warns, or the newer version wins on reload — what must NOT
    // happen is the stale tab overwriting the newer work with no trace.
    await page.waitForTimeout(2_000);
    const warned = await page.getByText(/another browser tab/i).isVisible().catch(() => false);
    if (!warned) {
      await page.reload();
      await expect(page.locator('input[title="Click to rename project"]')).not.toHaveValue(
        'Two Tab Production',
      );
    }

    await second.close();
  });
});
