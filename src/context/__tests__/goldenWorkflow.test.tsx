/**
 * The money path, end to end: plan a scene, schedule it, shoot it, export it.
 *
 * Every other suite tests a layer. This one tests that the layers still line up
 * — that a shot created on the floor plan is the shot the schedule sees, that
 * the day the schedule holds is the day the continuity log filters by, and that
 * what finally reaches DaVinci Resolve describes the same shot the user
 * planned. Those joins are where this codebase's real defects have been, and
 * nothing that tests one layer at a time can see them.
 *
 * It runs against the real provider in jsdom rather than a browser. That is a
 * deliberate trade: it exercises the whole data path without a browser
 * dependency, but it does not prove anything about rendering, layout or the
 * download itself. The Resolve import at the far end stays a manual gate in
 * `docs/regression-checklist.md`; no test in this repo can press that button.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup } from '@testing-library/react';
import { mountProvider, run, activeSetupOf } from './providerHarness';
import { exportResolveCsv, seedNextTake, RESOLVE_METADATA_COLUMNS } from '../../domain/continuity';
import { continuitySourcesFrom } from '../../utils/exportContinuityCsv';
import type { Take } from '../../domain/continuity';

afterEach(cleanup);

describe('plan → schedule → shoot → export', () => {
  it('carries one shot the whole way to the Resolve CSV', async () => {
    const { result } = await mountProvider();

    // --- Plan: a shot on the floor plan, with the lens the DP asked for.
    let shotId = '';
    await run(() => {
      shotId = result.current.addShot({ name: 'Master on the sofa', lensMm: 32 });
    });
    const planned = activeSetupOf(result.current).shots.find((shot) => shot.id === shotId);
    expect(planned?.lensMm).toBe(32);

    // --- Schedule: a day that covers this setup.
    const setupId = activeSetupOf(result.current).id;
    await run(() => {
      result.current.updateProjectMeta({
        productionDays: [
          { id: 'day-1', name: 'Day 1', date: '2026-09-14', scheduleBlockIds: ['block-1'] },
        ],
        scheduleBlocks: [{ id: 'block-1', kind: 'setup', setupId }],
        continuityDayFilterId: 'day-1',
        productionCompany: 'Test Films',
        people: [
          { id: 'p-sound', displayName: 'Sound Person', role: 'Sound Mixer' },
          { id: 'p-script', displayName: 'Script Person', role: 'Script Supervisor' },
        ],
      } as Parameters<typeof result.current.updateProjectMeta>[0]);
    });

    // --- Shoot: two takes, the second one good, shot on a longer lens than planned.
    await run(() => {
      const first = seedNextTake([], {
        id: 'take-1',
        shotId,
        productionDayId: 'day-1',
        loggedAt: '2026-09-14T09:00:00Z',
      }).take;
      const second = seedNextTake([first], {
        id: 'take-2',
        shotId,
        productionDayId: 'day-1',
        loggedAt: '2026-09-14T09:05:00Z',
        previous: first,
      }).take;

      const takes: Take[] = [
        { ...first, fileName: 'A001C001.mov', isGoodTake: false, comments: 'Boom in shot' },
        {
          ...second,
          fileName: 'A001C002.mov',
          isGoodTake: true,
          comments: 'Print',
          keywords: ['sofa', 'master'],
          cameraOverrides: { focalMm: 85, iso: 800 },
        },
      ];
      result.current.updateProjectMeta({ takes });
    });

    // --- Export: the bytes that would reach the media pool.
    const csv = exportResolveCsv(
      result.current.project.takes ?? [],
      continuitySourcesFrom(result.current.project),
    );
    const [header, ...rows] = csv.trimEnd().split('\r\n');
    const columns = (row: string) =>
      Object.fromEntries(
        RESOLVE_METADATA_COLUMNS.map((name, index) => [
          name,
          (row.match(/("([^"]|"")*"|[^,]*)(,|$)/g) ?? [])[index]
            ?.replace(/,$/, '')
            .replace(/^"|"$/g, ''),
        ]),
      );

    expect(header).toBe(RESOLVE_METADATA_COLUMNS.join(','));
    expect(rows).toHaveLength(2);

    const ng = columns(rows[0]);
    const good = columns(rows[1]);

    // The shot planned on the floor plan is the shot in the metadata.
    expect(good.Shot).toBe(planned?.shotNumber);
    expect(good.Description).toBe('Master on the sofa');
    // The day the schedule holds is the date on the clip.
    expect(good['Date Recorded']).toBe('2026_09_14');
    // Crew resolved from the crew list, not from the legacy free-text fields.
    expect(good['Sound Mixer']).toBe('Sound Person');
    expect(good['Script Supervisor']).toBe('Script Person');
    expect(good['Production Company']).toBe('Test Films');
    // Take numbering, and the good/NG flag as 1 and 0 rather than true/false.
    expect(ng.Take).toBe('1');
    expect(good.Take).toBe('2');
    expect(ng['Good Take']).toBe('0');
    expect(good['Good Take']).toBe('1');
    // What was actually shot wins over what was planned…
    expect(good['Focal Point (mm)']).toBe('85mm');
    expect(good.ISO).toBe('800');
    // …and the take that overrode nothing still reports the plan.
    expect(ng['Focal Point (mm)']).toBe('32mm');
    // Keywords survive as one quoted field rather than shifting the columns.
    expect(rows[1]).toContain('"sofa, master"');
  });

  /**
   * The other half of the day: the checklist has to agree with the log, since
   * they are the same document. A shot with a good take is covered; one with
   * only NG takes is the shot an AD chases at wrap.
   */
  it('reports the wrap gaps that match the log', async () => {
    const { result } = await mountProvider();

    let covered = '';
    let missed = '';
    await run(() => {
      covered = result.current.addShot({ name: 'Got it' });
    });
    await run(() => {
      missed = result.current.addShot({ name: 'Never got it' });
    });

    const setupId = activeSetupOf(result.current).id;
    await run(() => {
      result.current.updateProjectMeta({
        productionDays: [
          { id: 'day-1', name: 'Day 1', date: '2026-09-14', scheduleBlockIds: ['block-1'] },
        ],
        scheduleBlocks: [{ id: 'block-1', kind: 'setup', setupId }],
        takes: [
          { id: 't1', shotId: covered, takeNumber: 1, productionDayId: 'day-1', isGoodTake: true },
          { id: 't2', shotId: missed, takeNumber: 1, productionDayId: 'day-1', isGoodTake: false },
        ],
      } as Parameters<typeof result.current.updateProjectMeta>[0]);
    });

    const { dayChecklist } = await import('../../domain/continuity');
    const checklist = dayChecklist(
      ['block-1'],
      result.current.project.scheduleBlocks ?? [],
      { setups: result.current.project.setups },
      result.current.project.takes ?? [],
      'day-1',
    );

    expect(checklist.planned.find((entry) => entry.shotId === covered)?.covered).toBe(true);
    expect(checklist.noGoodTake.map((entry) => entry.shotId)).toContain(missed);
    expect(checklist.notShot.map((entry) => entry.shotId)).not.toContain(covered);
  });
});
