import { describe, expect, it } from 'vitest';
import { csvCell, toCsv } from '../reportOutput';

describe('report CSV helpers', () => {
  it('quotes CSV cells that need it', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell(undefined)).toBe('');
    expect(toCsv([['a', 1], ['b,c', null]])).toBe('a,1\n"b,c",');
  });
});
