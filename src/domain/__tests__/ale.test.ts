import { describe, expect, it } from 'vitest';
import {
  ALE_COLUMNS,
  aleClipName,
  buildAleRows,
  dominantFps,
  exportAle,
  sanitiseAleField,
  serialiseAle,
} from '../continuity/ale';
import type { ContinuitySources, Take } from '../continuity';

const SOURCES: ContinuitySources = {
  title: 'The Long Wait',
  director: 'A. DIRECTOR',
  setups: [
    {
      id: 'setup1',
      sceneNumber: '4',
      location: 'INT. KITCHEN',
      timeOfDay: 'Day INT',
      elements: [
        { id: 'cam1', type: 'camera', cameraLabel: 'A', cameraModel: 'ARRI Alexa 35', iso: 800, shutterAngle: 180 },
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
        { id: 'shot2', sceneNumber: '4', shotNumber: '4B', cameraId: 'cam1', frameRate: 50 },
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

/** The lines of a serialised ALE, with CRLF stripped. */
const linesOf = (ale: string): string[] => ale.replace(/\r\n/g, '\n').split('\n');

describe('aleClipName', () => {
  it('drops the extension, which is what Avid calls the clip', () => {
    expect(aleClipName('A001C002_240521.mov')).toBe('A001C002_240521');
  });

  it('leaves a name with no extension alone', () => {
    expect(aleClipName('A001C002')).toBe('A001C002');
  });

  it('does not truncate a leading-dot name to nothing', () => {
    expect(aleClipName('.hidden')).toBe('.hidden');
  });

  it('is empty for an unreconciled take', () => {
    expect(aleClipName(undefined)).toBe('');
  });
});

describe('sanitiseAleField', () => {
  it('collapses a tab, which would otherwise shift every later column', () => {
    // ALE has no quoting mechanism at all — this is the whole reason the
    // Resolve exporter can quote a comma and this one cannot.
    expect(sanitiseAleField('take\twas\tgood')).toBe('take was good');
  });

  it('collapses a newline, which would otherwise split the row in two', () => {
    expect(sanitiseAleField('line one\r\nline two')).toBe('line one line two');
  });
});

describe('serialiseAle', () => {
  const ale = serialiseAle([{ Name: 'A001C001', Tape: 'A001' }], { fps: '25' });

  it('emits the three sections in order', () => {
    const lines = linesOf(ale);
    expect(lines[0]).toBe('Heading');
    expect(lines).toContain('Column');
    expect(lines).toContain('Data');
    expect(lines.indexOf('Column')).toBeLessThan(lines.indexOf('Data'));
  });

  it('declares the delimiter, which is the one required heading entry', () => {
    expect(linesOf(ale)).toContain('FIELD_DELIM\tTABS');
  });

  it('writes the column row as tab-separated names', () => {
    const lines = linesOf(ale);
    expect(lines[lines.indexOf('Column') + 1]).toBe(ALE_COLUMNS.join('\t'));
  });

  it('writes one tab-separated data row per row, columns included even when blank', () => {
    const lines = linesOf(ale);
    const dataRow = lines[lines.indexOf('Data') + 1];
    expect(dataRow.split('\t')).toHaveLength(ALE_COLUMNS.length);
    expect(dataRow.split('\t')[0]).toBe('A001C001');
  });

  it('uses CRLF throughout and ends with one', () => {
    expect(ale.endsWith('\r\n')).toBe(true);
    expect(ale.includes('\n')).toBe(true);
    expect(/[^\r]\n/.test(ale)).toBe(false);
  });
});

describe('buildAleRows', () => {
  it('splits the file name between Name and Source File', () => {
    const [row] = buildAleRows([take({ shotId: 'shot1', fileName: 'A001C002.mov' })], SOURCES);
    expect(row.Name).toBe('A001C002');
    expect(row['Source File']).toBe('A001C002.mov');
  });

  it('carries the camera card into both Tape and Camroll', () => {
    const [row] = buildAleRows([take({ shotId: 'shot1', rollCard: 'A001' })], SOURCES);
    expect(row.Tape).toBe('A001');
    expect(row.Camroll).toBe('A001');
  });

  it('keeps the sound roll separate from the camera card', () => {
    const [row] = buildAleRows(
      [take({ shotId: 'shot1', rollCard: 'A001', soundRoll: 'S03' })],
      SOURCES,
    );
    expect(row.Soundroll).toBe('S03');
  });

  it('resolves the slate and camera values the Resolve export resolves', () => {
    const [row] = buildAleRows([take({ shotId: 'shot1', takeNumber: 3 })], SOURCES);
    expect(row.Scene).toBe('4');
    expect(row.Shot).toBe('4A');
    expect(row.Take).toBe('3');
    expect(row.Descript).toBe('Wide on the table');
    expect(row.Lens).toBe('35mm');
    expect(row.Shutter).toBe('1/50');
    expect(row.Director).toBe('A. DIRECTOR');
  });

  it('writes Circled as TRUE/FALSE and leaves it blank while unjudged', () => {
    const rows = buildAleRows(
      [
        take({ shotId: 'shot1', isGoodTake: true }),
        take({ shotId: 'shot1', isGoodTake: false }),
        take({ shotId: 'shot1' }),
      ],
      SOURCES,
    );
    expect(rows.map((row) => row.Circled)).toEqual(['TRUE', 'FALSE', '']);
  });

  it('emits a row for a take whose file name is not reconciled yet', () => {
    // It attaches to no clip, which is the honest state. Dropping it would
    // lose the only record that the take happened.
    const rows = buildAleRows([take({ shotId: 'shot1' })], SOURCES);
    expect(rows).toHaveLength(1);
    expect(rows[0].Name).toBe('');
  });

  it('emits no Start or End column at all', () => {
    // The app has no timecode. Writing 00:00:00:00 for every clip would be a
    // fabricated value Avid would treat as real.
    expect(ALE_COLUMNS).not.toContain('Start' as never);
    expect(ALE_COLUMNS).not.toContain('End' as never);
  });
});

describe('dominantFps', () => {
  it('picks the rate most takes were shot at', () => {
    const fps = dominantFps(
      [
        take({ shotId: 'shot1' }),
        take({ shotId: 'shot1' }),
        take({ shotId: 'shot2' }),
      ],
      SOURCES,
    );
    expect(fps).toBe('25');
  });

  it('is undefined when no take names a rate', () => {
    expect(dominantFps([], SOURCES)).toBeUndefined();
  });
});

describe('exportAle', () => {
  it('puts the takes rate in the heading rather than a default', () => {
    const ale = exportAle([take({ shotId: 'shot2' })], SOURCES);
    expect(linesOf(ale)).toContain('FPS\t50');
  });

  it('falls back to 25 when the takes name no rate', () => {
    const ale = exportAle([], SOURCES);
    expect(linesOf(ale)).toContain('FPS\t25');
  });

  it('survives a comment containing a tab', () => {
    const ale = exportAle(
      [take({ shotId: 'shot1', fileName: 'A001C001.mov', comments: 'a\tb' })],
      SOURCES,
    );
    const lines = linesOf(ale);
    const dataRow = lines[lines.indexOf('Data') + 1];
    expect(dataRow.split('\t')).toHaveLength(ALE_COLUMNS.length);
  });
});
