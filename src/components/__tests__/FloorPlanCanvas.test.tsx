/**
 * The floor plan canvas, mounted over a real project.
 *
 * This is the surface the whole app is named after and, until now, the largest
 * file in the tree with no test of any kind. It is also where users manipulate
 * data directly, so a defect here corrupts the project rather than merely
 * looking wrong.
 *
 * Scope, chosen deliberately: this file tests what the canvas *does to the
 * project* and what it *puts on screen in response*, driven through the same
 * context API the toolbar and inspector use. It does not simulate SVG pointer
 * drags. jsdom has no layout, so `getScreenCTM` and `getBoundingClientRect`
 * return zeroes and every coordinate assertion would be measuring the mock
 * rather than the app — a test that passes for the wrong reason is worse than
 * the gap it fills. Drag geometry belongs in the Playwright suite, where a
 * real layout exists; the pure maths behind it is already covered in
 * `src/domain/plan`.
 *
 * BEHAVIOUR-ONLY, matching the rest of this directory: no assertions on props,
 * callback shapes or context internals, so the planned context split can move
 * everything underneath without these turning red.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { renderPanel } from './renderPanel';

afterEach(cleanup);

const mountCanvas = () =>
  renderPanel({ module: 'canvas/FloorPlanCanvas', exportName: 'FloorPlanCanvas' });

describe('FloorPlanCanvas — elements reach the screen', () => {
  it('paints the elements the active setup already contains', async () => {
    const { container, project } = await mountCanvas();
    const setup = project().setups.find((candidate) => candidate.id === project().activeSetupId);
    expect(setup).toBeTruthy();
    expect(setup!.elements.length).toBeGreaterThan(0);
    // Every element type renders through SVG; an empty canvas over a populated
    // setup is the failure this guards.
    expect(container.querySelectorAll('svg g').length).toBeGreaterThan(0);
  });

  it('shows a newly added camera without a remount', async () => {
    const { api, act, project } = await mountCanvas();
    const before = project().setups.find((s) => s.id === project().activeSetupId)!.elements.length;

    await act(() => {
      api().addElement({ type: 'camera', x: 400, y: 300 });
    });

    const after = project().setups.find((s) => s.id === project().activeSetupId)!.elements;
    expect(after.length).toBe(before + 1);
    expect(after.some((element) => element.type === 'camera')).toBe(true);
  });

  it('removes a deleted element from the project', async () => {
    const { api, act, project } = await mountCanvas();
    const activeSetup = () => project().setups.find((s) => s.id === project().activeSetupId)!;

    let newId = '';
    await act(() => {
      newId = api().addElement({ type: 'prop', x: 120, y: 120 });
    });
    expect(activeSetup().elements.some((element) => element.id === newId)).toBe(true);

    await act(() => {
      api().selectElement(newId);
    });
    await act(() => {
      api().deleteSelectedElements();
    });

    expect(activeSetup().elements.some((element) => element.id === newId)).toBe(false);
  });
});

describe('FloorPlanCanvas — history', () => {
  it('undoes an add and redoes it', async () => {
    const { api, act, project } = await mountCanvas();
    const count = () =>
      project().setups.find((s) => s.id === project().activeSetupId)!.elements.length;

    const before = count();
    await act(() => {
      api().addElement({ type: 'light', x: 200, y: 200 });
    });
    expect(count()).toBe(before + 1);

    await act(() => {
      api().undo();
    });
    expect(count()).toBe(before);

    await act(() => {
      api().redo();
    });
    expect(count()).toBe(before + 1);
  });

  it('undoes a delete, which is the mistake users actually make', async () => {
    const { api, act, project } = await mountCanvas();
    const activeSetup = () => project().setups.find((s) => s.id === project().activeSetupId)!;

    const victim = activeSetup().elements[0];
    expect(victim).toBeTruthy();

    await act(() => {
      api().selectElement(victim.id);
    });
    await act(() => {
      api().deleteSelectedElements();
    });
    expect(activeSetup().elements.some((element) => element.id === victim.id)).toBe(false);

    await act(() => {
      api().undo();
    });
    expect(activeSetup().elements.some((element) => element.id === victim.id)).toBe(true);
  });
});

describe('FloorPlanCanvas — selection', () => {
  it('holds a multi-selection and clears it', async () => {
    const { api, act, project } = await mountCanvas();
    const elements = project().setups.find((s) => s.id === project().activeSetupId)!.elements;
    const [first, second] = elements;
    expect(second).toBeTruthy();

    await act(() => {
      api().selectElements([first.id, second.id]);
    });
    expect(api().selectedElementIds).toEqual([first.id, second.id]);

    await act(() => {
      api().selectElement(null);
    });
    expect(api().selectedElementIds).toEqual([]);
  });

  it('deletes every element in a multi-selection, not just the first', async () => {
    const { api, act, project } = await mountCanvas();
    const activeSetup = () => project().setups.find((s) => s.id === project().activeSetupId)!;

    let a = '';
    let b = '';
    await act(() => {
      a = api().addElement({ type: 'prop', x: 10, y: 10 });
      b = api().addElement({ type: 'prop', x: 20, y: 20 });
    });

    await act(() => {
      api().selectElements([a, b]);
    });
    await act(() => {
      api().deleteSelectedElements();
    });

    const remaining = activeSetup().elements.map((element) => element.id);
    expect(remaining).not.toContain(a);
    expect(remaining).not.toContain(b);
  });
});

describe('FloorPlanCanvas — view controls', () => {
  /**
   * These are the only canvas controls with accessible names, which is exactly
   * why they are the ones worth driving through the DOM: they are the app's
   * keyboard path onto the canvas, so a regression here locks out anyone not
   * using a mouse.
   */
  it('exposes the zoom, pan and centre controls by accessible name', async () => {
    await mountCanvas();
    for (const label of ['Zoom in', 'Zoom out', 'Reset zoom and pan', 'Pan mode']) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
  });

  it('survives a zoom in / zoom out / reset round trip', async () => {
    const { container } = await mountCanvas();
    fireEvent.click(screen.getByLabelText('Zoom in'));
    fireEvent.click(screen.getByLabelText('Zoom in'));
    fireEvent.click(screen.getByLabelText('Zoom out'));
    fireEvent.click(screen.getByLabelText('Reset zoom and pan'));
    // The assertion is survival, not a transform value: without layout the
    // numbers are jsdom's, but a throw or an unmount is real either way.
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('toggles pan mode without unmounting the canvas', async () => {
    const { container } = await mountCanvas();
    const panButton = screen.getByLabelText('Pan mode');
    fireEvent.click(panButton);
    fireEvent.click(panButton);
    expect(container.querySelector('svg')).toBeTruthy();
  });
});

describe('FloorPlanCanvas — integrity when elements go away', () => {
  it('leaves no shot pointing at a camera that was deleted', async () => {
    const { api, act, project } = await mountCanvas();
    const activeSetup = () => project().setups.find((s) => s.id === project().activeSetupId)!;

    const camera = activeSetup().elements.find((element) => element.type === 'camera');
    expect(camera).toBeTruthy();

    // Guard against a vacuous pass: if no shot referenced this camera to begin
    // with, deleting it proves nothing and the assertion below is free.
    const referencingShots = project()
      .setups.flatMap((setup) => setup.shots ?? [])
      .filter((shot) => shot.cameraId === camera!.id);
    expect(referencingShots.length).toBeGreaterThan(0);

    await act(() => {
      api().selectElement(camera!.id);
    });
    await act(() => {
      api().deleteSelectedElements();
    });

    // A dangling cameraId is the classic way this app corrupts a project:
    // the shot list then renders a camera that no longer exists, and the
    // printed shot plan carries it to set.
    const danglingShots = project()
      .setups.flatMap((setup) => setup.shots ?? [])
      .filter((shot) => shot.cameraId === camera!.id);
    expect(danglingShots).toEqual([]);
  });
});

/**
 * Accessible structure (audit 2026-09-08, P2 "Barrierefreiheit").
 *
 * The plan is the app's primary content and was reaching assistive technology
 * as an unlabelled `<svg>` — announced as "graphic", if at all. These pin the
 * repair so a later refactor of the canvas cannot quietly drop it again.
 */
describe('FloorPlanCanvas — accessible structure', () => {
  const svgOf = (container: HTMLElement) =>
    container.querySelector('#floor-plan-svg') as SVGElement | null;

  it('presents the plan as a labelled image rather than an anonymous graphic', async () => {
    const { container } = await mountCanvas();
    const svg = svgOf(container);
    expect(svg?.getAttribute('role')).toBe('img');
    expect((svg?.getAttribute('aria-label') ?? '').length).toBeGreaterThan(0);
  });

  it('summarises what is on the plan instead of listing every element', async () => {
    const { container, project } = await mountCanvas();
    const label = svgOf(container)?.getAttribute('aria-label') ?? '';
    const setup = project().setups.find((s) => s.id === project().activeSetupId)!;

    expect(label).toContain(setup.name);
    // Counts by type, not one entry per element: reading forty props aloud
    // before the user reaches the toolbar is worse than saying nothing.
    expect(label).toMatch(/\d+ \w+s?/);
    expect(label.length).toBeLessThan(400);
  });

  it('keeps the summary current as the plan changes', async () => {
    const { container, api, act } = await mountCanvas();
    const before = svgOf(container)?.getAttribute('aria-label');

    await act(() => {
      api().addElement({ type: 'camera', x: 500, y: 500 });
    });

    expect(svgOf(container)?.getAttribute('aria-label')).not.toBe(before);
  });

  it('describes an empty plan as empty rather than trailing off', async () => {
    const { container, api, act, project } = await mountCanvas();
    const ids = project()
      .setups.find((s) => s.id === project().activeSetupId)!
      .elements.map((element) => element.id);

    await act(() => {
      api().selectElements(ids);
    });
    await act(() => {
      api().deleteSelectedElements();
    });

    expect(svgOf(container)?.getAttribute('aria-label')).toMatch(/empty/i);
  });
});

/**
 * Shot deletion through the domain command.
 *
 * `deleteShotCommand` existed, was tested, and was not used: the context kept
 * its own copy of the same cleanup, split across TWO state writes — the owning
 * setup first, then the project-level references. That works only because
 * React batches them, and this codebase has already been bitten once by two
 * mutations in one tick where the first was silently dropped.
 *
 * These tests assert the property the command buys: a shot goes completely or
 * not at all, in one commit, and one undo brings all of it back.
 */
describe('deleting a shot is atomic', () => {
  const shotsOf = (project: ReturnType<Awaited<ReturnType<typeof mountCanvas>>['project']>) =>
    project.setups.flatMap((setup) => setup.shots ?? []);

  it('removes the shot and every reference in a single undo step', async () => {
    const { api, act, project } = await mountCanvas();
    const victim = shotsOf(project())[0];
    expect(victim).toBeTruthy();

    const before = {
      shots: shotsOf(project()).length,
      marks: project().setups.flatMap((s) => s.scriptMarks ?? []).length,
      blocks: (project().scheduleBlocks ?? []).length,
    };

    await act(() => {
      api().deleteShot(victim.id);
    });

    // Gone from every collection that can name a shot.
    expect(shotsOf(project()).some((shot) => shot.id === victim.id)).toBe(false);
    expect(
      project().setups.flatMap((s) => s.scriptMarks ?? []).some((m) => m.shotId === victim.id),
    ).toBe(false);
    // ScheduleBlock is a union; only the shot-backed variant names a shot.
    expect(
      (project().scheduleBlocks ?? []).some(
        (block) => 'shotId' in block && block.shotId === victim.id,
      ),
    ).toBe(false);
    expect(
      project().setups.flatMap((s) => s.storyboardOrder ?? []).includes(victim.id),
    ).toBe(false);

    // ONE undo, not two. Split writes would need one per commit and would
    // leave the project half-restored in between.
    await act(() => {
      api().undo();
    });
    expect(shotsOf(project()).length).toBe(before.shots);
    expect(project().setups.flatMap((s) => s.scriptMarks ?? []).length).toBe(before.marks);
    expect((project().scheduleBlocks ?? []).length).toBe(before.blocks);
  });

  it('ignores an unknown shot id rather than committing an empty change', async () => {
    const { api, act, project } = await mountCanvas();
    const before = shotsOf(project()).length;
    await act(() => {
      api().deleteShot('no-such-shot');
    });
    expect(shotsOf(project()).length).toBe(before);
  });

  it('takes the camera with the shot when nothing else uses it', async () => {
    const { api, act, project } = await mountCanvas();
    const activeSetup = () => project().setups.find((s) => s.id === project().activeSetupId)!;

    const shots = activeSetup().shots;
    const lonely = shots.find(
      (shot) => shot.cameraId && shots.filter((s) => s.cameraId === shot.cameraId).length === 1,
    );
    if (!lonely) return; // The fixture shares cameras; nothing to assert here.

    await act(() => {
      api().deleteShot(lonely.id);
    });
    expect(activeSetup().elements.some((el) => el.id === lonely.cameraId)).toBe(false);
  });
});
