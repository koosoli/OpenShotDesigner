import { describe, expect, it } from 'vitest';
import { deriveScriptBreakdown } from '../script/logic';
import {
  estimateScenePageEighths,
  parsePageEighths,
  wrappedLineCount,
} from '../script';

const line = (id: string, type: string, text: string, extra: Record<string, unknown> = {}) => ({ id, type, text, ...extra });

describe('wrappedLineCount', () => {
  it('wraps on word boundaries at the column width', () => {
    expect(wrappedLineCount('short', 35)).toBe(1);
    expect(wrappedLineCount('a '.repeat(30).trim(), 35)).toBe(2);
    expect(wrappedLineCount('x'.repeat(70), 35)).toBe(2);
  });
});

describe('estimateScenePageEighths', () => {
  it('gives a tiny scene the minimum of one eighth', () => {
    const result = estimateScenePageEighths([
      line('s1', 'scene', 'INT. ROOM - DAY'),
      line('a1', 'action', 'She sits.'),
    ]);
    expect(result.get('s1')).toBe(1);
  });

  it('measures a full page of action as eight eighths', () => {
    const lines = [line('s1', 'scene', 'INT. ROOM - DAY')];
    // 53 one-line action paragraphs with blank lines between come to ~a page.
    for (let i = 0; i < 26; i += 1) lines.push(line(`a${i}`, 'action', 'Something happens.'));
    const eighths = estimateScenePageEighths(lines).get('s1')!;
    expect(eighths).toBeGreaterThanOrEqual(7);
    expect(eighths).toBeLessThanOrEqual(9);
  });

  it('counts each scene separately and gives omitted scenes zero', () => {
    const result = estimateScenePageEighths([
      line('s1', 'scene', 'INT. A - DAY'),
      line('a1', 'action', 'One.'),
      line('s2', 'scene', 'INT. B - DAY', { omitted: true }),
      line('s3', 'scene', 'INT. C - DAY'),
      line('c1', 'character', 'JO'),
      line('d1', 'dialogue', 'Hello.'),
    ]);
    expect(result.get('s1')).toBe(1);
    expect(result.get('s2')).toBe(0);
    expect(result.get('s3')).toBe(1);
  });

  it('lets a manual override on the heading win', () => {
    const result = estimateScenePageEighths([
      line('s1', 'scene', 'INT. A - DAY', { pageEighthsOverride: 19 }),
      line('a1', 'action', 'One.'),
    ]);
    expect(result.get('s1')).toBe(19);
  });

  it('flows into the derived scene list', () => {
    const { scenes } = deriveScriptBreakdown([
      line('s1', 'scene', 'INT. A - DAY'),
      line('a1', 'action', 'One.'),
    ]);
    expect(scenes[0].pageLengthEighths).toBe(1);
  });
});

describe('parsePageEighths', () => {
  it('reads the ways people write page lengths', () => {
    expect(parsePageEighths('2 3/8')).toBe(19);
    expect(parsePageEighths('3/8')).toBe(3);
    expect(parsePageEighths('1')).toBe(8);
    expect(parsePageEighths('1.5')).toBe(12);
    expect(parsePageEighths('')).toBeUndefined();
    expect(parsePageEighths('abc')).toBeUndefined();
  });
});

describe('deriveLineHighlights', () => {
  it('colours dialogue by speaker and finds names in action lines', async () => {
    const { deriveLineHighlights } = await import('../script/highlight');
    const characters = [
      { id: 'c1', canonicalName: 'ALEX', aliases: [] },
      { id: 'c2', canonicalName: 'SARAH', aliases: ['Sarah Jane'] },
    ];
    const lines = [
      { id: 'a', type: 'action', text: 'Alex hands Sarah Jane the ledger. Alexander waits.' },
      { id: 'c', type: 'character', text: 'ALEX (V.O.)' },
      { id: 'd', type: 'dialogue', text: 'Here.' },
    ];
    const result = deriveLineHighlights(lines, { mode: 'characters', characters });
    expect(result.lines.get('c')?.key).toBe('c1');
    expect(result.lines.get('d')?.key).toBe('c1');
    const found = result.mentions.get('a')!.map((m) => lines[0].text.slice(m.start, m.end));
    expect(found).toEqual(['Alex', 'Sarah Jane']);
    const focused = deriveLineHighlights(lines, { mode: 'characters', characters, focusKey: 'c2' });
    expect(focused.lines.size).toBe(0);
    expect(focused.mentions.get('a')).toHaveLength(1);
  });
});
