/**
 * Continuity log: file-name reconciliation, sticky columns, the day checklist,
 * and the Resolve CSV contract.
 *
 * The CSV header assertion reads the vendored template off disk rather than
 * restating it, because a test that repeats the constant only proves the
 * constant equals itself. Resolve fails silently on a header mismatch, so this
 * is the one place the failure becomes loud.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  RESOLVE_METADATA_COLUMNS,
  applyReconciliation,
  buildResolveRows,
  dayChecklist,
  escapeCsvField,
  fillSequentialFileNames,
  formatRecordedDate,
  nextFileName,
  nextTakeNumber,
  orphanedTakes,
  parseCardListing,
  reconcileFileNames,
  seedNextTake,
  serialiseResolveCsv,
  shutterSpeedFrom,
  takesCountFor,
  takesForDay,
} from '../continuity';
import type { Take } from '../continuity';
import type { ScheduleBlock } from '../scheduling';

const templatePath = path.resolve(process.cwd(), 'docs/resolve-metadata-template.csv');

const take = (overrides: Partial<Take> & Pick<Take, 'id' | 'shotId'>): Take => ({
  takeNumber: 1,
  ...overrides,
});

describe('nextFileName', () => {
  it('increments a trailing counter and keeps the padding width', () => {
    expect(nextFileName('C0001')).toBe('C0002');
    expect(nextFileName('A001C009')).toBe('A001C010');
    expect(nextFileName('1.MTS')).toBe('2.MTS');
    expect(nextFileName('MVI_1234.MOV')).toBe('MVI_1235.MOV');
  });

  it('widens the field only when the number outgrows it', () => {
    expect(nextFileName('C0009')).toBe('C0010');
    expect(nextFileName('9.MTS')).toBe('10.MTS');
    expect(nextFileName('C9999')).toBe('C10000');
  });

  it('increments the clip field, not the reel, in camera-original names', () => {
    // The rightmost digit run here is the 1 in R1AB — a different reel, and a
    // name that would match nothing in the media pool.
    expect(nextFileName('A001C002_230815_R1AB.mov')).toBe('A001C003_230815_R1AB.mov');
  });

  it('refuses to guess when there is no counter', () => {
    expect(nextFileName('MASTER.mov')).toBeNull();
    expect(nextFileName('')).toBeNull();
    expect(nextFileName(undefined)).toBeNull();
  });

  it('does not mistake the extension for a counter', () => {
    expect(nextFileName('CLIP.MP4')).toBeNull();
  });
});

describe('reconcileFileNames', () => {
  const takes = [
    { id: 't1' },
    { id: 't2' },
    { id: 't3' },
  ];

  it('pairs takes with card files in order', () => {
    const result = reconcileFileNames(takes, ['A.mov', 'B.mov', 'C.mov']);
    expect(result.hasDrift).toBe(false);
    expect(result.matchedCount).toBe(3);
    expect(result.entries.map((entry) => entry.fileName)).toEqual(['A.mov', 'B.mov', 'C.mov']);
  });

  it('reports drift in both directions instead of guessing past it', () => {
    const shortCard = reconcileFileNames(takes, ['A.mov']);
    expect(shortCard.hasDrift).toBe(true);
    expect(shortCard.entries.filter((entry) => entry.status === 'take-without-file')).toHaveLength(2);

    const longCard = reconcileFileNames([{ id: 't1' }], ['A.mov', 'B.mov']);
    expect(longCard.hasDrift).toBe(true);
    expect(longCard.entries.filter((entry) => entry.status === 'file-without-take')).toHaveLength(1);
  });

  it('flags a name it would overwrite', () => {
    const result = reconcileFileNames([{ id: 't1', fileName: 'OLD.mov' }], ['NEW.mov']);
    expect(result.entries[0].replaces).toBe('OLD.mov');
  });

  it('applies only matched entries, leaving unmatched names untouched', () => {
    const source = [{ id: 't1', fileName: 'KEEP.mov' }, { id: 't2' }];
    const result = reconcileFileNames(source, ['A.mov']);
    expect(applyReconciliation(source, result)).toEqual([
      { id: 't1', fileName: 'A.mov' },
      { id: 't2' },
    ]);
  });
});

describe('parseCardListing', () => {
  it('strips directories and blank lines from whatever was pasted', () => {
    expect(parseCardListing('  A.mov \n\n/Volumes/CARD/B.mov\nC:\\CARD\\C.mov\n')).toEqual([
      'A.mov',
      'B.mov',
      'C.mov',
    ]);
  });
});

describe('fillSequentialFileNames', () => {
  it('counts on from the last name that is set', () => {
    const filled = fillSequentialFileNames([
      { id: 't1', fileName: 'C0001.MP4' },
      { id: 't2' },
      { id: 't3' },
    ]);
    expect(filled.map((entry) => entry.fileName)).toEqual(['C0001.MP4', 'C0002.MP4', 'C0003.MP4']);
  });

  it('fills nothing when there is nothing to count on from', () => {
    expect(fillSequentialFileNames([{ id: 't1' }])).toEqual([{ id: 't1' }]);
  });
});

describe('sticky columns', () => {
  it('carries the roll card, keywords and camera settings forward', () => {
    const previous = take({
      id: 't1',
      shotId: 's1',
      rollCard: '1',
      keywords: ['Laptop', 'John'],
      cameraOverrides: { iso: 800 },
      fileName: 'A.mov',
      isGoodTake: true,
      comments: 'Laptop needs CGI',
    });
    const { take: next, inherited } = seedNextTake([previous], {
      id: 't2',
      shotId: 's1',
      previous,
    });

    expect(next.rollCard).toBe('1');
    expect(next.keywords).toEqual(['Laptop', 'John']);
    expect(next.cameraOverrides).toEqual({ iso: 800 });
    expect(inherited).toContain('rollCard');

    // The per-take fields must not carry: a NG take inheriting "good" is a lie
    // that survives into the grade.
    expect(next.fileName).toBeUndefined();
    expect(next.isGoodTake).toBeUndefined();
    expect(next.comments).toBeUndefined();
  });

  it('copies inherited objects rather than sharing them', () => {
    const previous = take({ id: 't1', shotId: 's1', keywords: ['A'], cameraOverrides: { iso: 800 } });
    const { take: next } = seedNextTake([previous], { id: 't2', shotId: 's1', previous });
    (next.keywords as string[]).push('B');
    next.cameraOverrides!.iso = 1600;
    expect(previous.keywords).toEqual(['A']);
    expect(previous.cameraOverrides).toEqual({ iso: 800 });
  });

  it('increments the take number within a shot and resets it across shots', () => {
    const takes = [
      take({ id: 't1', shotId: 's1', takeNumber: 1 }),
      take({ id: 't2', shotId: 's1', takeNumber: 2 }),
    ];
    expect(nextTakeNumber(takes, 's1')).toBe(3);
    expect(nextTakeNumber(takes, 's2')).toBe(1);
  });

  it('continues a shot returned to later rather than restarting behind itself', () => {
    const takes = [
      take({ id: 't1', shotId: 's1', takeNumber: 1 }),
      take({ id: 't2', shotId: 's2', takeNumber: 1 }),
      take({ id: 't3', shotId: 's1', takeNumber: 2 }),
    ];
    expect(nextTakeNumber(takes, 's1')).toBe(3);
  });
});

describe('takesCountFor', () => {
  it('prefers logged records but falls back to the legacy stored count', () => {
    const takes = [take({ id: 't1', shotId: 's1' })];
    expect(takesCountFor(takes, 's1', 7)).toBe(1);
    expect(takesCountFor(takes, 's2', 7)).toBe(7);
    expect(takesCountFor(takes, 's2')).toBe(0);
  });
});

describe('dayChecklist', () => {
  const sources = {
    setups: [
      {
        id: 'setup1',
        sceneNumber: '2',
        shots: [
          { id: 'shot1', shotNumber: '2A', name: 'Master' },
          { id: 'shot2', shotNumber: '2B', name: 'Single' },
          { id: 'shot3', shotNumber: '2C', name: 'Insert' },
          { id: 'pickup', shotNumber: '2D', name: 'Pickup', unplanned: true },
        ],
      },
    ],
  };
  const blocks: ScheduleBlock[] = [
    { id: 'b1', kind: 'shots', shotIds: ['shot1', 'shot2', 'shot3'] },
  ];
  const takes = [
    take({ id: 't1', shotId: 'shot1', productionDayId: 'day1', isGoodTake: true }),
    take({ id: 't2', shotId: 'shot2', productionDayId: 'day1', isGoodTake: false }),
    take({ id: 't3', shotId: 'pickup', productionDayId: 'day1', isGoodTake: true }),
  ];

  it('separates covered, attempted-but-not-covered and never-shot', () => {
    const checklist = dayChecklist(['b1'], blocks, sources, takes, 'day1');
    expect(checklist.planned.map((entry) => entry.shotNumber)).toEqual(['2A', '2B', '2C']);
    expect(checklist.planned[0].covered).toBe(true);
    expect(checklist.noGoodTake.map((entry) => entry.shotNumber)).toEqual(['2B']);
    expect(checklist.notShot.map((entry) => entry.shotNumber)).toEqual(['2C']);
  });

  it('keeps unplanned shots out of the plan so a miss stays visible', () => {
    const checklist = dayChecklist(['b1'], blocks, sources, takes, 'day1');
    expect(checklist.unscheduled.map((entry) => entry.shotNumber)).toEqual(['2D']);
    expect(checklist.planned.some((entry) => entry.shotId === 'pickup')).toBe(false);
    // The pickup being covered must not hide that 2C was never shot.
    expect(checklist.notShot).toHaveLength(1);
  });

  it('resolves shots scheduled by setup and by scene, not just by shot', () => {
    const bySetup = dayChecklist(
      ['b2'],
      [{ id: 'b2', kind: 'setup', setupId: 'setup1' }],
      sources,
      [],
      'day1',
    );
    // Three planned shots — the pickup on the same setup is not one of them.
    expect(bySetup.planned.map((entry) => entry.shotNumber)).toEqual(['2A', '2B', '2C']);

    const byScene = dayChecklist(
      ['b3'],
      [{ id: 'b3', kind: 'scene', scriptSceneId: 'sc1' }],
      { ...sources, scriptScenes: [{ id: 'sc1', sceneNumber: '2' }] },
      [],
      'day1',
    );
    expect(byScene.planned.map((entry) => entry.shotNumber)).toEqual(['2A', '2B', '2C']);
  });

  /**
   * Adding a pickup to a scheduled setup must not enrol it in the plan — the
   * checklist would stop being able to say which shot was actually missed.
   */
  it('does not let a pickup on a scheduled setup join the plan', () => {
    const checklist = dayChecklist(
      ['b2'],
      [{ id: 'b2', kind: 'setup', setupId: 'setup1' }],
      sources,
      takes,
      'day1',
    );
    expect(checklist.planned.some((entry) => entry.shotId === 'pickup')).toBe(false);
    expect(checklist.unscheduled.map((entry) => entry.shotNumber)).toEqual(['2D']);
    expect(checklist.notShot.map((entry) => entry.shotNumber)).toEqual(['2C']);
  });

  /** Naming the id explicitly is someone deciding to plan it, which counts. */
  it('schedules an unplanned shot that a shots block names explicitly', () => {
    const checklist = dayChecklist(
      ['b4'],
      [{ id: 'b4', kind: 'shots', shotIds: ['pickup'] }],
      sources,
      takes,
      'day1',
    );
    expect(checklist.planned.map((entry) => entry.shotNumber)).toEqual(['2D']);
  });

  it('scopes coverage to the day being wrapped', () => {
    const yesterday = [take({ id: 't9', shotId: 'shot3', productionDayId: 'day0', isGoodTake: true })];
    const checklist = dayChecklist(['b1'], blocks, sources, yesterday, 'day1');
    expect(checklist.notShot.map((entry) => entry.shotNumber)).toEqual(['2A', '2B', '2C']);
  });

  it('orders a day by log time', () => {
    const unsorted = [
      take({ id: 'b', shotId: 'shot1', productionDayId: 'day1', loggedAt: '2024-05-21T10:00:00Z' }),
      take({ id: 'a', shotId: 'shot1', productionDayId: 'day1', loggedAt: '2024-05-21T09:00:00Z' }),
    ];
    expect(takesForDay(unsorted, 'day1').map((entry) => entry.id)).toEqual(['a', 'b']);
  });

  it('flags takes whose shot was deleted instead of dropping them', () => {
    const stray = [take({ id: 'x', shotId: 'gone' })];
    expect(orphanedTakes(stray, sources).map((entry) => entry.id)).toEqual(['x']);
  });
});

describe('Resolve CSV contract', () => {
  const templateHeader = readFileSync(templatePath, 'utf8').split(/\r?\n/)[0];

  it('matches the vendored template header exactly', () => {
    expect(RESOLVE_METADATA_COLUMNS.join(',')).toBe(templateHeader);
  });

  it('writes CRLF line endings and a trailing newline, with no instruction row', () => {
    const csv = serialiseResolveCsv([]);
    expect(csv).toBe(`${templateHeader}\r\n`);
    expect(csv).not.toContain('Who directed this?');
  });

  it('quotes a keyword list and doubles embedded quotes', () => {
    expect(escapeCsvField('Laptop, John')).toBe('"Laptop, John"');
    expect(escapeCsvField('the "hero" laptop')).toBe('"the ""hero"" laptop"');
    expect(escapeCsvField('plain')).toBe('plain');
  });

  it('keeps a comma inside Keywords from shifting later columns', () => {
    const csv = serialiseResolveCsv([{ Keywords: 'Laptop, John', Scene: '2' }]);
    const row = csv.split('\r\n')[1];
    expect(row).toContain('"Laptop, John"');
    // 29 columns means 28 separators, and the quoted comma is not one of them.
    const outsideQuotes = row.replace(/"[^"]*"/g, '');
    expect(outsideQuotes.split(',')).toHaveLength(29);
  });

  it('formats the recorded date with underscores', () => {
    expect(formatRecordedDate('2024-05-21')).toBe('2024_05_21');
    expect(formatRecordedDate(undefined)).toBe('');
    expect(formatRecordedDate('not a date')).toBe('not a date');
  });

  it('derives shutter speed from angle and frame rate', () => {
    expect(shutterSpeedFrom(180, 25)).toBe('1/50');
    expect(shutterSpeedFrom(180, 24)).toBe('1/48');
    expect(shutterSpeedFrom(172.8, 24)).toBe('1/50');
    expect(shutterSpeedFrom(undefined, 25)).toBe('');
    expect(shutterSpeedFrom(180, undefined)).toBe('');
  });
});

describe('buildResolveRows', () => {
  const sources = {
    productionCompany: 'LAM',
    title: '2024_3TPTI_METAT-TEST',
    director: 'ERIC',
    cinematographer: 'PETER',
    people: [
      { id: 'p1', displayName: 'TOM', role: 'Sound Recordist' },
      { id: 'p2', displayName: 'MUSTERMAN', role: 'Scripty' },
      { id: 'p3', displayName: 'PETER', role: 'DOP' },
    ],
    productionDays: [{ id: 'day1', date: '2024-05-21' }],
    setups: [
      {
        id: 'setup1',
        sceneNumber: '2',
        location: 'OFFICE',
        timeOfDay: 'Day INT',
        elements: [
          {
            id: 'cam1',
            type: 'camera',
            cameraLabel: 'A',
            cameraModel: 'NEX50',
            aperture: '5.6',
            iso: 800,
            shutterAngle: 180,
            ndFilter: 'ND 0.6',
          },
        ],
        shots: [
          {
            id: 'shot1',
            shotNumber: '33',
            cameraId: 'cam1',
            cameraLabel: 'Main Cam',
            lensMm: 50,
            frameRate: 25,
            framingDescription: 'John is in the office with his laptop',
          },
        ],
      },
    ],
  };

  const logged = take({
    id: 't1',
    shotId: 'shot1',
    productionDayId: 'day1',
    takeNumber: 2,
    fileName: '1.MTS',
    isGoodTake: true,
    comments: 'Laptop needs CGI',
    keywords: ['Laptop', 'John'],
    rollCard: '1',
  });

  it('fills every column the project already knows', () => {
    const [row] = buildResolveRows([logged], sources);
    expect(row).toMatchObject({
      'File Name': '1.MTS',
      'Production Company': 'LAM',
      'Production Name': '2024_3TPTI_METAT-TEST',
      Director: 'ERIC',
      DOP: 'PETER',
      // Resolved through the shared key-role aliases: "Sound Recordist",
      // "Scripty" and "DOP" are what people actually type, and all three find
      // their head. DOP also proves the crew list beats the legacy
      // `cinematographer` string, which is free text and often a job title.
      'Sound Mixer': 'TOM',
      'Script Supervisor': 'MUSTERMAN',
      'Date Recorded': '2024_05_21',
      'Roll Card #': '1',
      Environment: 'INT',
      Location: 'OFFICE',
      'Day / Night': 'DAY',
      Scene: '2',
      Shot: '33',
      Take: '2',
      'Good Take': '1',
      Description: 'John is in the office with his laptop',
      Comments: 'Laptop needs CGI',
      Keywords: 'Laptop, John',
      'Camera #': 'Main Cam',
      'Camera Type': 'NEX50',
      'Camera FPS': '25',
      'Shutter Speed': '1/50',
      ISO: '800',
      'Focal Point (mm)': '50mm',
      Filter: 'ND 0.6',
      'Camera Aperture': '5.6',
    });
  });

  it('falls back to the legacy project fields when nobody holds the role', () => {
    const withoutCrew = { ...sources, people: [] };
    const [row] = buildResolveRows([logged], withoutCrew);
    expect(row.Director).toBe('ERIC');
    expect(row.DOP).toBe('PETER');
    expect(row['Sound Mixer']).toBe('');
    expect(row['Script Supervisor']).toBe('');
  });

  /**
   * A production that has not built a crew list still has to be able to name
   * its sound mixer and script supervisor. Typed names are a fallback only:
   * the crew list takes over the moment somebody is assigned there, so a
   * stale name cannot survive on the paperwork.
   */
  it('uses typed crew names only where the crew list is silent', () => {
    const typed = { soundMixer: 'TYPED MIXER', scriptSupervisor: 'TYPED SCRIPTY' };
    const [withCrew] = buildResolveRows([logged], { ...sources, crewDefaults: typed });
    expect(withCrew['Sound Mixer']).toBe('TOM');
    expect(withCrew['Script Supervisor']).toBe('MUSTERMAN');

    const [withoutCrew] = buildResolveRows([logged], { ...sources, people: [], crewDefaults: typed });
    expect(withoutCrew['Sound Mixer']).toBe('TYPED MIXER');
    expect(withoutCrew['Script Supervisor']).toBe('TYPED SCRIPTY');
  });

  /** What was actually shot beats what was planned, for every camera column. */
  it('exports the take as shot, not as planned, wherever the take says so', () => {
    const shotDifferently = {
      ...logged,
      cameraOverrides: {
        cameraLabel: 'B',
        cameraType: 'RED Komodo',
        cameraFps: 50,
        shutterSpeed: '1/100',
        focalMm: 85,
        cameraNotes: 'Handheld after all',
      },
      slateOverrides: {
        description: 'Tighter than boarded',
        shotNumber: '33A',
        dateRecorded: '2024_05_22',
      },
    };
    const [row] = buildResolveRows([shotDifferently], sources);
    expect(row).toMatchObject({
      Shot: '33A',
      'Date Recorded': '2024_05_22',
      'Camera #': 'B',
      'Camera Type': 'RED Komodo',
      'Camera FPS': '50',
      'Shutter Speed': '1/100',
      'Focal Point (mm)': '85mm',
      'Camera Notes': 'Handheld after all',
      Description: 'Tighter than boarded',
    });
    // And the plan is untouched, so a take that did not override still
    // exports the planned lens.
    expect(buildResolveRows([logged], sources)[0]['Focal Point (mm)']).toBe('50mm');
  });

  it('writes Good Take as 1 or 0, and leaves it blank while unjudged', () => {
    expect(buildResolveRows([logged], sources)[0]['Good Take']).toBe('1');
    expect(
      buildResolveRows([{ ...logged, isGoodTake: false }], sources)[0]['Good Take'],
    ).toBe('0');
    expect(
      buildResolveRows([{ ...logged, isGoodTake: undefined }], sources)[0]['Good Take'],
    ).toBe('');
  });

  it('leaves what it does not know empty rather than guessing', () => {
    const [row] = buildResolveRows([take({ id: 't2', shotId: 'shot1' })], sources);
    expect(row['White Point (Kelvin)']).toBe('');
    expect(row['File Name']).toBe('');
    expect(row['Date Recorded']).toBe('');
  });

  it('lets a take override the plan without copying it in', () => {
    const overridden = {
      ...logged,
      cameraOverrides: { iso: 1600, whitePointKelvin: 5600, filter: 'CLEAR', aperture: '2.8' },
      slateOverrides: { environment: 'EXT' as const, location: 'COURT', dayNight: 'NIGHT' as const },
    };
    const [row] = buildResolveRows([overridden], sources);
    expect(row).toMatchObject({
      ISO: '1600',
      'White Point (Kelvin)': '5600',
      Filter: 'CLEAR',
      'Camera Aperture': '2.8',
      Environment: 'EXT',
      Location: 'COURT',
      'Day / Night': 'NIGHT',
    });
    // The plan itself is untouched, so correcting it still corrects every take
    // that never overrode it.
    expect(sources.setups[0].elements[0].iso).toBe(800);
  });

  it('still exports a take whose shot was deleted', () => {
    const [row] = buildResolveRows([take({ id: 't3', shotId: 'gone', fileName: 'X.mov' })], sources);
    expect(row['File Name']).toBe('X.mov');
    expect(row.Shot).toBe('');
    expect(row['Production Company']).toBe('LAM');
  });
});
