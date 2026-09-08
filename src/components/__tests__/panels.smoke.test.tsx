/**
 * Every major panel, mounted over a real project.
 *
 * Deliberately shallow and deliberately broad. The deep behavioural tests live
 * next to the panels that carry the most risk; this file answers a different
 * question, for all of them at once: does the panel render at all against real
 * project data, and does it do so without throwing or logging errors?
 *
 * That question is worth asking on its own because the failure it catches is
 * the one that reaches users fastest. A panel that crashes on mount takes the
 * whole right-hand side of the app with it, and nothing in a domain test suite
 * looks at a panel. It is also the cheapest possible guard for a refactor of
 * the context: if `FloorPlanContext` stops providing something a panel reads,
 * every one of these fails at once and names the panel.
 *
 * A panel added without a row here is a panel nobody is watching.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { renderPanel } from './renderPanel';

afterEach(cleanup);

const PANELS: Array<{ module: string; exportName: string }> = [
  { module: 'shotlist/ShotListPanel', exportName: 'ShotListPanel' },
  { module: 'script/ScriptPanel', exportName: 'ScriptPanel' },
  { module: 'equipment/EquipmentPanel', exportName: 'EquipmentPanel' },
  { module: 'schedule/SchedulePanel', exportName: 'SchedulePanel' },
  { module: 'inspector/InspectorPanel', exportName: 'InspectorPanel' },
  { module: 'continuity/ContinuityPanel', exportName: 'ContinuityPanel' },
  { module: 'logistics/LogisticsPanel', exportName: 'LogisticsPanel' },
  { module: 'rigging/RiggingPanel', exportName: 'RiggingPanel' },
  { module: 'power/PowerPanel', exportName: 'PowerPanel' },
  { module: 'contacts/ContactsPanel', exportName: 'ContactsPanel' },
  { module: 'budget/BudgetPanel', exportName: 'BudgetPanel' },
  { module: 'locations/LocationsPanel', exportName: 'LocationsPanel' },
  { module: 'tasks/TaskBoardPanel', exportName: 'TaskBoardPanel' },
  { module: 'runofshow/RunOfShowPanel', exportName: 'RunOfShowPanel' },
  { module: 'storyboard/StoryboardPanel', exportName: 'StoryboardPanel' },
  { module: 'moodboard/MoodBoardPanel', exportName: 'MoodBoardPanel' },
  // The canvas is not a right-hand panel, but it is the surface that takes the
  // app down hardest when it throws on mount, and it was the largest file in
  // the tree with no test of any kind.
  { module: 'canvas/FloorPlanCanvas', exportName: 'FloorPlanCanvas' },
];

// ProjectDashboard is deliberately absent: it renders null unless
// `isDashboardOpen` is set, so a row here would assert that a closed overlay
// is closed. Its real coverage lives in ProjectDashboard.test.tsx.


describe.each(PANELS)('$module', ({ module, exportName }) => {
  it('mounts against a real project without errors', async () => {
    const errors: unknown[][] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...args) => {
      errors.push(args);
    });

    try {
      const { container, project } = await renderPanel({ module, exportName });

      // Rendered something, and rendered it from the real project.
      expect(container.firstChild).toBeTruthy();
      expect(project().setups.length).toBeGreaterThan(0);

      // React logs key warnings, invalid-prop warnings and update-depth errors
      // through console.error rather than throwing, so a panel can look fine
      // while quietly reporting a defect on every render.
      expect(errors).toEqual([]);
    } finally {
      spy.mockRestore();
    }
  });
});
