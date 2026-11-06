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
  const lighting = finder.getByRole('checkbox', { name: 'Simulate lighting', exact: true });
  await lighting.check();
  expect(await image()).not.toBe(wide);
  const dim = await image();
  await finder.getByRole('slider', { name: 'Ambient light', exact: true }).fill('0.7');
  expect(await image()).not.toBe(dim);
  await lighting.uncheck();
  expect(await image()).toBe(wide);
  const tilt = finder.getByRole('slider', { name: 'Tilt', exact: true });
  await tilt.press('PageDown');
  expect(Number(await tilt.inputValue())).toBeLessThan(0);
  expect(await image()).not.toBe(wide);
  await finder.getByRole('button', { name: 'Reset tilt', exact: true }).click();
  await expect(tilt).toHaveValue('0');
  await finder.getByRole('button', { name: '50mm', exact: true }).click();
  expect(await image()).not.toBe(wide);

  await finder.getByRole('combobox', { name: 'Ratio', exact: true }).selectOption('9:16');
  await finder.getByRole('button', { name: '14mm', exact: true }).click();
  await tilt.press('PageDown');
  await expect(scene).toHaveAttribute('height', '1920');
  await expect(scene).toHaveAttribute('width', '1080');
  const hasScenePixels = await scene.evaluate((element) => {
    const sample = document.createElement('canvas');
    sample.width = sample.height = 16;
    const ctx = sample.getContext('2d')!;
    ctx.drawImage(element as HTMLCanvasElement, 0, 0, 16, 16);
    return ctx.getImageData(0, 0, 16, 16).data.some((value, index) => index % 4 !== 3 && value > 32);
  });
  expect(hasScenePixels).toBe(true);
  // The saved image must contain the lit virtual frame, including the final lens and tilt.
  const unlitSource = await image();
  await lighting.check();
  const capturedSource = await image();
  await finder.getByRole('button', { name: 'Board this frame', exact: true }).click();
  const board = finder.getByRole('img', { name: /^Storyboard for shot/ });
  await expect(board).toBeVisible();
  await expect.poll(() => board.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBe(720);
  const errors = await board.evaluate(async (element, sources) => {
    const sample = (image: CanvasImageSource) => {
      const buffer = document.createElement('canvas'); buffer.width = buffer.height = 32;
      const ctx = buffer.getContext('2d')!;
      ctx.drawImage(image, 0, 0, 32, 32); return ctx.getImageData(0, 0, 32, 32).data;
    };
    const stored = sample(element as HTMLImageElement);
    const difference = async (source: string) => {
      const image = new Image(); image.src = source; await image.decode();
      const pixels = sample(image);
      return pixels.reduce((sum, value, index) => sum + (index % 4 === 3 ? 0 : (value - stored[index]) ** 2), 0);
    };
    return { lit: await difference(sources.lit), unlit: await difference(sources.unlit) };
  }, { lit: capturedSource, unlit: unlitSource });
  expect(errors.lit).toBeLessThan(errors.unlit);
  await finder.getByRole('button', { name: 'Board', exact: true }).click();
  await expect(scene).toBeVisible();
  expect(await image()).toBe(capturedSource);
  await finder.getByRole('button', { name: 'Close the viewfinder', exact: true }).click();
  await page.getByRole('button', { name: 'Live 3D', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Live 3D view' }).getByLabel('Simulate lighting', { exact: true })).toBeChecked();
});
