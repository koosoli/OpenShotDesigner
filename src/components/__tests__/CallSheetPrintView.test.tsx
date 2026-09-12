/**
 * The printed call sheet, end to end.
 *
 * The document the crew physically holds, and the first one to get a language
 * of its own. What is worth pinning is not the wording — that is covered in
 * `domain/__tests__/documentText.test.ts` — but the wiring: the language has
 * to travel ON the sheet, so that whoever presses print produces the same page.
 *
 * The editor is deliberately NOT translated. Its chrome follows the reader,
 * like the rest of the app; only what leaves the building follows the
 * production.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { CallSheetPrintView } from '../reports/CallSheetPrintView';
import type { CallSheetData } from '../../domain/reports';

afterEach(cleanup);

const sheet = (overrides: Partial<CallSheetData> = {}): CallSheetData =>
  ({
    productionTitle: 'Test Production',
    dayName: 'Day 1',
    date: '2026-09-10',
    crewCall: '08:00',
    plannedWrap: '18:00',
    type: 'shoot',
    isDraft: false,
    schedule: [],
    cast: [],
    crew: [],
    locations: [],
    maps: [],
    departmentHeads: [],
    warnings: [],
    pickups: [],
    // Always present on a derived sheet; the print view reads it directly.
    daylight: { sunriseOrigin: 'none', sunsetOrigin: 'none' },
    ...overrides,
  }) as unknown as CallSheetData;

describe('CallSheetPrintView language', () => {
  it('prints English when the production has not chosen a language', () => {
    const { container } = render(<CallSheetPrintView sheet={sheet()} />);
    expect(container.textContent).toContain('General crew call');
    expect(container.textContent).toContain('Planned wrap');
  });

  it('prints German when the production asked for it', () => {
    const { container } = render(
      <CallSheetPrintView sheet={sheet({ documentLanguage: 'de' })} />,
    );
    expect(container.textContent).toContain('Allgemeine Crew-Zeit');
    expect(container.textContent).toContain('Geplantes Drehende');
  });

  it('takes the language from the sheet, never from the environment', () => {
    // Two renders in the same process, same machine, different documents.
    // If the language came from the browser these would agree.
    const english = render(<CallSheetPrintView sheet={sheet()} />).container.textContent ?? '';
    cleanup();
    const german =
      render(<CallSheetPrintView sheet={sheet({ documentLanguage: 'de' })} />).container
        .textContent ?? '';

    expect(english).toContain('Planned wrap');
    expect(german).not.toContain('Planned wrap');
  });

  it('translates the draft watermark, which is the one word that must not be missed', () => {
    const { container } = render(
      <CallSheetPrintView sheet={sheet({ isDraft: true, documentLanguage: 'de' })} />,
    );
    // A German crew reading "DRAFT" may not register it. Handing out a draft
    // call sheet that reads as final is the expensive version of this bug.
    expect(container.textContent).toContain('ENTWURF');
  });

  it('still prints the production identity in every language', () => {
    for (const language of ['en', 'de'] as const) {
      const { container } = render(
        <CallSheetPrintView sheet={sheet({ documentLanguage: language })} />,
      );
      expect(container.textContent).toContain('Test Production');
      expect(container.textContent).toContain('Day 1');
      cleanup();
    }
  });

  it('never leaves a translation key on the page', () => {
    for (const language of ['en', 'de'] as const) {
      const { container } = render(
        <CallSheetPrintView sheet={sheet({ documentLanguage: language })} />,
      );
      expect(container.textContent).not.toContain('callsheet.');
      cleanup();
    }
  });
});
