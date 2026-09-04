/**
 * Call sheet PDF tests: real bytes, reloaded in pdf-lib, content streams
 * inflated the same way as `__tests__/pdf.test.ts` (zlib-wrapped flate via
 * `unzlibSync`, assertions on the uppercase hex pdf-lib emits per drawText).
 */
import { PDFDocument } from 'pdf-lib';
import { unzlibSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { buildCallSheetPdfFilename, callSheetRevisionLabel, createCallSheetPdf } from '../callSheetPdf';
import type { CallSheetPdfInput, CallSheetPdfStrip } from '../callSheetPdf';

const FIXED_DATE = new Date('2026-09-04T08:00:00.000Z');

/** Binary-safe 1:1 bytes-to-string for slicing streams out of the raw PDF. */
const bytesToBinary = (bytes: Uint8Array): string => {
  let out = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return out;
};

/** Inflate every flate content stream; image streams are skipped silently. */
const inflateContentStreams = (pdfBytes: Uint8Array): string[] => {
  const bin = bytesToBinary(pdfBytes);
  const decoder = new TextDecoder('windows-1252');
  const out: string[] = [];
  const pattern = /\/Length (\d+)[\s\S]*?stream\r?\n/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(bin)) !== null) {
    const length = Number(match[1]);
    const start = match.index + match[0].length;
    try {
      const text = decoder.decode(unzlibSync(pdfBytes.slice(start, start + length)));
      if (text.includes('Tj')) out.push(text);
    } catch {
      // Image XObjects and other non-text streams: not paperwork content.
    }
  }
  return out;
};

/** Uppercase hex pdf-lib emits for one drawText call (`<4E…> Tj`). */
const pdfHexToken = (text: string): string =>
  [...text].map((ch) => ch.charCodeAt(0).toString(16).padStart(2, '0')).join('').toUpperCase();

const minimalInput = (overrides: Partial<CallSheetPdfInput> = {}): CallSheetPdfInput => ({
  productionTitle: 'My Film',
  dayName: 'Day 04',
  date: '2026-09-04',
  crewCall: '06:30',
  plannedWrap: '19:00',
  status: 'final',
  schedule: [
    { scene: '4', slugline: 'INT. DINER - NIGHT', label: 'Sc 4 - Night Diner', location: 'Diner', start: '08:00', estimatedMinutes: 90 },
  ],
  cast: [{ name: 'Jane Doe', role: 'Lead', callTime: '06:45', phone: '555-0100' }],
  crew: [{ name: 'John Smith', department: 'Camera', role: 'DOP', callTime: '06:30' }],
  locations: [{ name: 'Diner', address: '1 Main St' }],
  pickups: [{ name: 'Jane Doe', time: '05:45', location: 'Hotel', notes: 'Van 1' }],
  weatherSummary: 'Clear, 18C',
  safetyNotes: 'Fire exits marked.',
  generatedAt: FIXED_DATE,
  ...overrides,
});

const makeStrip = (index: number): CallSheetPdfStrip => ({
  scene: '4',
  slugline: 'INT. DINER - NIGHT',
  label: `StripMarker-${index}`,
  location: 'Diner',
  start: '08:00',
  estimatedMinutes: 30,
});

describe('call sheet PDF', () => {
  it('starts with %PDF-, reloads on one page with the metadata title', async () => {
    const pdf = await createCallSheetPdf(minimalInput());
    expect(bytesToBinary(pdf.slice(0, 5))).toBe('%PDF-');
    const reloaded = await PDFDocument.load(pdf);
    expect(reloaded.getPageCount()).toBe(1);
    expect(reloaded.getTitle()).toBe('Call Sheet - My Film - Day 04');
  });

  it('prints the crew call time as an inflated-stream token', async () => {
    const pdf = await createCallSheetPdf(minimalInput());
    expect(inflateContentStreams(pdf).join('\n')).toContain(pdfHexToken('06:30'));
  });

  it('paginates a long strip list across several pages', async () => {
    const strips = Array.from({ length: 120 }, (_, index) => makeStrip(index));
    const pdf = await createCallSheetPdf(minimalInput({ schedule: strips }));
    const reloaded = await PDFDocument.load(pdf);
    expect(reloaded.getPageCount()).toBeGreaterThan(1);
    const combined = inflateContentStreams(pdf).join('\n');
    expect(combined).toContain(pdfHexToken('StripMarker-119'));
  });

  it('shows the draft watermark only on drafts', async () => {
    const draft = await createCallSheetPdf(minimalInput({ isDraft: true }));
    const final = await createCallSheetPdf(minimalInput());
    expect(inflateContentStreams(draft).join('\n')).toContain(pdfHexToken('DRAFT'));
    expect(inflateContentStreams(final).join('\n')).not.toContain(pdfHexToken('DRAFT'));
  });

  it('prints the revision label in the stream and metadata stays stable', async () => {
    const pdf = await createCallSheetPdf(minimalInput({ revision: 2 }));
    const combined = inflateContentStreams(pdf).join('\n');
    expect(combined).toContain(pdfHexToken('REV 2'));
    expect((await PDFDocument.load(pdf)).getTitle()).toBe('Call Sheet - My Film - Day 04');
  });

  it('renders an empty day without throwing', async () => {
    const pdf = await createCallSheetPdf({
      productionTitle: 'My Film',
      dayName: 'Day 05',
      status: 'final',
      generatedAt: FIXED_DATE,
    });
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(1);
  });

  it('prints logo-less on corrupt bytes instead of throwing', async () => {
    const pdf = await createCallSheetPdf(minimalInput({ logoPngBytes: new Uint8Array([0, 1, 2, 3]) }));
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(1);
  });
});

describe('call sheet filename and revision label', () => {
  it('builds the canonical name with day qualifier and revision', () => {
    expect(buildCallSheetPdfFilename({ productionTitle: 'My Film', dayName: 'Day 04', revision: 2 })).toBe(
      'my-film_call-sheet_day-04_rev-2.pdf',
    );
  });

  it('omits the revision segment for drafts and keeps valid dates', () => {
    expect(buildCallSheetPdfFilename({ productionTitle: 'My Film', dayName: 'Day 04' })).toBe(
      'my-film_call-sheet_day-04.pdf',
    );
    expect(
      buildCallSheetPdfFilename({ productionTitle: 'My Film', dayName: 'Day 04', revision: 1, date: '2026-09-04' }),
    ).toBe('my-film_call-sheet_day-04_rev-1_2026-09-04.pdf');
  });

  it('labels drafts and revisions for the header block', () => {
    expect(callSheetRevisionLabel({ revision: 1 })).toBe('REV 1');
    expect(callSheetRevisionLabel({ isDraft: true })).toBe('DRAFT');
    expect(callSheetRevisionLabel({ status: 'final' })).toBe('FINAL');
  });
});
