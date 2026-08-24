import { describe, expect, it } from 'vitest';
import { UNNAMED_ROLL, cameraReport, soundReport } from '../continuity/setReports';
import type { ContinuitySources } from '../continuity';
import type { Take } from '../continuity';

const SOURCES: ContinuitySources = {
  title: 'The Long Wait',
  setups: [
    {
      id: 'setup1',
      sceneNumber: '4',
      location: 'INT. KITCHEN',
      timeOfDay: 'Day INT',
      elements: [
        {
          id: 'cam1',
          type: 'camera',
          cameraLabel: 'A',
          cameraModel: 'ARRI Alexa 35',
          aperture: 'f/2.8',
          iso: 800,
          shutterAngle: 180,
          ndFilter: 'ND 0.6',
        },
      ],
      shots: [
        {
          id: 'shot1',
          sceneNumber: '4',
          shotNumber: '4A',
          cameraId: 'cam1',
          cameraLabel: 'A',
          lensMm: 35,
          frameRate: 25,
          framingDescription: 'Wide on the table',
        },
        {
          id: 'shot2',
          sceneNumber: '4',
          shotNumber: '4B',
          cameraId: 'cam1',
          cameraLabel: 'A',
          lensMm: 75,
          frameRate: 25,
          framingDescription: 'CU Jenna',
        },
      ],
    },
  ],
};

let counter = 0;
const take = (partial: Partial<Take> & { shotId: string }): Take => ({
  id: `t${(counter += 1)}`,
  takeNumber: 1,
  ...partial,
});

describe('cameraReport', () => {
  it('groups takes by camera card in first-use order', () => {
    const report = cameraReport(
      [
        take({ shotId: 'shot1', rollCard: 'A002' }),
        take({ shotId: 'shot1', rollCard: 'A001' }),
        take({ shotId: 'shot2', rollCard: 'A002' }),
      ],
      SOURCES,
    );
    // Not sorted: cards are used in a sequence and the report is read in it.
    // Alphabetical would also put A010 before A002 the day a shoot reaches ten.
    expect(report.rolls.map((roll) => roll.roll)).toEqual(['A002', 'A001']);
    expect(report.rolls[0].rows).toHaveLength(2);
  });

  it('resolves camera values the way the Resolve export does', () => {
    const report = cameraReport([take({ shotId: 'shot2', rollCard: 'A001' })], SOURCES);
    const row = report.rolls[0].rows[0];
    expect(row.scene).toBe('4');
    expect(row.shot).toBe('4B');
    expect(row.lens).toBe('75mm');
    expect(row.shutter).toBe('1/50');
    expect(row.iso).toBe('800');
    expect(row.aperture).toBe('f/2.8');
    expect(row.description).toBe('CU Jenna');
  });

  it('honours a take override over the plan', () => {
    const report = cameraReport(
      [take({ shotId: 'shot2', rollCard: 'A001', cameraOverrides: { iso: 1600, focalMm: 100 } })],
      SOURCES,
    );
    const row = report.rolls[0].rows[0];
    expect(row.iso).toBe('1600');
    expect(row.lens).toBe('100mm');
  });

  it('files a take with no card under an explicitly unnamed roll', () => {
    // Dropping it would lose a take that happened; filing it under the last
    // named card would say the footage is somewhere it is not.
    const report = cameraReport([take({ shotId: 'shot1' })], SOURCES);
    expect(report.rolls[0].roll).toBe(UNNAMED_ROLL);
    expect(report.rolls[0].unnamed).toBe(true);
  });

  it('leaves out a wild track: no camera rolled', () => {
    const report = cameraReport(
      [take({ shotId: 'shot1', rollCard: 'A001' }), take({ shotId: 'shot1', wildTrack: true })],
      SOURCES,
    );
    expect(report.totalRows).toBe(1);
  });

  it('keeps an MOS take and flags it', () => {
    const report = cameraReport([take({ shotId: 'shot1', rollCard: 'A001', mos: true })], SOURCES);
    expect(report.rolls[0].rows[0].mos).toBe(true);
  });

  it('counts good and NG separately from unjudged', () => {
    const report = cameraReport(
      [
        take({ shotId: 'shot1', rollCard: 'A001', isGoodTake: true }),
        take({ shotId: 'shot1', rollCard: 'A001', isGoodTake: false }),
        take({ shotId: 'shot1', rollCard: 'A001' }),
      ],
      SOURCES,
    );
    expect(report.rolls[0].goodCount).toBe(1);
    expect(report.rolls[0].ngCount).toBe(1);
    expect(report.rolls[0].rows[2].isGoodTake).toBeUndefined();
    expect(report.totalRows).toBe(3);
    expect(report.totalGood).toBe(1);
  });
});

describe('soundReport', () => {
  it('groups by sound roll, not by camera card', () => {
    // The reason the two reports are two functions: they roll over on
    // different schedules, and a shared implementation has to pick one.
    const report = soundReport(
      [
        take({ shotId: 'shot1', rollCard: 'A001', soundRoll: 'S01' }),
        take({ shotId: 'shot1', rollCard: 'A002', soundRoll: 'S01' }),
      ],
      SOURCES,
    );
    expect(report.rolls).toHaveLength(1);
    expect(report.rolls[0].roll).toBe('S01');
  });

  it('keeps an MOS take as a row that says no sound was recorded', () => {
    // A take missing from the report and a take marked MOS look the same to a
    // machine and completely different to a person: the first sends an
    // assistant hunting for a file, the second tells them not to.
    const report = soundReport(
      [take({ shotId: 'shot1', soundRoll: 'S01', mos: true })],
      SOURCES,
    );
    expect(report.rolls[0].rows[0].mos).toBe(true);
    expect(report.totalRows).toBe(1);
  });

  it('keeps a wild track, which the camera report drops', () => {
    const report = soundReport(
      [take({ shotId: 'shot1', soundRoll: 'S01', wildTrack: true })],
      SOURCES,
    );
    expect(report.rolls[0].rows[0].wildTrack).toBe(true);
  });

  it("prefers the mixer's note to the scripty's", () => {
    const report = soundReport(
      [
        take({
          shotId: 'shot1',
          soundRoll: 'S01',
          comments: 'she stumbles on the line',
          soundNotes: 'aircraft over the last third',
        }),
      ],
      SOURCES,
    );
    expect(report.rolls[0].rows[0].notes).toBe('aircraft over the last third');
  });

  it("falls back to the scripty's note rather than printing nothing", () => {
    const report = soundReport(
      [take({ shotId: 'shot1', soundRoll: 'S01', comments: 'she stumbles on the line' })],
      SOURCES,
    );
    expect(report.rolls[0].rows[0].notes).toBe('she stumbles on the line');
  });

  it('carries the slate values the camera report shows', () => {
    const report = soundReport([take({ shotId: 'shot2', soundRoll: 'S01' })], SOURCES);
    expect(report.rolls[0].rows[0].scene).toBe('4');
    expect(report.rolls[0].rows[0].shot).toBe('4B');
  });
});
