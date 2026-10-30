import { expect, test } from '@playwright/test';

test('rotation guides let clicks reach the selected actor while the rotation knob remains interactive', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder('Production title (e.g. The Long Walk Home)').fill('Rotation hit testing');
  await page.getByLabel(/Start with the example scenes/).uncheck();
  await page.getByRole('button', { name: 'Full Production', exact: true }).click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.locator('.actor-element').first().getByText('A', { exact: true }).click();
  await expect(page.getByLabel('Element Name / Label', { exact: true })).toBeVisible();

  // Test an actual painted point on the stalk: text bounding-box centres vary
  // between browser platforms and previously hid this click interception locally.
  const point = await page.locator('.transform-controls > line[x1="0"][y1="0"]').evaluate((element) => {
    const line = element as SVGLineElement;
    const point = line.getPointAtLength(1).matrixTransform(line.getScreenCTM()!);
    return { x: point.x, y: point.y };
  });
  expect(await page.evaluate(({ x, y }) => Boolean(document.elementFromPoint(x, y)?.closest('.actor-element')), point)).toBe(true);
  await page.mouse.click(point.x, point.y);
  await expect(page.getByLabel('Element Name / Label', { exact: true })).toBeVisible();

  const knob = page.locator('.transform-controls > g.cursor-grab');
  const box = await knob.locator('circle').first().boundingBox();
  expect(box).not.toBeNull();
  expect(await page.evaluate(({ x, y }) => Boolean(document.elementFromPoint(x, y)?.closest('.cursor-grab')), {
    x: box!.x + box!.width / 2, y: box!.y + box!.height / 2,
  })).toBe(true);
});
