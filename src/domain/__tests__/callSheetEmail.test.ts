import { describe, expect, it } from 'vitest';
import { callSheetEmail } from '../reports/callSheetEmail';
import type { CallSheetData } from '../reports/callSheet';

describe('callSheetEmail', () => {
  it('BCCs everyone on the sheet with an address and lists who has none', () => {
    const sheet = {
      dayName: 'Day 1',
      date: '2026-10-17',
      revision: 2,
      crewCall: '07:00',
      locations: [{ name: 'Riverside Diner', address: '14 Riverside' }],
      cast: [{ id: 'p1', displayName: 'Marco' }],
      crew: [{ id: 'p2', displayName: 'Ana' }, { id: 'p3', displayName: 'No Mail' }],
    } as unknown as CallSheetData;
    const email = callSheetEmail({
      productionTitle: 'My Film',
      sheet,
      emailOf: (id) => ({ p1: 'marco@x.test', p2: 'ana@x.test' } as Record<string, string>)[id],
    });
    expect(email.recipients).toEqual(['marco@x.test', 'ana@x.test']);
    expect(email.missing).toEqual(['No Mail']);
    expect(email.href).toContain('bcc=marco%40x.test%2Cana%40x.test');
    expect(decodeURIComponent(email.href)).toContain('My Film — call sheet Day 1, 2026-10-17 (Rev 2)');
    expect(decodeURIComponent(email.href)).toContain('General crew call: 07:00');
  });
});
