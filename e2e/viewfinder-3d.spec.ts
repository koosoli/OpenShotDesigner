import { expect, test } from '@playwright/test';

test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });

test('renders the 3D camera frame, reframes with the lens and saves it to the storyboard', async ({ page }) => {
  test.slow(); // Software WebGL and canvas readback can take longer on shared runners.
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('Production title (e.g. The Long Walk Home)').fill('3D Viewfinder');
  await page.getByLabel(/Start with the example scenes/).check();
  await page.getByRole('button', { name: 'Full Production', exact: true }).click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByRole('button', { name: 'Viewfinder', exact: true }).click();
  const finder = page.getByRole('dialog', { name: /Director's Optical Viewfinder/ });
  const scene = finder.getByRole('img', { name: '3D camera view' });
  await expect(scene).toBeVisible();
  const image = () => scene.evaluate((element) => (element as HTMLCanvasElement).toDataURL());
  const wide = await image();
  await finder.getByRole('button', { name: '50mm', exact: true }).click();
  expect(await image()).not.toBe(wide);

  await finder.getByRole('combobox', { name: 'Ratio', exact: true }).selectOption('9:16');
  await finder.getByRole('button', { name: '14mm', exact: true }).click();
  await expect(scene).toHaveAttribute('height', '960');
  await expect(scene).toHaveAttribute('width', '540');
  const hasScenePixels = await scene.evaluate((element) => {
    const sample = document.createElement('canvas');
    sample.width = sample.height = 16;
    const ctx = sample.getContext('2d')!;
    ctx.drawImage(element as HTMLCanvasElement, 0, 0, 16, 16);
    return ctx.getImageData(0, 0, 16, 16).data.some((value, index) => index % 4 !== 3 && value > 32);
  });
  expect(hasScenePixels).toBe(true);
  await finder.getByRole('button', { name: 'Board this frame', exact: true }).click();
  const board = finder.getByRole('img', { name: /^Storyboard for shot/ });
  await expect(board).toBeVisible();
  await expect.poll(() => board.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBe(540);
  await finder.getByRole('button', { name: 'Board', exact: true }).click();
  await expect(scene).toBeVisible();
});
