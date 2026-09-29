/**
 * Script-family PDF tests (roadmap Phase 3: sides, AV script, script
 * breakdown, lined screenplay).
 *
 * Same strategy as `pdf.test.ts`: generate real PDFs, verify magic bytes,
 * pdf-lib reload, metadata and page counts, plus byte-level checks on the
 * content streams inflated with fflate's `unzlibSync` (pdf-lib writes
 * zlib-wrapped flate) with assertions on the uppercase hex pdf-lib emits per
 * drawText call.
 */
import { PDFDocument } from 'pdf-lib';
import { unzlibSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  avScriptRowsFromAvRows,
  buildAvScriptPdfFilename,
  buildLinedScriptPdfFilename,
  buildScriptReportsPdfFilename,
  buildSidesPdfFilename,
  createAvScriptPdf,
  createLinedScriptPdf,
  createScriptReportsPdf,
  createSidesPdf,
  doodPdfFromDood,
  scriptReportCharactersFromReports,
  scriptReportElementsFromItems,
  scriptReportLocationsFromBreakdown,
  scriptReportScenesFromScenes,
  sidesPdfScenesFromLines,
} from '../index';
import type { AvScriptPdfRow, LinedScriptPdfLine, SidesPdfScene } from '../index';

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

const makeSidesScene = (index: number): SidesPdfScene => ({
  sceneId: `scene-${index}`,
  sceneNumber: String(index + 1),
  heading: `INT. LOCATION ${index} - DAY`,
  omitted: false,
  lines: [
    { type: 'scene', text: `INT. LOCATION ${index} - DAY` },
    { type: 'action', text: 'Rain hammers the neon sign.' },
    { type: 'character', text: 'JOHN' },
    { type: 'dialogue', text: `SidesMarker-${index} we leave at dawn.` },
  ],
  characters: ['JOHN'],
});

const makeAvRow = (index: number): AvScriptPdfRow => ({
  id: `av-${index}`,
  shotNumber: `${index + 1}`,
  shotName: `WS - Lobby ${index}`,
  shotSize: 'WS',
  video: `VideoMarker-${index} camera pushes through the crowd.`,
  audio: `VO: narration take ${index}.`,
  durationSec: 12,
});

const makeReportScene = (index: number) => ({
  sceneNumber: `${index + 1}`,
  heading: `REPORT HEADING ${index}`,
  intExt: 'INT',
  timeOfDay: 'NIGHT',
  pageLengthEighths: 12,
  characterIds: ['char-john'],
  breakdownItemIds: ['prop-gun'],
});

const makeLinedLines = (sceneCount: number): LinedScriptPdfLine[] => {
  const lines: LinedScriptPdfLine[] = [];
  for (let scene = 0; scene < sceneCount; scene += 1) {
    lines.push({ type: 'scene', text: `INT. LINED PLACE ${scene} - NIGHT`, sceneNumber: `${scene + 1}` });
    lines.push({ type: 'action', text: 'The city sleeps under neon.' });
    lines.push({ type: 'character', text: 'JANE' });
    lines.push({ type: 'dialogue', text: `LinedMarker-${scene} we stay until morning.` });
  }
  return lines;
};

describe('sides PDF', () => {
  it('starts with %PDF- and reloads with one page and the metadata title', async () => {
    const pdf = await createSidesPdf({
      productionTitle: 'My Film',
      scenes: [makeSidesScene(0), makeSidesScene(1)],
      generatedAt: FIXED_DATE,
    });
    expect(bytesToBinary(pdf.slice(0, 5))).toBe('%PDF-');
    const reloaded = await PDFDocument.load(pdf);
    expect(reloaded.getPageCount()).toBe(1);
    expect(reloaded.getTitle()).toBe('Sides - My Film');
  });

  it('paginates 100+ scenes and keeps the tail marker searchable', async () => {
    const scenes = Array.from({ length: 120 }, (_, index) => makeSidesScene(index));
    const pdf = await createSidesPdf({ productionTitle: 'My Film', scenes, generatedAt: FIXED_DATE });
    const reloaded = await PDFDocument.load(pdf);
    expect(reloaded.getPageCount()).toBeGreaterThan(1);
    const combined = inflateContentStreams(pdf).join('\n');
    expect(combined).toContain(pdfHexToken('SidesMarker-119'));
    expect(combined).toContain(pdfHexToken('Generated 2026-09-04'));
    expect(combined).toContain(pdfHexToken('Page 1 of '));
  });

  it('watermarks drafts only where the input carries draft state', async () => {
    const base = { productionTitle: 'My Film', scenes: [makeSidesScene(0)], generatedAt: FIXED_DATE };
    const draft = await createSidesPdf({ ...base, isDraft: true });
    const final = await createSidesPdf(base);
    expect(inflateContentStreams(draft).join('\n')).toContain(pdfHexToken('DRAFT'));
    expect(inflateContentStreams(final).join('\n')).not.toContain(pdfHexToken('DRAFT'));
  });

  it('keeps euro signs and umlauts, mapping the rest per policy', async () => {
    const pdf = await createSidesPdf({
      productionTitle: 'My Film',
      scenes: [{ ...makeSidesScene(0), lines: [{ type: 'dialogue', text: 'Müller counts 12 €, cue → done' }] }],
      generatedAt: FIXED_DATE,
    });
    const combined = inflateContentStreams(pdf).join('\n');
    expect(combined).toContain(pdfHexToken('Müller'));
    expect(combined).toContain('31322080');
    // The arrow is outside WinAnsi: one input char becomes one "?".
    expect(combined).toContain(pdfHexToken('cue ? done'));
  });

  it('builds sensible filenames', () => {
    expect(buildSidesPdfFilename({ productionTitle: 'My Film' })).toBe('my-film_sides_all-scenes.pdf');
    expect(buildSidesPdfFilename({ productionTitle: 'My Film', characterFilter: 'John' })).toBe(
      'my-film_sides_john.pdf',
    );
  });

  it('maps script lines to sides like the domain (order, filter, omitted)', () => {
    const lines = [
      { id: 's1', type: 'scene', text: 'INT. DINER - NIGHT', sceneNumber: '4' },
      { id: 'l1', type: 'character', text: 'John (V.O.)' },
      { id: 'l2', type: 'dialogue', text: 'Hello.' },
      { id: 's2', type: 'scene', text: 'EXT. STREET - DAY', sceneNumber: '5' },
      { id: 'l3', type: 'character', text: 'JANE' },
      { id: 'l4', type: 'dialogue', text: 'Hi.' },
    ];
    const all = sidesPdfScenesFromLines(lines);
    expect(all.scenes.map((scene) => scene.sceneNumber)).toEqual(['4', '5']);
    expect(all.missingSceneIds).toEqual([]);
    const filtered = sidesPdfScenesFromLines(lines, { character: 'john' });
    expect(filtered.scenes.map((scene) => scene.sceneNumber)).toEqual(['4']);
    const missing = sidesPdfScenesFromLines(lines, { sceneIds: ['s1', 'ghost'] });
    expect(missing.missingSceneIds).toEqual(['ghost']);
    const omitted = sidesPdfScenesFromLines(
      [{ id: 's9', type: 'scene', text: 'INT. GONE - DAY', sceneNumber: '9', omitted: true }],
    );
    expect(omitted.scenes[0].heading).toBe('SCENE 9 — OMITTED');
  });
});

describe('AV script PDF', () => {
  it('starts with %PDF- and reloads with one page and the metadata title', async () => {
    const pdf = await createAvScriptPdf({
      productionTitle: 'My Film',
      rows: [makeAvRow(0), makeAvRow(1)],
      generatedAt: FIXED_DATE,
    });
    expect(bytesToBinary(pdf.slice(0, 5))).toBe('%PDF-');
    const reloaded = await PDFDocument.load(pdf);
    expect(reloaded.getPageCount()).toBe(1);
    expect(reloaded.getTitle()).toBe('AV Script - My Film');
  });

  it('paginates 100+ rows with repeating headers and a searchable tail', async () => {
    const rows = Array.from({ length: 120 }, (_, index) => makeAvRow(index));
    const pdf = await createAvScriptPdf({ productionTitle: 'My Film', rows, generatedAt: FIXED_DATE });
    const reloaded = await PDFDocument.load(pdf);
    expect(reloaded.getPageCount()).toBeGreaterThan(1);
    const combined = inflateContentStreams(pdf).join('\n');
    expect(combined).toContain(pdfHexToken('VideoMarker-119'));
  });

  it('resolves linked numbers from the shot list and prints NO CAMERA rows', () => {
    const rows = avScriptRowsFromAvRows(
      [
        { id: 'r1', shotNumber: 'STALE', video: 'v', audio: 'a', linkedShotId: 'shot-9' },
        { id: 'r2', shotNumber: '7', shotName: 'Titles', video: 'v', audio: 'a', noShot: true },
      ],
      [{ id: 'shot-9', shotNumber: '9A' }],
    );
    expect(rows[0][0]).toBe('9A');
    expect(rows[1][1]).toContain('NO CAMERA');
  });

  it('keeps euro signs and umlauts, mapping the rest per policy', async () => {
    const pdf = await createAvScriptPdf({
      productionTitle: 'My Film',
      rows: [{ ...makeAvRow(0), video: 'Müller pays 12 €', audio: 'Cue → done' }],
      generatedAt: FIXED_DATE,
    });
    const combined = inflateContentStreams(pdf).join('\n');
    expect(combined).toContain(pdfHexToken('Müller'));
    expect(combined).toContain('31322080');
    expect(combined).toContain(pdfHexToken('?'));
  });

  it('watermarks drafts only where the input carries draft state', async () => {
    const base = { productionTitle: 'My Film', rows: [makeAvRow(0)], generatedAt: FIXED_DATE };
    const draft = await createAvScriptPdf({ ...base, draft: 'Preliminary' });
    const final = await createAvScriptPdf(base);
    expect(inflateContentStreams(draft).join('\n')).toContain(pdfHexToken('PRELIMINARY'));
    expect(inflateContentStreams(final).join('\n')).not.toContain(pdfHexToken('DRAFT'));
  });

  it('builds sensible filenames', () => {
    expect(buildAvScriptPdfFilename({ productionTitle: 'My Film' })).toBe('my-film_av-script.pdf');
    expect(buildAvScriptPdfFilename({ productionTitle: 'My Film', date: '2026-09-04' })).toBe(
      'my-film_av-script_2026-09-04.pdf',
    );
  });
});

describe('script breakdown PDF', () => {
  const characters = [{ id: 'char-john', canonicalName: 'JOHN' }];
  const items = [{ id: 'prop-gun', name: 'Propistol', category: 'prop' as const, notes: 'Hero' }];

  const smallInput = () => ({
    productionTitle: 'My Film',
    scenes: scriptReportScenesFromScenes([makeReportScene(0)], characters, items),
    characters: scriptReportCharactersFromReports([
      { character: { canonicalName: 'JOHN' }, castPerson: { displayName: 'Jane Doe' }, scenes: [{ sceneNumber: '1' }] },
    ]),
    locations: scriptReportLocationsFromBreakdown([
      { name: 'Diner', locationId: 'loc-1', scenes: [{ sceneNumber: '1' }] },
    ]),
    elements: scriptReportElementsFromItems(items, [{ sceneNumber: '1', breakdownItemIds: ['prop-gun'] }]),
    ...doodPdfFromDood({
      columns: [{ dayName: 'Day 01', date: '2026-09-04' }],
      rows: [{ displayName: 'JOHN', cells: [{ status: 'start' as const }] }],
    }),
    generatedAt: FIXED_DATE,
  });

  it('starts with %PDF- and reloads with the metadata title', async () => {
    const pdf = await createScriptReportsPdf(smallInput());
    expect(bytesToBinary(pdf.slice(0, 5))).toBe('%PDF-');
    const reloaded = await PDFDocument.load(pdf);
    expect(reloaded.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(reloaded.getTitle()).toBe('Script Breakdown - My Film');
  });

  it('paginates 100+ scenes and keeps the tail heading searchable', async () => {
    const scenes = Array.from({ length: 120 }, (_, index) => makeReportScene(index));
    const pdf = await createScriptReportsPdf({
      productionTitle: 'My Film',
      scenes: scriptReportScenesFromScenes(scenes, characters, items),
      sections: { scenes: true, characters: false, locations: false, elements: false, dood: false },
      generatedAt: FIXED_DATE,
    });
    const reloaded = await PDFDocument.load(pdf);
    expect(reloaded.getPageCount()).toBeGreaterThan(1);
    expect(inflateContentStreams(pdf).join('\n')).toContain(pdfHexToken('REPORT HEADING 119'));
  });

  it('maps domain shapes to rows (labels, eighths, DOOD codes)', () => {
    const [scene] = scriptReportScenesFromScenes([makeReportScene(0)], characters, items);
    expect(scene).toMatchObject({ intExt: 'INT', pages: '12/8', cast: 'JOHN', elements: 'Propistol' });
    const [element] = scriptReportElementsFromItems(items, [{ sceneNumber: '1', breakdownItemIds: ['prop-gun'] }]);
    expect(element).toMatchObject({ department: 'PROP', scenes: '1' });
    const dood = doodPdfFromDood({
      columns: [
        { dayName: 'Day 01' },
        { dayName: 'Day 02' },
        { dayName: 'Day 03' },
      ],
      rows: [
        {
          displayName: 'JOHN',
          cells: [{ status: 'start' }, { status: 'hold' }, { status: 'finish' }],
        },
      ],
    });
    expect(dood.rows[0]).toEqual({ displayName: 'JOHN', cells: ['SW', 'H', 'WF'], workDays: 2 });
  });

  it('keeps euro signs and umlauts, mapping the rest per policy', async () => {
    const pdf = await createScriptReportsPdf({
      ...smallInput(),
      scenes: [
        {
          sceneNumber: '1',
          intExt: 'INT',
          heading: 'Müller pays 12 €',
          timeOfDay: 'NIGHT',
          pages: '12/8',
          cast: 'JOHN',
          elements: 'Cue → done',
        },
      ],
    });
    const combined = inflateContentStreams(pdf).join('\n');
    expect(combined).toContain(pdfHexToken('Müller'));
    expect(combined).toContain('31322080');
    expect(combined).toContain(pdfHexToken('?'));
  });

  it('watermarks drafts only where the input carries draft state', async () => {
    const draft = await createScriptReportsPdf({ ...smallInput(), isDraft: true });
    const final = await createScriptReportsPdf(smallInput());
    expect(inflateContentStreams(draft).join('\n')).toContain(pdfHexToken('DRAFT'));
    expect(inflateContentStreams(final).join('\n')).not.toContain(pdfHexToken('DRAFT'));
  });

  it('builds sensible filenames', () => {
    expect(buildScriptReportsPdfFilename({ productionTitle: 'My Film' })).toBe(
      'my-film_script-breakdown.pdf',
    );
    expect(buildScriptReportsPdfFilename({ productionTitle: 'Les Misérables' })).toBe(
      'les-miserables_script-breakdown.pdf',
    );
  });
});

describe('lined screenplay PDF', () => {
  it('starts with %PDF- and reloads with one page and the metadata title', async () => {
    const pdf = await createLinedScriptPdf({
      productionTitle: 'My Film',
      lines: makeLinedLines(2),
      generatedAt: FIXED_DATE,
    });
    expect(bytesToBinary(pdf.slice(0, 5))).toBe('%PDF-');
    const reloaded = await PDFDocument.load(pdf);
    expect(reloaded.getPageCount()).toBe(1);
    expect(reloaded.getTitle()).toBe('Screenplay - My Film');
  });

  it('paginates a long script between scenes and keeps the tail searchable', async () => {
    const pdf = await createLinedScriptPdf({
      productionTitle: 'My Film',
      lines: makeLinedLines(60),
      generatedAt: FIXED_DATE,
    });
    const reloaded = await PDFDocument.load(pdf);
    expect(reloaded.getPageCount()).toBeGreaterThan(1);
    const combined = inflateContentStreams(pdf).join('\n');
    expect(combined).toContain(pdfHexToken('LinedMarker-59'));
    expect(combined).toContain(pdfHexToken('Generated 2026-09-04'));
  });

  it('prints omitted slugs and scene numbers in the stream', async () => {
    const pdf = await createLinedScriptPdf({
      productionTitle: 'My Film',
      lines: [
        { type: 'scene', text: 'INT. KEPT - DAY', sceneNumber: '1' },
        { type: 'action', text: 'Kept action.' },
        { type: 'scene', text: 'INT. GONE - DAY', sceneNumber: '2', omitted: true },
        { type: 'action', text: 'Parked body must not print.' },
      ],
      generatedAt: FIXED_DATE,
    });
    const combined = inflateContentStreams(pdf).join('\n');
    expect(combined).toContain(pdfHexToken('SCENE 2'));
    expect(combined).not.toContain(pdfHexToken('Parked body must not print.'));
  });

  it('keeps euro signs and umlauts, mapping the rest per policy', async () => {
    const pdf = await createLinedScriptPdf({
      productionTitle: 'My Film',
      lines: [{ type: 'dialogue', text: 'Müller pays 12 €, cue → done' }],
      generatedAt: FIXED_DATE,
    });
    const combined = inflateContentStreams(pdf).join('\n');
    expect(combined).toContain(pdfHexToken('Müller'));
    expect(combined).toContain('31322080');
    expect(combined).toContain(pdfHexToken('?'));
  });

  it('watermarks drafts only where the input carries draft state', async () => {
    const base = { productionTitle: 'My Film', lines: makeLinedLines(1), generatedAt: FIXED_DATE };
    const draft = await createLinedScriptPdf({ ...base, draft: true });
    const final = await createLinedScriptPdf(base);
    expect(inflateContentStreams(draft).join('\n')).toContain(pdfHexToken('DRAFT'));
    expect(inflateContentStreams(final).join('\n')).not.toContain(pdfHexToken('DRAFT'));
  });

  it('builds sensible filenames', () => {
    expect(buildLinedScriptPdfFilename({ productionTitle: 'My Film' })).toBe('my-film_screenplay.pdf');
    expect(buildLinedScriptPdfFilename({ productionTitle: 'My Film', date: 'tomorrow' })).toBe(
      'my-film_screenplay.pdf',
    );
  });

  it('sets the body in Courier on US Letter', async () => {
    const pdf = await createLinedScriptPdf({
      productionTitle: 'My Film',
      lines: makeLinedLines(1),
      generatedAt: FIXED_DATE,
    });
    // Standard-14 fonts are referenced, not embedded: the font name sits in
    // the page resources. The shell chrome (title block, footer) keeps the
    // app's Helvetica paperwork identity; the screenplay body is Courier.
    const raw = bytesToBinary(pdf);
    expect(raw).toContain('/Courier');
    const reloaded = await PDFDocument.load(pdf);
    const page = reloaded.getPage(0);
    expect(page.getWidth()).toBeCloseTo(612, 0);
    expect(page.getHeight()).toBeCloseTo(792, 0);
  });

  it('prints the enabled title page first, on its own page', async () => {
    const pdf = await createLinedScriptPdf({
      productionTitle: 'My Film',
      scriptTitle: 'Fallback Title',
      titlePage: { enabled: true, title: 'My Epic', authors: 'Jane Doe', contact: 'jane@example.com' },
      lines: makeLinedLines(1),
      generatedAt: FIXED_DATE,
    });
    const reloaded = await PDFDocument.load(pdf);
    expect(reloaded.getPageCount()).toBe(2);
    const combined = inflateContentStreams(pdf).join('\n');
    const titleAt = combined.indexOf(pdfHexToken('MY EPIC'));
    const slugAt = combined.indexOf(pdfHexToken('INT. LINED PLACE 0 - NIGHT'));
    expect(titleAt).toBeGreaterThanOrEqual(0);
    expect(slugAt).toBeGreaterThanOrEqual(0);
    expect(titleAt).toBeLessThan(slugAt);
    expect(combined).toContain(pdfHexToken('Jane Doe'));
  });

  it('lets the cover replace the paperwork title block', async () => {
    const pdf = await createLinedScriptPdf({
      productionTitle: 'My Film',
      titlePage: { enabled: true, title: 'Cover Title', authors: 'Jane Doe' },
      lines: makeLinedLines(1),
      generatedAt: FIXED_DATE,
    });
    const combined = inflateContentStreams(pdf).join('\n');
    // The cover carries the production; the "My Film / Screenplay" block
    // underneath would demote it to a preface.
    expect(combined).not.toContain(pdfHexToken('My Film'));
    expect(combined).not.toContain(pdfHexToken('Screenplay'));
    expect(combined).toContain(pdfHexToken('COVER TITLE'));
  });

  it('keeps the title block when no cover prints', async () => {
    const pdf = await createLinedScriptPdf({
      productionTitle: 'My Film',
      lines: makeLinedLines(1),
      generatedAt: FIXED_DATE,
    });
    const combined = inflateContentStreams(pdf).join('\n');
    expect(combined).toContain(pdfHexToken('My Film'));
    expect(combined).toContain(pdfHexToken('Screenplay'));
  });

  it('prints no cover without opt-in or without content', async () => {
    const lines = makeLinedLines(1);
    const withoutOptIn = await createLinedScriptPdf({
      productionTitle: 'My Film',
      scriptTitle: 'Fallback Title',
      lines,
      generatedAt: FIXED_DATE,
    });
    expect((await PDFDocument.load(withoutOptIn)).getPageCount()).toBe(1);
    // Enabled but empty: rule 13 — never invent a cover, never a blank page.
    const emptyCover = await createLinedScriptPdf({
      productionTitle: 'My Film',
      titlePage: { enabled: true },
      lines,
      generatedAt: FIXED_DATE,
    });
    expect((await PDFDocument.load(emptyCover)).getPageCount()).toBe(1);
  });
});
