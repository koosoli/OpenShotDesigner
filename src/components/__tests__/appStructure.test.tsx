/**
 * The app's document structure, as assistive technology sees it.
 *
 * This exists because the repair it guards is invisible. `jsx-a11y` checks
 * attributes on elements that are there; nothing checks for an element that
 * should be there and is not. The heading, the landmarks and the skip link
 * added in the 2026-09-08 accessibility pass could all be deleted by an
 * innocent-looking refactor of `App.tsx` — the app would look identical, every
 * other test would stay green, and a screen-reader user would silently lose
 * the only way to navigate it.
 *
 * So these assert the shape, not the styling: one h1 naming the production,
 * a main landmark for the plan, a named landmark for each region, and a way
 * past the toolbars with the keyboard.
 *
 * Deliberately structural rather than exhaustive. This is not an audit — an
 * audit belongs in a real browser with a real screen reader, and jsdom cannot
 * substitute for one. It is a tripwire on four specific things that were added
 * on purpose and would otherwise be easy to remove by accident.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { resetStorage } from './renderPanel';

afterEach(cleanup);

/**
 * Mount the whole app.
 *
 * Same fresh-module trick `renderPanel` uses, and for the same reason:
 * `projectLibrary` caches the open project in a module-level map behind an
 * `initialized` flag, so wiping IndexedDB alone is not enough to isolate a run.
 */
const mountApp = async () => {
  await resetStorage();
  vi.resetModules();
  const { default: App } = await import('../../App');

  const result = render(<App />);
  await waitFor(() => expect(document.getElementById('app-root')).toBeTruthy());
  // Wait for the asynchronous project restore to land, not merely for the
  // shell to mount. Asserting on the tree mid-restore measures a frame the
  // user never sees and makes the whole file flaky.
  await waitFor(
    () => expect((document.querySelector('h1')?.textContent ?? '').trim().length).toBeGreaterThan(0),
    { timeout: 5000 },
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return result;
};

/**
 * Close the dashboard so the workspace is the visible surface.
 *
 * An empty library means a first run, which opens on the dashboard — a
 * full-screen overlay. Both surfaces have a legitimate claim to the h1, and
 * they used to render one each at the same time.
 */
const closeDashboard = async (container: HTMLElement) => {
  // On a genuine first run the library is empty, so there is deliberately no
  // way back to the workspace — the dashboard is the whole app until a
  // production exists. So do what the user does: create one.
  const field = container.querySelector<HTMLInputElement>(
    'input[placeholder^="Production title"]',
  );
  expect(field, 'no production title field on the dashboard').toBeTruthy();

  await act(async () => {
    fireEvent.change(field!, { target: { value: 'Structure Test Production' } });
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  const create = [...container.querySelectorAll('button')].find(
    (button) => (button.textContent ?? '').trim().toLowerCase() === 'create',
  );
  expect(create, 'no create button on the dashboard').toBeTruthy();
  await act(async () => {
    create!.click();
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  await waitFor(() => expect(container.querySelector('main')).toBeTruthy());
};

describe('app document structure', () => {
  it('shows exactly one top-level heading on the dashboard', async () => {
    const { container } = await mountApp();
    // First run opens on the dashboard. It owns the h1 while it is the visible
    // surface — two at once is what this guards, and is what shipped before.
    const headings = container.querySelectorAll('h1');
    expect(headings).toHaveLength(1);
    expect((headings[0].textContent ?? '').trim().length).toBeGreaterThan(0);
  });

  it('names the production in exactly one top-level heading in the workspace', async () => {
    const { container, ...rest } = await mountApp();
    await closeDashboard(container as HTMLElement);

    const headings = container.querySelectorAll('h1');
    expect(headings).toHaveLength(1);
    // Not just non-empty: it has to be the production, or it is not orienting
    // anyone.
    const title = (headings[0].textContent ?? '').trim();
    expect(title.length).toBeGreaterThan(0);
    expect(title).not.toMatch(/your productions/i);
    void rest;
  });

  it('marks the floor plan as the main landmark', async () => {
    const { container } = await mountApp();
    const main = container.querySelector('main');
    expect(main).toBeTruthy();
    expect(main?.getAttribute('aria-label')).toBe('Floor plan');
    // Focusable so the skip link has somewhere to land.
    expect(main?.getAttribute('tabindex')).toBe('-1');
  });

  it('gives every landmark an accessible name', async () => {
    const { container } = await mountApp();
    const landmarks = [...container.querySelectorAll('header, aside, main, nav')];
    expect(landmarks.length).toBeGreaterThanOrEqual(3);

    // An unnamed landmark is announced as "banner" or "complementary" with no
    // hint of what is inside — worse than useless when there are two of them.
    const unnamed = landmarks
      .filter((node) => !node.getAttribute('aria-label') && !node.getAttribute('aria-labelledby'))
      .map((node) => node.tagName.toLowerCase());
    expect(unnamed).toEqual([]);
  });

  it('offers a skip link that targets the main region', async () => {
    const { container } = await mountApp();
    const skip = container.querySelector('a[href^="#"]');
    expect(skip).toBeTruthy();

    const target = (skip?.getAttribute('href') ?? '').slice(1);
    expect(target.length).toBeGreaterThan(0);
    // The link must actually resolve; a skip link to a missing id is a dead
    // control that only keyboard users ever discover.
    expect(container.querySelector(`#${target}`)).toBeTruthy();
    expect(container.querySelector(`#${target}`)?.tagName.toLowerCase()).toBe('main');
  });

  it('puts the skip link first in the tab order', async () => {
    const { container } = await mountApp();
    const focusable = container.querySelectorAll<HTMLElement>(
      'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    // Anywhere but first and it stops being a skip link: the user has already
    // tabbed through the chrome by the time they reach it.
    expect(focusable[0]?.tagName.toLowerCase()).toBe('a');
    expect(focusable[0]?.getAttribute('href')?.startsWith('#')).toBe(true);
  });

  it('keeps the skip link out of the visual layout until focused', async () => {
    const { container } = await mountApp();
    const skip = container.querySelector('a[href^="#"]');
    // `sr-only` is what keeps it invisible to sighted users; losing it would
    // put a stray link above the toolbar.
    expect(skip?.className).toContain('sr-only');
    expect(skip?.className).toContain('focus:not-sr-only');
  });
});
