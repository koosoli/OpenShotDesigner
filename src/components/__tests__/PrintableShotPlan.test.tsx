/**
 * The export studio — every document that actually leaves the building.
 *
 * `PrintableShotPlan` is 2.400 lines that render twenty different production
 * documents from one project, and it had no test. The failure mode this file
 * exists for is specific and expensive: a section throws or silently renders
 * empty, nobody notices in the app because nobody opens all twenty, and the
 * gap is discovered on a shooting day when the call sheet or the camera report
 * is the thing that was supposed to be in someone's hands.
 *
 * So the core of this file is coverage by breadth: mount the studio over a
 * real project, walk every section of the `ExportSection` union, and require
 * each to produce visible content without logging a React error. That is a
 * cheap test and it catches the expensive bug.
 *
 * BEHAVIOUR-ONLY, like its neighbours: assertions are on what a reader sees,
 * never on props or internal state.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { renderPanel } from './renderPanel';
import type { ExportSection } from '../../context/WorkspaceUIContext';

afterEach(cleanup);

/**
 * Every section the studio can show.
 *
 * Kept as a literal rather than derived from the type so that adding a member
 * to `ExportSection` without adding it here is caught by the exhaustiveness
 * check below instead of silently shrinking this suite.
 */
const SECTIONS: ExportSection[] = [
  'floorplan',
  'shotlist',
  'storyboard',
  'linedscript',
  'avscript',
  'sides',
  'scriptreports',
  'equipment',
  'dmx',
  'power',
  'rigging',
  'logistics',
  'runofshow',
  'continuity',
  'camerareport',
  'soundreport',
  'dailyprogress',
  'moodboard',
  'crew',
  'combined',
];

const openStudio = async (section: ExportSection) => {
  const rendered = await renderPanel({
    module: 'export/PrintableShotPlan',
    exportName: 'PrintableShotPlan',
  });
  await rendered.act(() => {
    rendered.ui().openExportModal(section);
  });
  return rendered;
};

describe('export studio — the modal itself', () => {
  it('renders nothing until it is opened', async () => {
    const { container } = await renderPanel({
      module: 'export/PrintableShotPlan',
      exportName: 'PrintableShotPlan',
    });
    // A closed modal that still paints would sit over the canvas invisibly and
    // swallow every click on it.
    expect(container.firstChild).toBeNull();
  });

  it('appears once a section is requested and closes again', async () => {
    const { container, act, ui } = await openStudio('shotlist');
    expect(container.firstChild).toBeTruthy();

    await act(() => {
      ui().closeExportModal();
    });
    expect(container.firstChild).toBeNull();
  });
});

describe.each(SECTIONS)('export section "%s"', (section) => {
  it('renders visible content over a real project without React errors', async () => {
    const errors: unknown[][] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...args) => {
      errors.push(args);
    });

    try {
      const { container } = await openStudio(section);

      expect(container.firstChild).toBeTruthy();
      // Not just a mounted shell: a section that renders only its chrome and
      // no document body is the empty-export bug this suite is here for.
      expect((container.textContent ?? '').trim().length).toBeGreaterThan(40);

      // React reports key collisions, invalid props and update-depth problems
      // through console.error rather than throwing, so a document can look
      // fine on screen while reporting a defect on every render.
      expect(errors).toEqual([]);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('export studio — section coverage is exhaustive', () => {
  it('lists every member of the ExportSection union', () => {
    // A new section added to the union without a row above would otherwise
    // ship untested. This fails to compile — not merely fails — when the two
    // fall out of step, because the record must name every member.
    const covered: Record<ExportSection, true> = {
      floorplan: true,
      shotlist: true,
      storyboard: true,
      linedscript: true,
      avscript: true,
      sides: true,
      scriptreports: true,
      equipment: true,
      dmx: true,
      power: true,
      rigging: true,
      logistics: true,
      runofshow: true,
      continuity: true,
      camerareport: true,
      soundreport: true,
      dailyprogress: true,
      moodboard: true,
      crew: true,
      combined: true,
    };
    expect(SECTIONS.slice().sort()).toEqual(Object.keys(covered).sort());
  });
});

describe('export studio — documents carry their production identity', () => {
  /**
   * A production document with no title is worse than no document: it reaches
   * set, nobody can tell which show or which day it belongs to, and it gets
   * filed against the wrong one.
   */
  it('prints the production title on the shot list', async () => {
    const { container, project } = await openStudio('shotlist');
    expect(container.textContent).toContain(project().title);
  });

  it('prints the production title on the combined package', async () => {
    const { container, project } = await openStudio('combined');
    expect(container.textContent).toContain(project().title);
  });

  it('stamps a generated date that does not depend on the exporter locale', async () => {
    const { container } = await openStudio('shotlist');
    // Pinned by `domain/documentFormat`; an ISO calendar date is the contract
    // every report view shares.
    expect(container.textContent).toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});
