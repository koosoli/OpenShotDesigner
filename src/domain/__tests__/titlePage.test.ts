import { describe, expect, it } from 'vitest';
import {
  hasTitlePageContent,
  parseFountainTitlePage,
  resolveTitlePage,
  serializeFountainTitlePage,
} from '../script';

describe('resolveTitlePage', () => {
  it('falls back to the project script title and splits multi-line fields', () => {
    const cover = resolveTitlePage({ authors: 'A. Writer\n B. Writer ', contact: 'Agency\n12 Backlot Ave' }, 'Nightfall');
    expect(cover.title).toBe('Nightfall');
    expect(cover.authors).toEqual(['A. Writer', 'B. Writer']);
    expect(cover.contact).toEqual(['Agency', '12 Backlot Ave']);
    expect(cover.draft).toBe(false);
  });

  it('says Untitled only when there is nothing at all to call it', () => {
    expect(resolveTitlePage(undefined, undefined).title).toBe('Untitled');
    expect(resolveTitlePage({ title: '  ' }, '  ').title).toBe('Untitled');
  });

  /** Absent means "not a draft"; the stamp is opt-in. */
  it('treats the draft flag as off unless explicitly true', () => {
    expect(resolveTitlePage({}, 'X').draft).toBe(false);
    expect(resolveTitlePage({ draft: true }, 'X').draft).toBe(true);
  });
});

describe('hasTitlePageContent', () => {
  it('is false for nothing and true for anything worth printing', () => {
    expect(hasTitlePageContent(undefined)).toBe(false);
    expect(hasTitlePageContent({}, '   ')).toBe(false);
    expect(hasTitlePageContent({ enabled: true }, 'Nightfall')).toBe(true);
    expect(hasTitlePageContent({ contact: 'Agency' })).toBe(true);
  });
});

describe('parseFountainTitlePage', () => {
  it('reads the standard keys, including indented continuations', () => {
    const raw = [
      'Title: Nightfall',
      'Credit: Written by',
      'Author: A. Writer',
      'Contact:',
      '\tLantern Pictures',
      '\t12 Backlot Avenue',
      'Draft date: Second Draft',
      '',
      '===',
      '',
      'INT. LOFT - NIGHT',
    ].join('\n');
    expect(parseFountainTitlePage(raw)).toEqual({
      enabled: true,
      title: 'Nightfall',
      credit: 'Written by',
      authors: 'A. Writer',
      contact: 'Lantern Pictures\n12 Backlot Avenue',
      draftLabel: 'Second Draft',
    });
  });

  it('accepts Authors as well as Author', () => {
    expect(parseFountainTitlePage('Authors: A and B\n\n===\n\nINT. X - DAY')?.authors).toBe('A and B');
  });

  it('returns null when the file opens with the screenplay itself', () => {
    expect(parseFountainTitlePage('INT. LOFT - NIGHT\n\nRain.')).toBeNull();
    expect(parseFountainTitlePage('   ')).toBeNull();
  });

  it('stops at the blank line when there is no === divider', () => {
    const page = parseFountainTitlePage('Title: X\nAuthor: Y\n\nINT. LOFT - NIGHT');
    expect(page).toEqual({ enabled: true, title: 'X', authors: 'Y' });
  });
});

describe('serializeFountainTitlePage', () => {
  it('writes nothing when the cover is off or empty', () => {
    expect(serializeFountainTitlePage(undefined, 'X')).toBe('');
    expect(serializeFountainTitlePage({ title: 'X' }, 'X')).toBe('');
    expect(serializeFountainTitlePage({ enabled: true }, '  ')).toBe('');
  });

  it('round-trips through the parser', () => {
    const page = {
      enabled: true,
      title: 'Nightfall',
      credit: 'Written by',
      authors: 'A. Writer\nB. Writer',
      contact: 'Lantern Pictures\n12 Backlot Avenue',
      draftLabel: 'Second Draft',
      date: '23 August 2026',
    };
    const text = serializeFountainTitlePage(page, undefined);
    expect(text.endsWith('===\n\n')).toBe(true);
    const back = parseFountainTitlePage(text);
    expect(back).toMatchObject({
      title: 'Nightfall',
      credit: 'Written by',
      authors: 'A. Writer\nB. Writer',
      contact: 'Lantern Pictures\n12 Backlot Avenue',
      date: '23 August 2026',
    });
  });

  it('records the draft stamp alongside the draft name', () => {
    const text = serializeFountainTitlePage({ enabled: true, title: 'X', draftLabel: 'First Draft', draft: true }, undefined);
    expect(text).toContain('Draft date: First Draft · DRAFT');
  });
});
