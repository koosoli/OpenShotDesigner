import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Phone layout and accessibility, on a fresh example project.
 *
 * - At phone width nothing in the top bar or any module may run off the right
 *   edge where it cannot be reached (content inside a scroll container is fine).
 * - axe finds no serious or critical violations in any module, light or dark.
 */

const createExampleProject = async (page: Page, title: string) => {
  await page.goto('/');
  await page.getByPlaceholder('Production title (e.g. The Long Walk Home)').fill(title);
  await page.getByLabel(/Start with the example scenes/).check();
  await page.getByRole('button', { name: 'Full Production', exact: true }).click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('#top-navbar')).toBeVisible();
};

/** Elements that end past the viewport's right edge outside any scroll container (clipped = unreachable). */
const unreachable = (page: Page, rootSelector: string) =>
  page.evaluate((selector) => {
    const width = window.innerWidth;
    const root = document.querySelector(selector);
    if (!root) return ['(missing root)'];
    return [...root.querySelectorAll('*')]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 || rect.right <= width + 1) return false;
        for (let parent = element.parentElement; parent && parent !== root; parent = parent.parentElement) {
          const overflow = getComputedStyle(parent).overflowX;
          if (overflow === 'auto' || overflow === 'scroll') return false;
        }
        return true;
      })
      .slice(0, 5)
      .map((element) => `${element.tagName.toLowerCase()} "${(element.textContent ?? '').trim().slice(0, 30)}" ends at ${Math.round(element.getBoundingClientRect().right)}px`);
  }, rootSelector);

test.describe('phone layout', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('top bar and every module fit the screen', async ({ page }) => {
    await createExampleProject(page, 'Phone Layout');
    expect(await unreachable(page, '#top-navbar')).toEqual([]);

    const trigger = page.getByRole('button', { name: /^Production modules/ });
    await trigger.click();
    const menu = page.locator('#right-sidebar div.z-50').first();
    const menuBox = await menu.boundingBox();
    expect(menuBox && menuBox.x >= 0 && menuBox.x + menuBox.width <= 375).toBeTruthy();
    const modules = (await menu.getByRole('button').allTextContents()).map((text) => text.trim()).filter(Boolean);
    await page.keyboard.press('Escape');
    expect(modules.length).toBeGreaterThan(5);

    const problems: Record<string, string[]> = {};
    for (const name of modules) {
      await trigger.click();
      await menu.getByRole('button', { name, exact: true }).click();
      await page.waitForTimeout(250);
      const found = await unreachable(page, '#right-sidebar');
      if (found.length) problems[name] = found;
    }
    expect(problems).toEqual({});
  });
});

test.describe('accessibility', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`every module has no serious axe violations (${theme})`, async ({ page }) => {
      test.setTimeout(180_000);
      await page.addInitScript((value) => localStorage.setItem('cineplan_theme', value), theme);
      await createExampleProject(page, `Axe ${theme}`);

      const report: Record<string, string[]> = {};
      const scan = async (view: string) => {
        await page.waitForTimeout(250);
        // The plan canvas is a drawing surface, not a document. Contrast is
        // checked separately so pages drawn in user-picked colours (marked
        // data-user-colors) skip only that rule.
        const structure = await new AxeBuilder({ page }).exclude('canvas').disableRules(['color-contrast']).analyze();
        const contrast = await new AxeBuilder({ page }).exclude('canvas').exclude('[data-user-colors]').withRules(['color-contrast']).analyze();
        const serious = [...structure.violations, ...contrast.violations].filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
        if (serious.length) {
          report[view] = serious.map((violation) => `${violation.id} (${violation.nodes.length}): ${violation.nodes.slice(0, 3).map((node) => node.target.join(' ')).join(' | ')}`);
        }
      };

      await scan('plan');
      for (const id of ['shots', 'storyboard', 'script', 'equipment']) {
        await page.locator(`#tab-${id}`).click();
        await scan(id);
      }
      const trigger = page.getByRole('button', { name: /^Production modules/ });
      const menu = page.locator('#right-sidebar div.z-50').first();
      await trigger.click();
      const modules = (await menu.getByRole('button').allTextContents()).map((text) => text.trim()).filter(Boolean);
      await page.keyboard.press('Escape');
      for (const name of modules) {
        await trigger.click();
        await menu.getByRole('button', { name, exact: true }).click();
        await scan(name);
      }
      expect(report).toEqual({});
    });
  }
});
