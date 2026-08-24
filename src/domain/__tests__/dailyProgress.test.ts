import { describe, expect, it } from 'vitest';
import {
  dailyProgressReport,
  formatPageEighths,
  formatSpan,
  plannedDayMinutes,
} from '../reports/dailyProgress';
import type { DailyProgressSources } from '../reports/dailyProgress';
import type { Take } from '../continuity';
import type { ProductionDay, ScheduleBlock } from '../scheduling';

const DAY: ProductionDay = {
  id: 'day1',
  name: 'Day 1',
  date: '2026-05-21',
  crewCall: '08:00',
  plannedWrap: '18:00',
  scheduleBlockIds: ['b4', 'b5'],
};

const BLOCKS: ScheduleBlock[] = [
  { id: 'b4', kind: 'setup', setupId: 'setup4', estimatedMinutes: 240 },
  { id: 'b5', kind: 'setup', setupId: 'setup5', estimatedMinutes: 180 },
];

const SOURCES: DailyProgressSources = {
  setups: [
    {
      id: 'setup4',
      sceneNumber: '4',
      shots: [
        { id: 's4a', shotNumber: '4A' },
        { id: 's4b', shotNumber: '4B' },
      ],
    },
    { id: 'setup5', sceneNumber: '5', shots: [{ id: 's5a', shotNumber: '5A' }] },
  ],
  scriptScenes: [
    { id: 'sc4', sceneNumber: '4', pageLengthEighths: 20 },
    { id: 'sc5', sceneNumber: '5', pageLengthEighths: 4 },
  ],
};

let counter = 0;
const take = (partial: Partial<Take> & { shotId: string }): Take => ({
  id: `t${(counter += 1)}`,
  takeNumber: 1,
  productionDayId: 'day1',
  ...partial,
});

/** An ISO instant at a UTC clock time on the shooting day. */
const at = (hour: number, minute = 0): string =>
  new Date(Date.UTC(2026, 4, 21, hour, minute)).toISOString();

describe('dailyProgressReport — what was scheduled', () => {
  it('counts the day’s scenes, setups and shots from the schedule', () => {
    const report = dailyProgressReport(DAY, BLOCKS, SOURCES, [], {});
    expect(report.scenesScheduled).toBe(2);
    expect(report.setupsScheduled).toBe(2);
    expect(report.shotsScheduled).toBe(3);
  });

  it('lists the scenes in schedule order, not numeric order', () => {
    const reversed: ProductionDay = { ...DAY, scheduleBlockIds: ['b5', 'b4'] };
    const report = dailyProgressReport(reversed, BLOCKS, SOURCES, [], {});
    expect(report.scenes.map((scene) => scene.sceneNumber)).toEqual(['5', '4']);
  });
});

describe('dailyProgressReport — what was covered', () => {
  const takes = [
    take({ shotId: 's4a', isGoodTake: false, loggedAt: at(9) }),
    take({ shotId: 's4a', takeNumber: 2, isGoodTake: true, loggedAt: at(9, 30) }),
    take({ shotId: 's4b', isGoodTake: true, loggedAt: at(12) }),
    take({ shotId: 's5a', loggedAt: at(16) }),
  ];

  it('counts a shot as covered only once a take is marked good', () => {
    const report = dailyProgressReport(DAY, BLOCKS, SOURCES, takes, {});
    expect(report.shotsCovered).toBe(2);
    // 5A has takes but nothing marked good — the shot an AD still worries about.
    expect(report.shotsAttempted).toBe(1);
    expect(report.shotsNotShot).toEqual([]);
  });

  it('completes a scene only when every planned shot in it is covered', () => {
    const report = dailyProgressReport(DAY, BLOCKS, SOURCES, takes, {});
    expect(report.scenes.find((scene) => scene.sceneNumber === '4')?.complete).toBe(true);
    expect(report.scenes.find((scene) => scene.sceneNumber === '5')?.complete).toBe(false);
    expect(report.scenesCompleted).toBe(1);
  });

  it('reports the shots that were never attempted', () => {
    const report = dailyProgressReport(DAY, BLOCKS, SOURCES, [takes[1]], {});
    expect(report.shotsNotShot.map((shot) => shot.shotNumber).sort()).toEqual(['4B', '5A']);
  });

  it('keeps a pickup out of the plan and reports it separately', () => {
    // A pickup silently joining the plan would hide the shot that was missed:
    // the day would just show one more covered row.
    const withPickup: DailyProgressSources = {
      ...SOURCES,
      setups: [
        {
          id: 'setup4',
          sceneNumber: '4',
          shots: [
            { id: 's4a', shotNumber: '4A' },
            { id: 's4b', shotNumber: '4B' },
            { id: 's4x', shotNumber: '4X', unplanned: true },
          ],
        },
        SOURCES.setups![1],
      ],
    };
    const report = dailyProgressReport(
      DAY,
      BLOCKS,
      withPickup,
      [...takes, take({ shotId: 's4x', isGoodTake: true, loggedAt: at(14) })],
      {},
    );
    expect(report.shotsScheduled).toBe(3);
    expect(report.shotsUnscheduled.map((shot) => shot.shotNumber)).toEqual(['4X']);
  });

  it('counts takes good, NG and unjudged apart', () => {
    const report = dailyProgressReport(DAY, BLOCKS, SOURCES, takes, {});
    expect(report.takesLogged).toBe(4);
    expect(report.takesGood).toBe(2);
    expect(report.takesNg).toBe(1);
  });

  it("ignores another day's takes", () => {
    const report = dailyProgressReport(
      DAY,
      BLOCKS,
      SOURCES,
      [...takes, take({ shotId: 's5a', productionDayId: 'day2', isGoodTake: true })],
      {},
    );
    expect(report.takesLogged).toBe(4);
  });
});

describe('dailyProgressReport — pages', () => {
  it('sums the eighths of the day’s scenes and of the ones completed', () => {
    const report = dailyProgressReport(
      DAY,
      BLOCKS,
      SOURCES,
      [take({ shotId: 's4a', isGoodTake: true }), take({ shotId: 's4b', isGoodTake: true })],
      {},
    );
    expect(report.pagesScheduledEighths).toBe(24);
    expect(report.pagesCoveredEighths).toBe(20);
  });

  it('reports pages as unknown when any scheduled scene has no length', () => {
    // A partial sum is the number most likely to be quoted at a production
    // meeting and the hardest to trace afterwards.
    const partial: DailyProgressSources = {
      ...SOURCES,
      scriptScenes: [{ id: 'sc4', sceneNumber: '4', pageLengthEighths: 20 }],
    };
    const report = dailyProgressReport(DAY, BLOCKS, partial, [], {});
    expect(report.pagesScheduledEighths).toBeNull();
    expect(report.pagesCoveredEighths).toBeNull();
  });

  it('reports pages as unknown for a project with no screenplay at all', () => {
    const { scriptScenes: _ignored, ...noScript } = SOURCES;
    const report = dailyProgressReport(DAY, BLOCKS, noScript, [], {});
    expect(report.pagesScheduledEighths).toBeNull();
    // Rule 1: the rest of the report still works without a script.
    expect(report.shotsScheduled).toBe(3);
  });
});

describe('dailyProgressReport — times and variance', () => {
  it('brackets the day by the first and last take logged', () => {
    const report = dailyProgressReport(
      DAY,
      BLOCKS,
      SOURCES,
      [
        take({ shotId: 's4a', loggedAt: at(9, 15) }),
        take({ shotId: 's4b', loggedAt: at(17, 45) }),
      ],
      { timeZone: 'UTC' },
    );
    expect(report.firstTakeAt).toBe('09:15');
    expect(report.lastTakeAt).toBe('17:45');
    expect(report.shootingSpanMinutes).toBe(510);
  });

  it('prints times in the zone the caller asks for', () => {
    const report = dailyProgressReport(
      DAY,
      BLOCKS,
      SOURCES,
      [take({ shotId: 's4a', loggedAt: at(9) }), take({ shotId: 's4b', loggedAt: at(17) })],
      { timeZone: 'Asia/Tokyo' },
    );
    expect(report.firstTakeAt).toBe('18:00');
  });

  it('reports no span from a single take', () => {
    const report = dailyProgressReport(
      DAY,
      BLOCKS,
      SOURCES,
      [take({ shotId: 's4a', loggedAt: at(9) })],
      { timeZone: 'UTC' },
    );
    expect(report.shootingSpanMinutes).toBeUndefined();
    expect(report.lastTakeAt).toBeUndefined();
  });

  it('measures variance against the strips that were actually completed', () => {
    // Setup 4 done (240 min estimated), setup 5 not. Span 09:00 to 14:00 is
    // 300 minutes, so the unit is an hour behind on the work it finished.
    const report = dailyProgressReport(
      DAY,
      BLOCKS,
      SOURCES,
      [
        take({ shotId: 's4a', isGoodTake: true, loggedAt: at(9) }),
        take({ shotId: 's4b', isGoodTake: true, loggedAt: at(14) }),
      ],
      { timeZone: 'UTC' },
    );
    expect(report.scheduleVarianceMinutes).toBe(60);
    expect(report.scheduleVarianceLabel).toBe('1h 00m behind');
  });

  it('says ahead when the work went faster than the estimate', () => {
    const report = dailyProgressReport(
      DAY,
      BLOCKS,
      SOURCES,
      [
        take({ shotId: 's4a', isGoodTake: true, loggedAt: at(9) }),
        take({ shotId: 's4b', isGoodTake: true, loggedAt: at(11) }),
      ],
      { timeZone: 'UTC' },
    );
    expect(report.scheduleVarianceLabel).toBe('2h 00m ahead');
  });

  it('calls a small difference on schedule rather than reporting noise', () => {
    const report = dailyProgressReport(
      DAY,
      BLOCKS,
      SOURCES,
      [
        take({ shotId: 's4a', isGoodTake: true, loggedAt: at(9) }),
        take({ shotId: 's4b', isGoodTake: true, loggedAt: at(13, 5) }),
      ],
      { timeZone: 'UTC' },
    );
    expect(report.scheduleVarianceLabel).toBe('on schedule');
  });

  it('reports variance as unknown when a completed strip has no estimate', () => {
    const noEstimate: ScheduleBlock[] = [
      { id: 'b4', kind: 'setup', setupId: 'setup4' },
      BLOCKS[1],
    ];
    const report = dailyProgressReport(
      DAY,
      noEstimate,
      SOURCES,
      [
        take({ shotId: 's4a', isGoodTake: true, loggedAt: at(9) }),
        take({ shotId: 's4b', isGoodTake: true, loggedAt: at(14) }),
      ],
      { timeZone: 'UTC' },
    );
    expect(report.scheduleVarianceMinutes).toBeNull();
    expect(report.scheduleVarianceLabel).toBeUndefined();
  });

  it('reports variance as unknown when nothing was completed', () => {
    // "On schedule" from a day where nothing was finished is the single most
    // misleading thing this report could say.
    const report = dailyProgressReport(
      DAY,
      BLOCKS,
      SOURCES,
      [
        take({ shotId: 's4a', loggedAt: at(9) }),
        take({ shotId: 's4b', loggedAt: at(14) }),
      ],
      { timeZone: 'UTC' },
    );
    expect(report.scheduleVarianceMinutes).toBeNull();
  });
});

describe('formatting helpers', () => {
  it('writes eighths the way a schedule does', () => {
    expect(formatPageEighths(20)).toBe('2 4/8');
    expect(formatPageEighths(8)).toBe('1');
    expect(formatPageEighths(3)).toBe('3/8');
    expect(formatPageEighths(0)).toBe('0');
  });

  it('shows unknown pages as a dash rather than as zero', () => {
    expect(formatPageEighths(null)).toBe('—');
    expect(formatPageEighths(undefined)).toBe('—');
  });

  it('formats a shooting span', () => {
    expect(formatSpan(510)).toBe('8h 30m');
    expect(formatSpan(undefined)).toBe('—');
  });

  it('measures the published day, including one that runs past midnight', () => {
    expect(plannedDayMinutes(DAY)).toBe(600);
    expect(
      plannedDayMinutes({ ...DAY, crewCall: '18:00', plannedWrap: '04:00' }),
    ).toBe(600);
    expect(plannedDayMinutes({ ...DAY, plannedWrap: 'TBC' })).toBeNull();
  });
});
