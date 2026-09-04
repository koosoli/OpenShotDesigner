/**
 * Client-side PDF layer tests.
 *
 * Strategy: generate real PDFs, then verify them the way a crew member's
 * reader would — magic bytes, reload in pdf-lib, metadata, page counts —
 * plus byte-level checks on the content streams. pdf-lib compresses each
 * content stream with zlib-wrapped flate, so streams are sliced out with
 * their /Length and inflated with fflate's `unzlibSync` (not `inflateSync`,
 * which expects raw deflate and fails on these streams — verified while
 * building the layer).
 */
import { PDFDocument } from 'pdf-lib';
import { unzipSync, unzlibSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import type { EquipmentItem, MasterEquipmentItem, SceneSetup, Shot } from '../../../types';
import {
  buildPdfFilename,
  createEquipmentManifestPdf,
  createShotListPdf,
  equipmentManifestItemsFromEquipmentItems,
  paginateTableRows,
  sanitizePdfText,
  shotListRowsFromSetups,
  zipPdfs,
} from '../index';
import type { ShotListPdfRow } from '../index';

const FIXED_DATE = new Date('2026-09-04T08:00:00.000Z');
const LOGO_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const logoBytes = (): Uint8Array => Uint8Array.from(atob(LOGO_PNG_BASE64), (ch) => ch.charCodeAt(0));

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

const countOccurrences = (haystack: string, needle: string): number =>
  haystack.split(needle).length - 1;

const makeShot = (overrides: Partial<Shot>): Shot => ({
  id: 'shot-1',
  sceneNumber: '4',
  shotNumber: '1A',
  name: 'NightExterior-QR7',
  cameraId: 'cam-a',
  cameraLabel: 'A',
  shotSize: 'WS',
  lensMm: 35,
  cameraAngle: 'Eye Level',
  movement: 'Static',
  aspectRatio: '16:9',
  frameRate: 24,
  subjectActorIds: [],
  framingDescription: 'Wide on the diner',
  status: 'planned',
  takesCount: 0,
  estDurationSeconds: 12,
  order: 0,
  ...overrides,
});

const makeSetup = (shots: Shot[]): SceneSetup => ({
  id: 'setup-1',
  name: 'Night Diner',
  sceneNumber: '4',
  location: 'Diner',
  timeOfDay: 'Night INT',
  elements: [],
  shots,
  currentBeat: 1,
  totalBeats: 1,
  gridSettings: { size: 40, snap: true, showGrid: true, unit: 'm', pixelsPerUnit: 40 },
  canvasScale: 1,
  canvasOffset: { x: 0, y: 0 },
});

const makeShotRow = (index: number): ShotListPdfRow => ({
  scene: '4',
  shot: `1${String.fromCharCode(65 + (index % 26))}`,
  name: `ShotMarker-${index}`,
  camera: 'A',
  size: 'MS',
  lens: '50mm',
  movement: 'Static',
  status: 'planned',
  notes: 'notes',
});

describe('shot list PDF', () => {
  it('starts with %PDF- and reloads with one page and the metadata title', async () => {
    const pdf = await createShotListPdf({
      productionTitle: 'My Film',
      rows: [makeShotRow(0), makeShotRow(1)],
      generatedAt: FIXED_DATE,
    });
    expect(bytesToBinary(pdf.slice(0, 5))).toBe('%PDF-');
    const reloaded = await PDFDocument.load(pdf);
    expect(reloaded.getPageCount()).toBe(1);
    expect(reloaded.getTitle()).toBe('Shot List - My Film');
  });

  it('paginates a long table across several pages with repeating headers', async () => {
    const rows = Array.from({ length: 120 }, (_, index) => makeShotRow(index));
    const pdf = await createShotListPdf({ productionTitle: 'My Film', rows, generatedAt: FIXED_DATE });
    const reloaded = await PDFDocument.load(pdf);
    expect(reloaded.getPageCount()).toBeGreaterThan(1);
    const combined = inflateContentStreams(pdf).join('\n');
    // The column header is drawn once per page by the table renderer.
    expect(countOccurrences(combined, pdfHexToken('Name / Subject'))).toBe(reloaded.getPageCount());
    // A marker from the tail end made it onto a later page.
    expect(combined).toContain(pdfHexToken('ShotMarker-119'));
  });

  it('carries page numbers and the generated date in the footer', async () => {
    const pdf = await createShotListPdf({
      productionTitle: 'My Film',
      rows: [makeShotRow(0)],
      generatedAt: FIXED_DATE,
    });
    const combined = inflateContentStreams(pdf).join('\n');
    expect(combined).toContain(pdfHexToken('Page 1 of 1'));
    expect(combined).toContain(pdfHexToken('Generated 2026-09-04'));
  });
});

describe('equipment manifest PDF', () => {
  const items = [
    { department: 'Camera & Optics', name: 'Alexa 35', brand: 'ARRI', model: 'Super 35', quantity: 1, role: 'A Cam', specs: '4.6K', usage: '' },
    { department: 'Lighting & Electrics', name: 'SkyPanel S60-C', brand: 'ARRI', model: 'LED', quantity: 2, role: 'Key', specs: 'RGBW', usage: 'Sc 4 (x2)' },
    { department: 'Grip & Rigging', name: 'C-Stand', brand: 'Matthews', model: '40 inch', quantity: 6, role: 'Support', specs: '', usage: '' },
  ];

  it('starts with %PDF- and reloads with one page and the metadata title', async () => {
    const pdf = await createEquipmentManifestPdf({
      productionTitle: 'My Film',
      scopeLabel: 'Master package - 6 scenes',
      items,
      generatedAt: FIXED_DATE,
    });
    expect(bytesToBinary(pdf.slice(0, 5))).toBe('%PDF-');
    const reloaded = await PDFDocument.load(pdf);
    expect(reloaded.getPageCount()).toBe(1);
    expect(reloaded.getTitle()).toBe('Equipment Manifest - My Film');
  });

  it('prints the confidentiality line when one is set', async () => {
    const pdf = await createEquipmentManifestPdf({
      productionTitle: 'My Film',
      items,
      confidentialityLine: 'CONFIDENTIAL - DO NOT DISTRIBUTE',
      generatedAt: FIXED_DATE,
    });
    expect(inflateContentStreams(pdf).join('\n')).toContain(pdfHexToken('CONFIDENTIAL - DO NOT DISTRIBUTE'));
  });
});

describe('draft watermark', () => {
  it('changes the output bytes and only appears on drafts', async () => {
    const input = { productionTitle: 'My Film', rows: [makeShotRow(0)], generatedAt: FIXED_DATE };
    const draft = await createShotListPdf({ ...input, draft: true });
    const final = await createShotListPdf(input);
    expect(bytesToBinary(draft)).not.toBe(bytesToBinary(final));
    expect(inflateContentStreams(draft).join('\n')).toContain(pdfHexToken('DRAFT'));
    expect(inflateContentStreams(final).join('\n')).not.toContain(pdfHexToken('DRAFT'));
  });

  it('accepts a custom watermark label', async () => {
    const pdf = await createShotListPdf({
      productionTitle: 'My Film',
      rows: [makeShotRow(0)],
      draft: 'Preliminary',
      generatedAt: FIXED_DATE,
    });
    expect(inflateContentStreams(pdf).join('\n')).toContain(pdfHexToken('PRELIMINARY'));
  });
});

describe('unicode-safe text', () => {
  it('keeps euro signs, umlauts and accents byte-identical', () => {
    expect(sanitizePdfText('Müller € café — OK')).toBe('Müller € café — OK');
  });

  it('replaces unencodable scripts deterministically and drops controls', () => {
    // One input character maps to exactly one output: CJK/emoji/arrow each
    // become "?", so the two-character word/expectation below has two.
    expect(sanitizePdfText('Take → 東京 🎬 take')).toBe('Take ? ?? ? take');
    expect(sanitizePdfText('a\u0000b')).toBe('ab');
    expect(sanitizePdfText('a\u00a0b')).toBe('a b');
  });

  it('renders the kept glyphs in the inflated content stream', async () => {
    const pdf = await createShotListPdf({
      productionTitle: 'My Film',
      rows: [{ ...makeShotRow(0), name: 'Müller', notes: '12 €' }],
      generatedAt: FIXED_DATE,
    });
    const combined = inflateContentStreams(pdf).join('\n');
    // pdf-lib draws text as hex Tj runs, so assertions target the WinAnsi
    // bytes: u-diaeresis is 0xFC ("Muller" hex contains 4DFC…), the euro
    // sign is 0x80 ("12 €" draws as <31322080>).
    expect(combined).toContain(pdfHexToken('Müller'));
    expect(combined).toContain('31322080');
    // The overridden name replaced the default marker: row data flows through.
    expect(combined).not.toContain(pdfHexToken('ShotMarker-0'));
  });
});

describe('production logo', () => {
  it('embeds a logo without breaking the document', async () => {
    const pdf = await createShotListPdf({
      productionTitle: 'My Film',
      rows: [makeShotRow(0)],
      logoPngBytes: logoBytes(),
      generatedAt: FIXED_DATE,
    });
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(1);
  });

  it('prints logo-less on corrupt bytes instead of throwing', async () => {
    const pdf = await createShotListPdf({
      productionTitle: 'My Film',
      rows: [makeShotRow(0)],
      logoPngBytes: new Uint8Array([0, 1, 2, 3]),
      generatedAt: FIXED_DATE,
    });
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(1);
  });
});

describe('row mappers', () => {
  it('flattens setups and shots in plan order like the CSV exporter', () => {
    const rows = shotListRowsFromSetups([
      makeSetup([makeShot({ shotNumber: '1A' }), makeShot({ id: 'shot-2', shotNumber: '1B', lensMm: 0 })]),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ scene: '4', shot: '1A', camera: 'A', lens: '35mm' });
    expect(rows[1].lens).toBe('');
  });

  it('maps equipment rows and keeps master scene usage', () => {
    const single: EquipmentItem = { id: 'e1', category: 'camera', name: 'Alexa 35', quantity: 1 };
    const master: MasterEquipmentItem = {
      id: 'e2',
      category: 'lighting',
      name: 'SkyPanel',
      brand: 'ARRI',
      quantity: 2,
      usedInSetups: [{ id: 's1', name: 'Night Diner', sceneNumber: '4', quantity: 2 }],
      maxConcurrentQuantity: 2,
    };
    const [first, second] = equipmentManifestItemsFromEquipmentItems([single, master]);
    expect(first.department).toBe('Camera & Optics');
    expect(second.usage).toBe('Sc 4 (x2)');
  });
});

describe('buildPdfFilename', () => {
  it('builds the canonical call-sheet name', () => {
    expect(
      buildPdfFilename({ production: 'My Film', document: 'call-sheet', qualifier: 'day-04', revision: 2 }),
    ).toBe('my-film_call-sheet_day-04_rev-2.pdf');
  });

  it('folds accents and strips illegal characters', () => {
    expect(buildPdfFilename({ production: 'Les Misérables', document: 'shot-list' })).toBe(
      'les-miserables_shot-list.pdf',
    );
    expect(
      buildPdfFilename({ production: 'Ocean’s 11: Director/Draft "2"', document: 'equipment-manifest' }),
    ).toBe('ocean-s-11-director-draft-2_equipment-manifest.pdf');
  });

  it('falls back, keeps rev- strings, and only accepts real dates', () => {
    expect(buildPdfFilename({ production: '', document: '' })).toBe('untitled-production_document.pdf');
    expect(buildPdfFilename({ production: 'My Film', document: 'shot-list', revision: 'rev-2' })).toBe(
      'my-film_shot-list_rev-2.pdf',
    );
    expect(
      buildPdfFilename({ production: 'My Film', document: 'shot-list', revision: 3, date: '2026-09-04' }),
    ).toBe('my-film_shot-list_rev-3_2026-09-04.pdf');
    expect(buildPdfFilename({ production: 'My Film', document: 'shot-list', date: 'tomorrow' })).toBe(
      'my-film_shot-list.pdf',
    );
  });
});

describe('paginateTableRows', () => {
  it('fills pages and never strands a lone final row (widow control)', () => {
    // Header 30 + 3 rows of 20 fit into 100; 7 rows would end 3/3/1.
    const pages = paginateTableRows([20, 20, 20, 20, 20, 20, 20], 30, 100);
    expect(pages).toEqual([
      [0, 1, 2],
      [3, 4],
      [5, 6],
    ]);
  });

  it('quarantines an oversize row on its own page instead of looping', () => {
    expect(paginateTableRows([200], 30, 100)).toEqual([[0]]);
  });
});

describe('zipPdfs', () => {
  it('round-trips named PDFs through fflate', async () => {
    const shotList = await createShotListPdf({ productionTitle: 'My Film', rows: [makeShotRow(0)], generatedAt: FIXED_DATE });
    const manifest = await createEquipmentManifestPdf({
      productionTitle: 'My Film',
      items: [
        { department: 'Camera & Optics', name: 'Alexa', brand: '', model: '', quantity: 1, role: '', specs: '', usage: '' },
      ],
      generatedAt: FIXED_DATE,
    });
    const archive = zipPdfs({
      'my-film_shot-list.pdf': shotList,
      'my-film_equipment-manifest.pdf': manifest,
    });
    const entries = unzipSync(archive);
    expect(Object.keys(entries).sort()).toEqual(['my-film_equipment-manifest.pdf', 'my-film_shot-list.pdf']);
    expect(bytesToBinary(entries['my-film_shot-list.pdf'].slice(0, 5))).toBe('%PDF-');
    expect(bytesToBinary(entries['my-film_shot-list.pdf'])).toBe(bytesToBinary(shotList));
  });

  it('rejects empty packs and unsafe archive names', () => {
    expect(() => zipPdfs({})).toThrow();
    expect(() => zipPdfs({ '../escape.pdf': new Uint8Array([1]) })).toThrow();
    expect(() => zipPdfs({ '/absolute.pdf': new Uint8Array([1]) })).toThrow();
  });
});
