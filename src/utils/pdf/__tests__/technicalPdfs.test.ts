/**
 * Technical-department PDF tests (DMX patch, power, rigging, logistics,
 * floor plan, storyboard).
 *
 * Same strategy as `pdf.test.ts`: generate real PDFs, verify magic bytes,
 * reload in pdf-lib, metadata, page counts, and inflate flate content
 * streams with fflate's `unzlibSync`, asserting on the uppercase hex
 * pdf-lib emits per drawText call. Image fixtures are a 1x1 PNG inline
 * (no new dependencies); corrupt bytes are a short non-image buffer.
 */
import { PDFDocument } from 'pdf-lib';
import { unzlibSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import type { DmxPatchSheetRow } from '../../../utils/dmxPatch';
import {
  buildDmxPatchPdfFilename,
  buildFloorPlanPdfFilename,
  buildLogisticsPdfFilename,
  buildPowerPdfFilename,
  buildRiggingPdfFilename,
  buildStoryboardPdfFilename,
  createDmxPatchPdf,
  createFloorPlanPdf,
  createLogisticsPdf,
  createPowerPdf,
  createRiggingPdf,
  createStoryboardPdf,
  dmxPatchRowsFromSheetRows,
} from '../index';
import type {
  DmxPatchPdfRow,
  LogisticsPdfContainer,
  LogisticsPdfItem,
  PowerPdfCircuit,
  PowerPdfConsumer,
  PowerPdfSource,
  RiggingPdfRun,
  StoryboardPdfFrame,
} from '../index';

const FIXED_DATE = new Date('2026-09-04T08:00:00.000Z');
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const CORRUPT_BYTES = new Uint8Array([0, 1, 2, 3]);

const tinyPng = (): Uint8Array => Uint8Array.from(atob(TINY_PNG_BASE64), (ch) => ch.charCodeAt(0));

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

const makeDmxRow = (index: number): DmxPatchPdfRow => ({
  label: `DmxMarker-${index}`,
  role: 'Key Light',
  universe: 1,
  address: index + 1,
  endAddress: index + 4,
  channels: 4,
  fixtureType: 'Wash',
  mode: 'Extended',
});

const makeConsumer = (index: number): PowerPdfConsumer => ({
  name: `PowerMarker-${index}`,
  quantity: 1,
  watts: 500,
  wattsSource: 'profile',
  circuitName: 'CircuitMarker-C1',
  trussLabel: 'Truss 1',
  distroZone: 'Zone A',
});

const powerCircuit = (): PowerPdfCircuit => ({
  name: 'CircuitMarker-C1',
  sourceName: 'SupplyMarker-S1',
  phaseLeg: 1,
  powerFactor: 1,
  watts: 1000,
  usedA: 4.3,
  maxAmperesA: 16,
  headroomA: 11.7,
  overloaded: false,
});

const powerSource = (): PowerPdfSource => ({
  name: 'SupplyMarker-S1',
  kind: 'Mains',
  voltageV: 230,
  ampsPerPhaseA: 32,
  phases: 3,
  knownWatts: 1000,
  apparentVA: 1100,
  capacityVA: 22000,
  overCapacity: false,
  legs: [{ leg: 1, watts: 1000, ampsA: 4.3 }],
});

const makeRigRun = (name: string, loadCount: number): RiggingPdfRun => ({
  name,
  profileLabel: 'Prolyte H30V',
  geometryLabel: 'Box',
  lengthMm: 6000,
  lengthFromProfile: false,
  selfWeightKg: 84,
  loadsKg: 120,
  unknownLoadCount: 0,
  clampsKg: 6,
  clampCount: 8,
  safetyCount: 8,
  cableAllowanceKg: 10,
  totalKg: 220,
  verdict: 'Within capacity - 44% of 500 kg',
  loads: Array.from({ length: loadCount }, (_, index) => ({
    label: `RigMarker-${index}`,
    quantity: 2,
    unitKg: 12.5,
    lineKg: 25,
    sourceLabel: 'Catalogue',
  })),
  hardware: [{ kindLabel: 'Motor', label: 'MotorMarker-A', positionMm: 1000, capacityKg: 500 }],
});

const makeLogItem = (index: number): LogisticsPdfItem => ({
  label: `LogMarker-${index}`,
  quantity: 1,
  unitKg: 12.5,
  lineKg: 12.5,
  packedVolumeL: 40,
});

const makeLogContainer = (name: string, itemCount: number): LogisticsPdfContainer => ({
  name,
  kindLabel: 'Case',
  tareKg: 8,
  maxPayloadKg: 500,
  usableVolumeL: 800,
  dimensionsLabel: '1200 x 800 x 600 mm',
  dayLabel: 'Day 3',
  locationLabel: 'Warehouse',
  items: Array.from({ length: itemCount }, (_, index) => makeLogItem(index)),
  totalWeightKg: 100,
  totalVolumeL: 400,
  verdict: 'Within payload - 20% of 500 kg',
});

const makeFrame = (index: number): StoryboardPdfFrame => ({
  imageBytes: tinyPng(),
  mimeType: 'image/png',
  shotNumber: `SB-${String(index + 1).padStart(3, '0')}`,
  caption: `FrameMarker-${index}`,
});

describe('DMX patch PDF', () => {
  it('starts with %PDF- and reloads with one page and the metadata title', async () => {
    const pdf = await createDmxPatchPdf({
      productionTitle: 'My Film',
      sceneName: 'Scene 4',
      rows: [makeDmxRow(0), makeDmxRow(1)],
      generatedAt: FIXED_DATE,
    });
    expect(bytesToBinary(pdf.slice(0, 5))).toBe('%PDF-');
    const reloaded = await PDFDocument.load(pdf);
    expect(reloaded.getPageCount()).toBe(1);
    expect(reloaded.getTitle()).toBe('DMX Patch - My Film');
  });

  it('paginates a long patch across several pages', async () => {
    const rows = Array.from({ length: 120 }, (_, index) => makeDmxRow(index));
    const pdf = await createDmxPatchPdf({ productionTitle: 'My Film', rows, generatedAt: FIXED_DATE });
    const reloaded = await PDFDocument.load(pdf);
    expect(reloaded.getPageCount()).toBeGreaterThan(1);
    expect(inflateContentStreams(pdf).join('\n')).toContain(pdfHexToken('DmxMarker-119'));
  });

  it('flags conflicts and carries footer facts', async () => {
    const pdf = await createDmxPatchPdf({
      productionTitle: 'My Film',
      rows: [{ ...makeDmxRow(0), conflict: true }],
      generatedAt: FIXED_DATE,
    });
    const combined = inflateContentStreams(pdf).join('\n');
    expect(combined).toContain(pdfHexToken('[CONFLICT]'));
    expect(combined).toContain(pdfHexToken('Page 1 of 1'));
    expect(combined).toContain(pdfHexToken('Generated 2026-09-04'));
  });

  it('maps print-view sheet rows, keeping unpatched fixtures visible', () => {
    const sheetRows: DmxPatchSheetRow[] = [
      { id: 'a', label: 'DmxMarker-0', universe: 1, address: 1, endAddress: 4, channels: 4, conflict: false },
      { id: 'b', label: 'UnpatchedMarker', channels: undefined, conflict: false },
    ];
    const rows = dmxPatchRowsFromSheetRows(sheetRows);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ label: 'DmxMarker-0', universe: 1, address: 1 });
    expect(rows[1].universe).toBeUndefined();
  });

  it('builds canonical filenames', () => {
    expect(buildDmxPatchPdfFilename({ productionTitle: 'My Film', sceneName: 'Scene 4' })).toBe(
      'my-film_dmx-patch_scene-4.pdf',
    );
    expect(
      buildDmxPatchPdfFilename({ productionTitle: 'My Film', sceneName: 'Scene 4', date: '2026-09-04' }),
    ).toBe('my-film_dmx-patch_scene-4_2026-09-04.pdf');
  });
});

describe('power plan PDF', () => {
  const input = {
    productionTitle: 'My Film',
    sceneName: 'Scene 4',
    consumers: [makeConsumer(0)],
    circuits: [powerCircuit()],
    sources: [powerSource()],
    totalKnownWatts: 500,
    unknownConsumerCount: 0,
    generatedAt: FIXED_DATE,
  };

  it('starts with %PDF- and reloads with one page and the metadata title', async () => {
    const pdf = await createPowerPdf(input);
    expect(bytesToBinary(pdf.slice(0, 5))).toBe('%PDF-');
    const reloaded = await PDFDocument.load(pdf);
    expect(reloaded.getPageCount()).toBe(1);
    expect(reloaded.getTitle()).toBe('Power Plan - My Film');
  });

  it('paginates a long consumer list across several pages', async () => {
    const consumers = Array.from({ length: 120 }, (_, index) => makeConsumer(index));
    const pdf = await createPowerPdf({ ...input, consumers });
    const reloaded = await PDFDocument.load(pdf);
    expect(reloaded.getPageCount()).toBeGreaterThan(1);
    expect(inflateContentStreams(pdf).join('\n')).toContain(pdfHexToken('PowerMarker-119'));
  });

  it('prints supplies, circuits and the known-load total as tokens', async () => {
    const pdf = await createPowerPdf(input);
    const combined = inflateContentStreams(pdf).join('\n');
    expect(combined).toContain(pdfHexToken('SupplyMarker-S1'));
    expect(combined).toContain(pdfHexToken('CircuitMarker-C1'));
    expect(combined).toContain(pdfHexToken('Known load total: 500 W'));
  });

  it('builds canonical filenames', () => {
    expect(buildPowerPdfFilename({ productionTitle: 'My Film', sceneName: 'Scene 4' })).toBe(
      'my-film_power-plan_scene-4.pdf',
    );
  });
});

describe('rigging plan PDF', () => {
  it('starts with %PDF- and reloads with one page and the metadata title', async () => {
    const pdf = await createRiggingPdf({
      productionTitle: 'My Film',
      runs: [makeRigRun('TrussMarker-A', 2)],
      unassignedHardware: [],
      assumptionsLine: 'Clamp 0.5 kg, safety 0.3 kg, cable allowance 10 kg per run.',
      generatedAt: FIXED_DATE,
    });
    expect(bytesToBinary(pdf.slice(0, 5))).toBe('%PDF-');
    const reloaded = await PDFDocument.load(pdf);
    expect(reloaded.getPageCount()).toBe(1);
    expect(reloaded.getTitle()).toBe('Rigging Plan - My Film');
  });

  it('paginates a run with many loads across several pages', async () => {
    const pdf = await createRiggingPdf({
      productionTitle: 'My Film',
      runs: [makeRigRun('TrussMarker-A', 120)],
      unassignedHardware: [],
      generatedAt: FIXED_DATE,
    });
    const reloaded = await PDFDocument.load(pdf);
    expect(reloaded.getPageCount()).toBeGreaterThan(1);
    expect(inflateContentStreams(pdf).join('\n')).toContain(pdfHexToken('RigMarker-119'));
  });

  it('prints the run name, verdict and loose hardware as tokens', async () => {
    const pdf = await createRiggingPdf({
      productionTitle: 'My Film',
      runs: [makeRigRun('TrussMarker-A', 1)],
      unassignedHardware: [{ kindLabel: 'Motor', label: 'LooseMarker-M1', capacityKg: 500 }],
      generatedAt: FIXED_DATE,
    });
    const combined = inflateContentStreams(pdf).join('\n');
    expect(combined).toContain(pdfHexToken('TrussMarker-A'));
    expect(combined).toContain(pdfHexToken('Within capacity - 44% of 500 kg'));
    expect(combined).toContain(pdfHexToken('LooseMarker-M1'));
  });

  it('builds canonical filenames', () => {
    expect(buildRiggingPdfFilename({ productionTitle: 'My Film' })).toBe('my-film_rigging-plan.pdf');
  });
});

describe('logistics plan PDF', () => {
  it('starts with %PDF- and reloads with one page and the metadata title', async () => {
    const pdf = await createLogisticsPdf({
      productionTitle: 'My Film',
      scopeLabel: 'Day 3',
      groups: [{ title: 'TruckMarker-1', containers: [makeLogContainer('CaseMarker-A', 2)] }],
      unassignedItems: [],
      fleet: {
        containerCount: 1,
        itemCount: 2,
        knownWeightKg: 100,
        topLevelWithUnknownWeight: 0,
        unknownWeightItemCount: 0,
      },
      generatedAt: FIXED_DATE,
    });
    expect(bytesToBinary(pdf.slice(0, 5))).toBe('%PDF-');
    const reloaded = await PDFDocument.load(pdf);
    expect(reloaded.getPageCount()).toBe(1);
    expect(reloaded.getTitle()).toBe('Logistics Plan - My Film');
  });

  it('paginates a container with many items across several pages', async () => {
    const pdf = await createLogisticsPdf({
      productionTitle: 'My Film',
      groups: [{ title: 'TruckMarker-1', containers: [makeLogContainer('CaseMarker-A', 120)] }],
      unassignedItems: [],
      generatedAt: FIXED_DATE,
    });
    const reloaded = await PDFDocument.load(pdf);
    expect(reloaded.getPageCount()).toBeGreaterThan(1);
    expect(inflateContentStreams(pdf).join('\n')).toContain(pdfHexToken('LogMarker-119'));
  });

  it('prints routing, verdict and unpacked gear as tokens', async () => {
    const pdf = await createLogisticsPdf({
      productionTitle: 'My Film',
      groups: [{ title: 'TruckMarker-1', containers: [makeLogContainer('CaseMarker-A', 1)] }],
      unassignedItems: [{ label: 'LooseGearMarker', quantity: 1 }],
      generatedAt: FIXED_DATE,
    });
    const combined = inflateContentStreams(pdf).join('\n');
    expect(combined).toContain(pdfHexToken('Day: Day 3 - To: Warehouse'));
    expect(combined).toContain(pdfHexToken('Within payload - 20% of 500 kg'));
    expect(combined).toContain(pdfHexToken('LooseGearMarker'));
  });

  it('builds canonical filenames', () => {
    expect(buildLogisticsPdfFilename({ productionTitle: 'My Film', scopeLabel: 'Day 3' })).toBe(
      'my-film_logistics-plan_day-3.pdf',
    );
  });
});

describe('floor plan PDF', () => {
  it('embeds the plan image on a single landscape page with the metadata title', async () => {
    const pdf = await createFloorPlanPdf({
      productionTitle: 'My Film',
      sceneName: 'Scene 4',
      scale: '1:50',
      date: '2026-09-04',
      imageBytes: tinyPng(),
      mimeType: 'image/png',
      generatedAt: FIXED_DATE,
    });
    expect(bytesToBinary(pdf.slice(0, 5))).toBe('%PDF-');
    const reloaded = await PDFDocument.load(pdf);
    expect(reloaded.getPageCount()).toBe(1);
    expect(reloaded.getTitle()).toBe('Floor Plan - My Film');
    const combined = inflateContentStreams(pdf).join('\n');
    expect(combined).toContain(pdfHexToken('Scale 1:50'));
    expect(combined).toContain(pdfHexToken('Generated 2026-09-04'));
  });

  it('prints the title block without an image instead of throwing on corrupt bytes', async () => {
    const pdf = await createFloorPlanPdf({
      productionTitle: 'My Film',
      sceneName: 'Scene 4',
      imageBytes: CORRUPT_BYTES,
      generatedAt: FIXED_DATE,
    });
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(1);
    expect(inflateContentStreams(pdf).join('\n')).toContain(pdfHexToken('No floor plan image embedded.'));
  });

  it('renders image-less when no bytes are supplied', async () => {
    const pdf = await createFloorPlanPdf({ productionTitle: 'My Film', generatedAt: FIXED_DATE });
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(1);
  });

  it('builds canonical filenames', () => {
    expect(buildFloorPlanPdfFilename({ productionTitle: 'My Film', sceneName: 'Scene 4' })).toBe(
      'my-film_floor-plan_scene-4.pdf',
    );
  });
});

describe('storyboard PDF', () => {
  it('starts with %PDF- and reloads with the metadata title', async () => {
    const pdf = await createStoryboardPdf({
      productionTitle: 'My Film',
      subtitle: 'Scene 4 - Night Diner',
      frames: [makeFrame(0), makeFrame(1), { shotNumber: 'SB-003' }],
      generatedAt: FIXED_DATE,
    });
    expect(bytesToBinary(pdf.slice(0, 5))).toBe('%PDF-');
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(1);
    expect((await PDFDocument.load(pdf)).getTitle()).toBe('Storyboard - My Film');
    const combined = inflateContentStreams(pdf).join('\n');
    expect(combined).toContain(pdfHexToken('SB-001'));
    expect(combined).toContain(pdfHexToken('FrameMarker-0'));
  });

  it('paginates many frames across several pages', async () => {
    const frames = Array.from({ length: 24 }, (_, index) => makeFrame(index));
    const pdf = await createStoryboardPdf({ productionTitle: 'My Film', frames, generatedAt: FIXED_DATE });
    const reloaded = await PDFDocument.load(pdf);
    expect(reloaded.getPageCount()).toBeGreaterThan(1);
    expect(inflateContentStreams(pdf).join('\n')).toContain(pdfHexToken('FrameMarker-23'));
  });

  it('survives one corrupt frame without losing the rest of the sheet', async () => {
    const pdf = await createStoryboardPdf({
      productionTitle: 'My Film',
      frames: [
        makeFrame(0),
        { imageBytes: CORRUPT_BYTES, mimeType: 'image/png', shotNumber: 'SB-002', caption: 'BrokenMarker' },
        makeFrame(2),
      ],
      generatedAt: FIXED_DATE,
    });
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(1);
    const combined = inflateContentStreams(pdf).join('\n');
    expect(combined).toContain(pdfHexToken('BrokenMarker'));
    expect(combined).toContain(pdfHexToken('FrameMarker-2'));
  });

  it('embeds through the JPEG fallback when the MIME type disagrees', async () => {
    const frame: StoryboardPdfFrame = {
      imageBytes: tinyPng(),
      mimeType: 'image/jpeg',
      shotNumber: 'SB-009',
      caption: 'MimeFallbackMarker',
    };
    const pdf = await createStoryboardPdf({ productionTitle: 'My Film', frames: [frame], generatedAt: FIXED_DATE });
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(1);
    expect(inflateContentStreams(pdf).join('\n')).toContain(pdfHexToken('MimeFallbackMarker'));
  });

  it('builds canonical filenames', () => {
    expect(buildStoryboardPdfFilename({ productionTitle: 'My Film', sceneName: 'Scene 4' })).toBe(
      'my-film_storyboard_scene-4.pdf',
    );
  });
});
