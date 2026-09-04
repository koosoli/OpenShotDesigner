/**
 * Schedule / people / set PDF tests (stripboard, production calendar,
 * coverage matrix, run of show, crew sheet, set reports).
 *
 * Same strategy as `pdf.test.ts`: generate real PDFs, verify magic bytes,
 * reload in pdf-lib, metadata, page counts, and inflate flate content
 * streams with fflate's `unzlibSync`, asserting on the uppercase hex
 * pdf-lib emits per drawText call.
 */
import { PDFDocument } from 'pdf-lib';
import { unzlibSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import type { CameraReportRow, SetReport, SoundReportRow } from '../../../domain/continuity';
import type { Person } from '../../../domain/people';
import type { CrewSheetData } from '../../../domain/reports/crewSheet';
import type { DailyProgressReport } from '../../../domain/reports';
import {
  buildCalendarPdfFilename,
  buildContactSheetPdfFilename,
  buildCoveragePdfFilename,
  buildCrewSheetPdfFilename,
  buildRunOfShowPdfFilename,
  buildSetReportPdfFilename,
  buildStripboardPdfFilename,
  calendarDaysFromPrintable,
  calendarEventsFromPrintable,
  coverageRowsFromPrintable,
  createCalendarPdf,
  createCoveragePdf,
  createCrewSheetPdf,
  createRunOfShowPdf,
  createSetReportPdf,
  createStripboardPdf,
  crewSheetCastFromContactList,
  crewSheetDepartmentsFromCrewSheet,
  runOfShowCuesFromPrintable,
  stripboardDaysFromPrintable,
} from '../index';
import type {
  CalendarPdfDay,
  CalendarPdfEvent,
  CoveragePdfRow,
  CrewSheetPdfCastEntry,
  CrewSheetPdfDepartment,
  RunOfShowPdfCue,
  StripboardPdfDay,
} from '../index';

const FIXED_DATE = new Date('2026-09-04T08:00:00.000Z');
const CORRUPT_BYTES = new Uint8Array([0, 1, 2, 3]);

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

const makeStripDay = (dayIndex: number, strips: number): StripboardPdfDay => ({
  id: `day-${dayIndex}`,
  name: `Day ${dayIndex}`,
  date: '2026-09-04',
  crewCall: '07:00',
  plannedWrap: '19:00',
  items: Array.from({ length: strips }, (_, index) =>
    index % 5 === 0
      ? { label: `Scene ${index} - Night Diner`, kindLabel: 'Scene', minutes: 30, pageEighths: 16 }
      : {
          label: `StripMarker-${dayIndex}-${index}`,
          kindLabel: 'Setup',
          minutes: 20,
          castNumbers: [1, 2],
          pageEighths: 8,
        },
  ),
  totalMinutes: strips * 20,
});

const makeCalendarDay = (index: number): CalendarPdfDay => ({
  name: `Day ${index}`,
  date: `2026-09-${String((index % 28) + 1).padStart(2, '0')}`,
  crewCall: '07:00',
  plannedWrap: '19:00',
  totalMinutes: 120,
  items: [`CalendarMarker-${index}`, 'Second strip'],
});

const makeCalendarEvent = (index: number): CalendarPdfEvent => ({
  title: `LineMarker-${index}`,
  startDate: '2026-09-01',
  endDate: '2026-09-10',
  category: index % 2 === 0 ? 'shoot' : 'post',
  status: 'planned',
});

const makeCoverageRow = (index: number, cameras: number): CoveragePdfRow => ({
  label: `CoverageMarker-${index}`,
  cells: Array.from({ length: cameras }, (_, camera) => (camera === index % cameras ? 'Wide' : '')),
});

const makeCue = (index: number): RunOfShowPdfCue => ({
  id: `cue-${index}`,
  number: index + 1,
  label: `CueMarker-${index}`,
  segmentName: 'Act One',
  startSeconds: 20 * 3600 + index * 60,
  durationSeconds: 90,
  notes: [{ department: 'Lighting', text: `LX note ${index}` }],
});

const makeDepartment = (name: string, members: number): CrewSheetPdfDepartment => ({
  name,
  members: Array.from({ length: members }, (_, index) => ({
    name: `CrewMarker-${name}-${index}`,
    role: 'Operator',
    phone: '+1 555 0100',
    email: 'crew@example.com',
  })),
});

const makeCast = (count: number): CrewSheetPdfCastEntry[] =>
  Array.from({ length: count }, (_, index) => ({
    character: `Character ${index}`,
    performer: `PerformerMarker-${index}`,
    phone: '+1 555 0200',
    email: 'cast@example.com',
  }));

const makeCameraRoll = (roll: string, takes: number): SetReport<CameraReportRow>['rolls'][number] => ({
  roll,
  unnamed: false,
  rows: Array.from({ length: takes }, (_, index) => ({
    takeId: `take-${roll}-${index}`,
    fileName: `A001C${String(index).padStart(3, '0')}`,
    scene: '4',
    shot: '1A',
    take: index + 1,
    camera: 'A',
    description: `CameraMarker-${roll}-${index}`,
    lens: '35mm',
    fps: '24',
    isGoodTake: index % 3 === 0 ? true : undefined,
    mos: false,
  })),
  goodCount: 1,
  ngCount: 0,
});

const makeSoundRoll = (roll: string, takes: number): SetReport<SoundReportRow>['rolls'][number] => ({
  roll,
  unnamed: false,
  rows: Array.from({ length: takes }, (_, index) => ({
    takeId: `take-${roll}-${index}`,
    soundFileName: `SND${index}`,
    scene: '4',
    shot: '1A',
    take: index + 1,
    isGoodTake: undefined,
    mos: index % 4 === 0,
    wildTrack: index % 7 === 0,
  })),
  goodCount: 0,
  ngCount: 0,
});

const makeDailyReport = (scenes: number): DailyProgressReport => ({
  productionDayId: 'day-1',
  dayName: 'Day 1',
  date: '2026-09-04',
  crewCall: '07:00',
  plannedWrap: '19:00',
  scenes: Array.from({ length: scenes }, (_, index) => ({
    sceneNumber: String(index + 1),
    pageEighths: 8,
    plannedShots: 4,
    coveredShots: index % 2 === 0 ? 4 : 1,
    complete: index % 2 === 0,
  })),
  scenesScheduled: scenes,
  scenesCompleted: Math.ceil(scenes / 2),
  pagesScheduledEighths: scenes * 8,
  pagesCoveredEighths: scenes * 4,
  setupsScheduled: scenes,
  setupsCompleted: Math.ceil(scenes / 2),
  shotsScheduled: scenes * 4,
  shotsCovered: scenes * 2,
  shotsAttempted: 1,
  shotsNotShot: [],
  shotsUnscheduled: [],
  takesLogged: scenes * 3,
  takesGood: scenes * 2,
  takesNg: 1,
  firstTakeAt: '08:10',
  lastTakeAt: '18:40',
  shootingSpanMinutes: 630,
  scheduleVarianceMinutes: 30,
  scheduleVarianceLabel: '30m behind',
});

describe('stripboard PDF', () => {
  it('starts with %PDF- and reloads with one page and the metadata title', async () => {
    const pdf = await createStripboardPdf({
      productionTitle: 'My Film',
      days: [makeStripDay(1, 3)],
      generatedAt: FIXED_DATE,
    });
    expect(bytesToBinary(pdf.slice(0, 5))).toBe('%PDF-');
    const reloaded = await PDFDocument.load(pdf);
    expect(reloaded.getPageCount()).toBe(1);
    expect(reloaded.getTitle()).toBe('Stripboard - My Film');
  });

  it('paginates long boards and groups strips under scene headings', async () => {
    const days = Array.from({ length: 5 }, (_, index) => makeStripDay(index + 1, 30));
    const pdf = await createStripboardPdf({ productionTitle: 'My Film', days, generatedAt: FIXED_DATE });
    const reloaded = await PDFDocument.load(pdf);
    expect(reloaded.getPageCount()).toBeGreaterThan(1);
    const combined = inflateContentStreams(pdf).join('\n');
    // A scene strip doubles as group heading and first table row: drawn twice.
    expect(countOccurrences(combined, pdfHexToken('Scene 0 - Night Diner'))).toBeGreaterThanOrEqual(2);
    expect(combined).toContain(pdfHexToken('StripMarker-4-29'));
    expect(combined).toContain(pdfHexToken('Generated 2026-09-04'));
    expect(combined).toContain(pdfHexToken('Page 1 of '));
  });

  it('renders an empty board without throwing', async () => {
    const pdf = await createStripboardPdf({ productionTitle: 'My Film', days: [], generatedAt: FIXED_DATE });
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(1);
    expect(inflateContentStreams(pdf).join('\n')).toContain(pdfHexToken('No shooting days scheduled yet.'));
  });

  it('keeps umlauts and the euro sign byte-identical in the stream', async () => {
    const pdf = await createStripboardPdf({
      productionTitle: 'My Film',
      days: [{ ...makeStripDay(1, 1), items: [{ label: 'Müller 12 €', kindLabel: 'Setup', minutes: 10 }] }],
      generatedAt: FIXED_DATE,
    });
    const combined = inflateContentStreams(pdf).join('\n');
    expect(combined).toContain(pdfHexToken('Müller 12 '));
    expect(combined).toContain('31322080');
  });

  it('maps the print view model and builds filenames', () => {
    const days = stripboardDaysFromPrintable([
      { id: 'd1', name: 'Day 1', items: [{ label: 'Sc 4', kindLabel: 'Scene', tone: '#000', minutes: 5 }], totalMinutes: 5 },
    ]);
    expect(days[0].items[0]).toMatchObject({ label: 'Sc 4', kindLabel: 'Scene', minutes: 5 });
    expect(days[0].items[0]).not.toHaveProperty('tone');
    expect(buildStripboardPdfFilename({ productionTitle: 'My Film' })).toBe('my-film_stripboard.pdf');
    expect(buildStripboardPdfFilename({ productionTitle: 'Les Misérables', qualifier: 'Day 04', date: '2026-09-04' })).toBe(
      'les-miserables_stripboard_day-04_2026-09-04.pdf',
    );
  });
});

describe('production calendar PDF', () => {
  it('starts with %PDF- and reloads with one page and the metadata title', async () => {
    const pdf = await createCalendarPdf({
      productionTitle: 'My Film',
      events: [makeCalendarEvent(0)],
      days: [makeCalendarDay(0)],
      generatedAt: FIXED_DATE,
    });
    expect(bytesToBinary(pdf.slice(0, 5))).toBe('%PDF-');
    const reloaded = await PDFDocument.load(pdf);
    expect(reloaded.getPageCount()).toBe(1);
    expect(reloaded.getTitle()).toBe('Production Calendar - My Film');
  });

  it('paginates a long calendar across several pages', async () => {
    const pdf = await createCalendarPdf({
      productionTitle: 'My Film',
      events: Array.from({ length: 20 }, (_, index) => makeCalendarEvent(index)),
      days: Array.from({ length: 100 }, (_, index) => makeCalendarDay(index)),
      generatedAt: FIXED_DATE,
    });
    const reloaded = await PDFDocument.load(pdf);
    expect(reloaded.getPageCount()).toBeGreaterThan(1);
    const combined = inflateContentStreams(pdf).join('\n');
    expect(combined).toContain(pdfHexToken('LineMarker-19'));
    expect(combined).toContain(pdfHexToken('CalendarMarker-99'));
    expect(combined).toContain(pdfHexToken('Generated 2026-09-04'));
  });

  it('maps printable events/days and builds filenames', () => {
    expect(calendarEventsFromPrintable([{ title: 'T', startDate: '2026-09-01', endDate: '2026-09-02', category: 'shoot' }])).toEqual([
      { title: 'T', startDate: '2026-09-01', endDate: '2026-09-02', category: 'shoot' },
    ]);
    expect(calendarDaysFromPrintable([{ name: 'Day 1', items: ['A'] }])).toEqual([{ name: 'Day 1', items: ['A'] }]);
    expect(buildCalendarPdfFilename({ productionTitle: 'My Film' })).toBe('my-film_calendar.pdf');
    expect(buildCalendarPdfFilename({ productionTitle: 'My Film', qualifier: '2026-09', date: 'tomorrow' })).toBe(
      'my-film_calendar_2026-09.pdf',
    );
  });

  it('keeps umlauts and the euro sign byte-identical in the stream', async () => {
    const pdf = await createCalendarPdf({
      productionTitle: 'My Film',
      events: [{ title: 'Müller 12 €', startDate: '2026-09-01', endDate: '2026-09-02', category: 'shoot' }],
      days: [],
      generatedAt: FIXED_DATE,
    });
    const combined = inflateContentStreams(pdf).join('\n');
    expect(combined).toContain(pdfHexToken('Müller 12 '));
    expect(combined).toContain('31322080');
  });
});

describe('coverage matrix PDF', () => {
  const cameras = ['A', 'B', 'C'];

  it('starts with %PDF- and reloads with one page and the metadata title', async () => {
    const pdf = await createCoveragePdf({
      productionTitle: 'My Film',
      cameras,
      rows: [makeCoverageRow(0, cameras.length)],
      generatedAt: FIXED_DATE,
    });
    expect(bytesToBinary(pdf.slice(0, 5))).toBe('%PDF-');
    const reloaded = await PDFDocument.load(pdf);
    expect(reloaded.getPageCount()).toBe(1);
    expect(reloaded.getTitle()).toBe('Coverage Matrix - My Film');
  });

  it('paginates a large matrix with repeating headers', async () => {
    const wide = ['A', 'B', 'C', 'D', 'E', 'F'];
    const pdf = await createCoveragePdf({
      productionTitle: 'My Film',
      cameras: wide,
      rows: Array.from({ length: 80 }, (_, index) => makeCoverageRow(index, wide.length)),
      generatedAt: FIXED_DATE,
    });
    const reloaded = await PDFDocument.load(pdf);
    expect(reloaded.getPageCount()).toBeGreaterThan(1);
    const combined = inflateContentStreams(pdf).join('\n');
    expect(countOccurrences(combined, pdfHexToken('Row'))).toBe(reloaded.getPageCount());
    expect(combined).toContain(pdfHexToken('CoverageMarker-79'));
  });

  it('maps printable rows and builds filenames', () => {
    expect(coverageRowsFromPrintable([{ label: 'L', cells: ['Wide', ''] }])).toEqual([{ label: 'L', cells: ['Wide', ''] }]);
    expect(buildCoveragePdfFilename({ productionTitle: 'My Film' })).toBe('my-film_coverage-matrix.pdf');
    expect(buildCoveragePdfFilename({ productionTitle: '' })).toBe('untitled-production_coverage-matrix.pdf');
  });

  it('prints empty cells as dashes and keeps unicode byte-identical', async () => {
    const pdf = await createCoveragePdf({
      productionTitle: 'My Film',
      cameras: ['A'],
      rows: [{ label: 'Müller 12 €', cells: [''] }],
      generatedAt: FIXED_DATE,
    });
    const combined = inflateContentStreams(pdf).join('\n');
    expect(combined).toContain(pdfHexToken('Müller 12 '));
    expect(combined).toContain('31322080');
  });
});

describe('run of show PDF', () => {
  it('starts with %PDF- and reloads with one page and the metadata title', async () => {
    const pdf = await createRunOfShowPdf({
      productionTitle: 'My Film',
      cues: [makeCue(0)],
      totalRunTimeSeconds: 90,
      generatedAt: FIXED_DATE,
    });
    expect(bytesToBinary(pdf.slice(0, 5))).toBe('%PDF-');
    const reloaded = await PDFDocument.load(pdf);
    expect(reloaded.getPageCount()).toBe(1);
    expect(reloaded.getTitle()).toBe('Run of Show - My Film');
  });

  it('paginates a long cue list and prints issues', async () => {
    const pdf = await createRunOfShowPdf({
      productionTitle: 'My Film',
      cues: Array.from({ length: 120 }, (_, index) => makeCue(index)),
      totalRunTimeSeconds: 10800,
      issues: [{ severity: 'warning', message: 'IssueMarker-gap' }],
      generatedAt: FIXED_DATE,
    });
    const reloaded = await PDFDocument.load(pdf);
    expect(reloaded.getPageCount()).toBeGreaterThan(1);
    const combined = inflateContentStreams(pdf).join('\n');
    expect(combined).toContain(pdfHexToken('CueMarker-119'));
    expect(combined).toContain(pdfHexToken('IssueMarker-gap'));
    expect(combined).toContain(pdfHexToken('Generated 2026-09-04'));
  });

  it('maps printable cues and builds filenames', () => {
    const cues = runOfShowCuesFromPrintable([
      { id: 'c1', number: 1, label: 'Doors', startSeconds: null, durationSeconds: null, notes: [] },
    ]);
    expect(cues).toEqual([{ id: 'c1', number: 1, label: 'Doors', startSeconds: null, durationSeconds: null, notes: [] }]);
    expect(buildRunOfShowPdfFilename({ productionTitle: 'My Film' })).toBe('my-film_run-of-show.pdf');
  });

  it('keeps umlauts and the euro sign byte-identical in the stream', async () => {
    const pdf = await createRunOfShowPdf({
      productionTitle: 'My Film',
      cues: [{ ...makeCue(0), label: 'Müller 12 €' }],
      totalRunTimeSeconds: 90,
      generatedAt: FIXED_DATE,
    });
    const combined = inflateContentStreams(pdf).join('\n');
    expect(combined).toContain(pdfHexToken('Müller 12 '));
    expect(combined).toContain('31322080');
  });
});

describe('crew sheet PDF', () => {
  it('starts with %PDF- and reloads with one page and the metadata title', async () => {
    const pdf = await createCrewSheetPdf({
      productionTitle: 'My Film',
      dayName: 'Day 04',
      date: '2026-09-04',
      venue: 'Studio A',
      timeline: [{ start: '20:00', label: 'Doors' }],
      departments: [makeDepartment('Camera', 2)],
      cast: makeCast(1),
      generatedAt: FIXED_DATE,
    });
    expect(bytesToBinary(pdf.slice(0, 5))).toBe('%PDF-');
    const reloaded = await PDFDocument.load(pdf);
    expect(reloaded.getPageCount()).toBe(1);
    expect(reloaded.getTitle()).toBe('Crew Sheet - My Film');
  });

  it('paginates a large roster and keeps phone/email columns', async () => {
    const pdf = await createCrewSheetPdf({
      productionTitle: 'My Film',
      dayName: 'Day 04',
      departments: [
        makeDepartment('Camera', 30),
        makeDepartment('Lighting', 30),
        makeDepartment('Audio', 30),
        makeDepartment('Production', 30),
      ],
      cast: makeCast(20),
      generatedAt: FIXED_DATE,
    });
    const reloaded = await PDFDocument.load(pdf);
    expect(reloaded.getPageCount()).toBeGreaterThan(1);
    const combined = inflateContentStreams(pdf).join('\n');
    expect(combined).toContain(pdfHexToken('CrewMarker-Lighting-29'));
    expect(combined).toContain(pdfHexToken('PerformerMarker-19'));
    expect(combined).toContain(pdfHexToken('+1 555 0100'));
    expect(combined).toContain(pdfHexToken('crew@example.com'));
    expect(combined).toContain(pdfHexToken('Generated 2026-09-04'));
  });

  it('maps crew sheets and contact lists, preferring the production number', () => {
    const crew: Person[] = [
      { id: 'p1', displayName: 'Op A', kind: 'crew', department: 'Camera', role: 'Op', phone: '+1 111', productionPhone: '+1 999', privatePhone: '+1 000', email: 'a@example.com' },
    ];
    const sheet: CrewSheetData = {
      productionTitle: 'My Film',
      dayName: 'Day 1',
      timeline: [],
      departments: { camera: crew, lighting: [] },
      contacts: [],
    };
    const departments = crewSheetDepartmentsFromCrewSheet(sheet);
    expect(departments).toHaveLength(1);
    expect(departments[0]).toMatchObject({ name: 'Camera' });
    expect(departments[0].members[0]).toMatchObject({ name: 'Op A', phone: '+1 999', email: 'a@example.com' });
    const cast = crewSheetCastFromContactList(
      [{ id: 'p2', displayName: 'Star', kind: 'cast', phone: '+1 222' }],
      [{ id: 'ch1', canonicalName: 'Zed', aliases: [] }],
      [{ id: 'a1', characterId: 'ch1', personId: 'p2', castNumber: 1 }],
    );
    expect(cast).toEqual([{ character: 'Zed', performer: 'Star', phone: '+1 222' }]);
  });

  it('builds crew-sheet and contact-sheet filenames and keeps unicode', async () => {
    expect(buildCrewSheetPdfFilename({ productionTitle: 'My Film', qualifier: 'day-04' })).toBe(
      'my-film_crew-sheet_day-04.pdf',
    );
    expect(buildContactSheetPdfFilename({ productionTitle: 'My Film' })).toBe('my-film_contact-sheet.pdf');
    const pdf = await createCrewSheetPdf({
      productionTitle: 'My Film',
      departments: [{ name: 'Camera', members: [{ name: 'Müller 12 €', role: 'Op' }] }],
      generatedAt: FIXED_DATE,
    });
    const combined = inflateContentStreams(pdf).join('\n');
    expect(combined).toContain(pdfHexToken('Müller 12 '));
    expect(combined).toContain('31322080');
  });

  it('prints logo-less on corrupt bytes instead of throwing', async () => {
    const pdf = await createCrewSheetPdf({
      productionTitle: 'My Film',
      departments: [makeDepartment('Camera', 1)],
      logoPngBytes: CORRUPT_BYTES,
      generatedAt: FIXED_DATE,
    });
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(1);
  });
});

describe('set report PDF', () => {
  it('renders the camera variant with %PDF-, metadata and roll sections', async () => {
    const pdf = await createSetReportPdf({
      variant: 'camera',
      productionTitle: 'My Film',
      scopeLabel: 'Day 04',
      crewLine: 'DOP Jane',
      report: { rolls: [makeCameraRoll('A001', 3)], totalRows: 3, totalGood: 1 },
      generatedAt: FIXED_DATE,
    });
    expect(bytesToBinary(pdf.slice(0, 5))).toBe('%PDF-');
    const reloaded = await PDFDocument.load(pdf);
    expect(reloaded.getPageCount()).toBe(1);
    expect(reloaded.getTitle()).toBe('Camera Report - My Film');
    expect(inflateContentStreams(pdf).join('\n')).toContain(pdfHexToken('CameraMarker-A001-2'));
  });

  it('paginates long camera and sound rolls', async () => {
    const camera = await createSetReportPdf({
      variant: 'camera',
      productionTitle: 'My Film',
      report: { rolls: [makeCameraRoll('A001', 60), makeCameraRoll('A002', 60)], totalRows: 120, totalGood: 4 },
      generatedAt: FIXED_DATE,
    });
    expect((await PDFDocument.load(camera)).getPageCount()).toBeGreaterThan(1);
    expect(inflateContentStreams(camera).join('\n')).toContain(pdfHexToken('CameraMarker-A002-59'));
    const sound = await createSetReportPdf({
      variant: 'sound',
      productionTitle: 'My Film',
      report: { rolls: [makeSoundRoll('S01', 80)], totalRows: 80, totalGood: 0 },
      generatedAt: FIXED_DATE,
    });
    expect((await PDFDocument.load(sound)).getPageCount()).toBeGreaterThan(1);
    const combined = inflateContentStreams(sound).join('\n');
    expect(combined).toContain(pdfHexToken('Wild track'));
    expect(combined).toContain(pdfHexToken('MOS - no sound'));
    expect((await PDFDocument.load(sound)).getTitle()).toBe('Sound Report - My Film');
  });

  it('renders the daily variant with summary, scenes and footer', async () => {
    const pdf = await createSetReportPdf({
      variant: 'daily',
      productionTitle: 'My Film',
      scopeLabel: 'Day 1',
      report: makeDailyReport(40),
      plannedDayMinutes: 720,
      director: 'Jane',
      generatedAt: FIXED_DATE,
    });
    const reloaded = await PDFDocument.load(pdf);
    expect(reloaded.getTitle()).toBe('Daily Progress Report - My Film');
    expect(reloaded.getPageCount()).toBeGreaterThan(1);
    const combined = inflateContentStreams(pdf).join('\n');
    expect(combined).toContain(pdfHexToken('30m behind'));
    expect(combined).toContain(pdfHexToken('Generated 2026-09-04'));
  });

  it('builds per-variant filenames and keeps unicode byte-identical', async () => {
    expect(buildSetReportPdfFilename({ productionTitle: 'My Film', variant: 'daily' })).toBe('my-film_set-report.pdf');
    expect(buildSetReportPdfFilename({ productionTitle: 'My Film', variant: 'camera', qualifier: 'day-04' })).toBe(
      'my-film_camera-report_day-04.pdf',
    );
    expect(buildSetReportPdfFilename({ productionTitle: 'My Film', variant: 'sound' })).toBe('my-film_sound-report.pdf');
    const pdf = await createSetReportPdf({
      variant: 'camera',
      productionTitle: 'My Film',
      report: {
        rolls: [{ roll: 'A001', unnamed: false, rows: [{ takeId: 't1', scene: '4', shot: '1A', take: 1, mos: false, description: 'Müller 12 €' }], goodCount: 0, ngCount: 0 }],
        totalRows: 1,
        totalGood: 0,
      },
      generatedAt: FIXED_DATE,
    });
    const combined = inflateContentStreams(pdf).join('\n');
    expect(combined).toContain(pdfHexToken('Müller 12 '));
    expect(combined).toContain('31322080');
  });
});
