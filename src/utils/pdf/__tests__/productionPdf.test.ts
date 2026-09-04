/**
 * Phase 3 production-management PDFs: real bytes, reloaded in pdf-lib,
 * content streams inflated the same way as `pdf.test.ts` (zlib-wrapped flate
 * via `unzlibSync`, assertions on the uppercase hex pdf-lib emits per
 * drawText).
 */
import { PDFDocument } from 'pdf-lib';
import { unzlibSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { deriveBudget } from '../../../domain/budget';
import type { DailyProgressReport } from '../../../domain/reports';
import type { ChecklistShot } from '../../../domain/continuity';
import type { Task, TaskBoard } from '../../../domain/tasks';
import type { ReadinessItem } from '../../../domain/readiness';
import {
  buildBudgetActualsPdfFilename,
  buildBudgetPdfFilename,
  buildContinuityPdfFilename,
  buildDailyProgressPdfFilename,
  buildReadinessPdfFilename,
  buildTaskReportPdfFilename,
  createBudgetActualsPdf,
  createBudgetPdf,
  createContinuityPdf,
  createDailyProgressPdf,
  createLocationReportPdf,
  createReadinessPdf,
  createTaskReportPdf,
  taskReportRowsFromTasks,
} from '../index';
import type { ContinuityPdfChecklistRow, ContinuityPdfTakeRow } from '../index';

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

const makeSummary = (lineCount: number) =>
  deriveBudget({
    budget: {
      settings: { currency: 'USD', defaultVatPercent: 17, weekDays: 5, contingencyPercent: 10 },
      lines: Array.from({ length: lineCount }, (_, index) => ({
        id: `line-${index}`,
        category: 'other' as const,
        label: index === lineCount - 1 ? 'BudgetMarker-119' : `Hand line ${index}`,
        amount: 850,
        basis: 'flat' as const,
      })),
      equipmentRates: [],
    },
    people: [],
    shootDays: 4,
  });

describe('budget PDF', () => {
  it('starts with %PDF- and reloads with one page and the metadata title', async () => {
    const pdf = await createBudgetPdf({ productionTitle: 'My Film', summary: makeSummary(2), generatedAt: FIXED_DATE });
    expect(bytesToBinary(pdf.slice(0, 5))).toBe('%PDF-');
    const reloaded = await PDFDocument.load(pdf);
    expect(reloaded.getPageCount()).toBe(1);
    expect(reloaded.getTitle()).toBe('Budget - My Film');
  });

  it('paginates a long line list across several pages', async () => {
    const pdf = await createBudgetPdf({ productionTitle: 'My Film', summary: makeSummary(120), generatedAt: FIXED_DATE });
    const reloaded = await PDFDocument.load(pdf);
    expect(reloaded.getPageCount()).toBeGreaterThan(1);
    expect(inflateContentStreams(pdf).join('\n')).toContain(pdfHexToken('BudgetMarker-119'));
  });

  it('prints the net total and the generated date in the footer', async () => {
    const pdf = await createBudgetPdf({ productionTitle: 'My Film', summary: makeSummary(1), generatedAt: FIXED_DATE });
    const combined = inflateContentStreams(pdf).join('\n');
    // One flat 850 USD line: net 850.00, kept clear of locale grouping.
    expect(combined).toContain(pdfHexToken('850.00'));
    expect(combined).toContain(pdfHexToken('Generated 2026-09-04'));
  });

  it('lists unpriced gear by label and keeps umlauts byte-identical', async () => {
    const summary = deriveBudget({
      budget: {
        settings: { currency: 'USD', defaultVatPercent: 17, weekDays: 5 },
        lines: [{ id: 'l1', category: 'location', label: 'Müller Warehouse', amount: 100, basis: 'flat' }],
        equipmentRates: [],
      },
      people: [],
      shootDays: 2,
      equipment: [{ key: 'gear-1', label: 'Unpriced Dolly', category: 'Grip', quantity: 1, days: 2 }],
    });
    const pdf = await createBudgetPdf({ productionTitle: 'My Film', summary, generatedAt: FIXED_DATE });
    const combined = inflateContentStreams(pdf).join('\n');
    expect(combined).toContain(pdfHexToken('Unpriced Dolly'));
    expect(combined).toContain(pdfHexToken('Müller'));
  });

  it('builds the canonical budget filename', () => {
    expect(buildBudgetPdfFilename({ productionTitle: 'My Film' })).toBe('my-film_budget.pdf');
    expect(buildBudgetPdfFilename({ productionTitle: 'My Film', date: '2026-09-04' })).toBe(
      'my-film_budget_2026-09-04.pdf',
    );
  });
});

describe('budget actuals PDF', () => {
  const input = {
    productionTitle: 'My Film',
    currency: 'USD',
    estimatedNet: 850,
    estimates: [{ id: 'line:l1', category: 'location' as const, label: 'Warehouse hire', plannedNet: 850 }],
    actuals: [{ id: 'a1', category: 'location' as const, label: 'Warehouse deposit', amount: 900, entryId: 'line:l1' }],
    categoryTotals: [{ category: 'location' as const, label: 'Locations', net: 850 }],
    generatedAt: FIXED_DATE,
  };

  it('starts with %PDF- and reloads with one page and the metadata title', async () => {
    const pdf = await createBudgetActualsPdf(input);
    expect(bytesToBinary(pdf.slice(0, 5))).toBe('%PDF-');
    const reloaded = await PDFDocument.load(pdf);
    expect(reloaded.getPageCount()).toBe(1);
    expect(reloaded.getTitle()).toBe('Budget Actuals - My Film');
  });

  it('paginates a long variance list across several pages', async () => {
    const estimates = Array.from({ length: 120 }, (_, index) => ({
      id: `line:l${index}`,
      category: 'other' as const,
      label: index === 119 ? 'ActualsMarker-119' : `Estimate ${index}`,
      plannedNet: 10,
    }));
    const pdf = await createBudgetActualsPdf({
      ...input,
      estimates,
      actuals: [{ id: 'a1', category: 'other' as const, label: 'Receipt', amount: 5, entryId: 'line:l0' }],
      estimatedNet: 1200,
    });
    const reloaded = await PDFDocument.load(pdf);
    expect(reloaded.getPageCount()).toBeGreaterThan(1);
    expect(inflateContentStreams(pdf).join('\n')).toContain(pdfHexToken('ActualsMarker-119'));
  });

  it('prints the spent total and the over-estimate variance as tokens', async () => {
    const pdf = await createBudgetActualsPdf(input);
    const combined = inflateContentStreams(pdf).join('\n');
    expect(combined).toContain(pdfHexToken('900.00'));
    expect(combined).toContain(pdfHexToken('Variance: +$50.00'));
  });

  it('speaks no variance on an empty ledger and keeps unpriced estimates honest', async () => {
    const pdf = await createBudgetActualsPdf({
      productionTitle: 'My Film',
      currency: 'USD',
      estimates: [{ id: 'person:p1', category: 'crew' as const, label: 'Müller (no rate yet)' }],
      actuals: [],
      generatedAt: FIXED_DATE,
    });
    const combined = inflateContentStreams(pdf).join('\n');
    expect(combined).toContain(pdfHexToken('No actuals logged yet'));
    expect(combined).toContain(pdfHexToken('Not priced'));
    expect(combined).not.toContain(pdfHexToken('Variance:'));
  });

  it('builds the canonical actuals filename', () => {
    expect(buildBudgetActualsPdfFilename({ productionTitle: 'My Film' })).toBe('my-film_budget-actuals.pdf');
  });
});

const taskBoards: TaskBoard[] = [
  {
    id: 'b1',
    title: 'Production',
    columns: [
      { id: 'c1', title: 'To Do', order: 0 },
      { id: 'c2', title: 'Done', order: 1, isDone: true },
    ],
  },
];

const makeTask = (index: number): Task => ({
  id: `t${index}`,
  boardId: 'b1',
  columnId: 'c1',
  title: `TaskMarker-${index}`,
  assigneeIds: ['p1'],
  labels: ['prep'],
  checklist: [],
  order: index,
  createdAt: '2026-01-01',
  ...(index === 0 ? { dueDate: '2020-01-01', priority: 'urgent' as const } : {}),
});

describe('task report PDF', () => {
  it('starts with %PDF- and reloads with one page and the metadata title', async () => {
    const tasks = taskReportRowsFromTasks([makeTask(0)], taskBoards, new Map([['p1', 'Jane Doe']]));
    const pdf = await createTaskReportPdf({ productionTitle: 'My Film', tasks, generatedAt: FIXED_DATE });
    expect(bytesToBinary(pdf.slice(0, 5))).toBe('%PDF-');
    const reloaded = await PDFDocument.load(pdf);
    expect(reloaded.getPageCount()).toBe(1);
    expect(reloaded.getTitle()).toBe('Task Report - My Film');
  });

  it('paginates a long task list across several pages', async () => {
    const domainTasks = Array.from({ length: 120 }, (_, index) => makeTask(index));
    const tasks = taskReportRowsFromTasks(domainTasks, taskBoards, new Map([['p1', 'Jane Doe']]));
    const pdf = await createTaskReportPdf({ productionTitle: 'My Film', tasks, generatedAt: FIXED_DATE });
    const reloaded = await PDFDocument.load(pdf);
    expect(reloaded.getPageCount()).toBeGreaterThan(1);
    expect(inflateContentStreams(pdf).join('\n')).toContain(pdfHexToken('TaskMarker-119'));
  });

  it('flags overdue tasks and resolves assignee names', async () => {
    const tasks = taskReportRowsFromTasks([makeTask(0)], taskBoards, new Map([['p1', 'Jane Doe']]));
    expect(tasks[0].overdue).toBe(true);
    const pdf = await createTaskReportPdf({ productionTitle: 'My Film', tasks, generatedAt: FIXED_DATE });
    const combined = inflateContentStreams(pdf).join('\n');
    expect(combined).toContain(pdfHexToken('Overdue'));
    expect(combined).toContain(pdfHexToken('Jane Doe'));
  });

  it('maps unencodable scripts to question marks and keeps umlauts', async () => {
    const tasks = taskReportRowsFromTasks(
      [{ ...makeTask(0), title: 'Müller pickup 夜' }],
      taskBoards,
      new Map([['p1', 'Jane Doe']]),
    );
    const pdf = await createTaskReportPdf({ productionTitle: 'My Film', tasks, generatedAt: FIXED_DATE });
    const combined = inflateContentStreams(pdf).join('\n');
    expect(combined).toContain(pdfHexToken('Müller'));
    expect(combined).toContain(pdfHexToken('pickup ?'));
  });

  it('builds the canonical task-report filename', () => {
    expect(buildTaskReportPdfFilename({ productionTitle: 'My Film' })).toBe('my-film_task-report.pdf');
    expect(buildTaskReportPdfFilename({ productionTitle: 'My Film', qualifier: 'week-12' })).toBe(
      'my-film_task-report_week-12.pdf',
    );
  });
});

describe('location report PDF', () => {
  it('renders a searchable production location table', async () => {
    const pdf = await createLocationReportPdf({
      productionTitle: 'My Film',
      locations: [{
        name: 'Warehouse Stage',
        type: 'Studio',
        address: '12 Dock Road',
        timeZone: 'Europe/Berlin',
        contacts: 'Jane Doe',
        scenes: '3',
        mapPin: '52.52000, 13.40500',
        notes: 'Use north entrance',
      }],
    });
    expect(bytesToBinary(pdf.slice(0, 5))).toBe('%PDF-');
    const reloaded = await PDFDocument.load(pdf);
    expect(reloaded.getTitle()).toBe('Location Report - My Film');
    expect(inflateContentStreams(pdf).join('\n')).toContain(pdfHexToken('Warehouse Stage'));
  });
});

const makeFinding = (index: number): ReadinessItem => ({
  id: `r${index}`,
  severity: index % 3 === 0 ? 'blocker' : 'warning',
  label: `FindingMarker-${index}`,
  detail: 'Missing date and crew call',
  tab: 'schedule',
});

describe('readiness PDF', () => {
  it('starts with %PDF- and reloads with one page and the metadata title', async () => {
    const pdf = await createReadinessPdf({ productionTitle: 'My Film', items: [makeFinding(0)], generatedAt: FIXED_DATE });
    expect(bytesToBinary(pdf.slice(0, 5))).toBe('%PDF-');
    const reloaded = await PDFDocument.load(pdf);
    expect(reloaded.getPageCount()).toBe(1);
    expect(reloaded.getTitle()).toBe('Readiness Report - My Film');
  });

  it('paginates a long finding list across several pages', async () => {
    const items = Array.from({ length: 120 }, (_, index) => makeFinding(index));
    const pdf = await createReadinessPdf({ productionTitle: 'My Film', items, generatedAt: FIXED_DATE });
    const reloaded = await PDFDocument.load(pdf);
    expect(reloaded.getPageCount()).toBeGreaterThan(1);
    expect(inflateContentStreams(pdf).join('\n')).toContain(pdfHexToken('FindingMarker-119'));
  });

  it('prints finding titles with their fix-target labels', async () => {
    const pdf = await createReadinessPdf({ productionTitle: 'My Film', items: [makeFinding(0)], generatedAt: FIXED_DATE });
    const combined = inflateContentStreams(pdf).join('\n');
    expect(combined).toContain(pdfHexToken('FindingMarker-0'));
    expect(combined).toContain(pdfHexToken('Fix: Schedule'));
  });

  it('reports an empty list honestly and keeps umlauts byte-identical', async () => {
    const pdf = await createReadinessPdf({
      productionTitle: 'My Film',
      items: [{ id: 'r1', severity: 'warning', label: 'Müller location has no address', detail: 'Add it', tab: 'locations' }],
      generatedAt: FIXED_DATE,
    });
    const combined = inflateContentStreams(pdf).join('\n');
    expect(combined).toContain(pdfHexToken('Müller'));
    expect(combined).toContain(pdfHexToken('Fix: Locations'));
    const empty = await createReadinessPdf({ productionTitle: 'My Film', items: [], generatedAt: FIXED_DATE });
    expect(inflateContentStreams(empty).join('\n')).toContain(pdfHexToken('No open findings'));
  });

  it('builds the canonical readiness filename', () => {
    expect(buildReadinessPdfFilename({ productionTitle: 'My Film' })).toBe('my-film_readiness-report.pdf');
  });
});

const makeTakeRow = (index: number): ContinuityPdfTakeRow => ({
  scene: '4',
  shot: '1A',
  take: String(index + 1),
  goodTake: index === 0 ? '1' : '',
  fileName: index === 119 ? 'ContinuityMarker-119' : `A001C${String(index).padStart(3, '0')}`,
  rollCard: 'A001',
  description: 'Wide on the diner',
  comments: '',
  keywords: '',
  cameraSummary: 'A Cam',
});

const makeChecklistRow = (shot: string): ContinuityPdfChecklistRow => ({
  shot,
  scene: '4',
  name: 'Night Diner',
  takeCount: 1,
  covered: true,
  unplanned: false,
});

describe('continuity PDF', () => {
  const totals = { takes: 2, goodTakes: 1, plannedShots: 2, coveredShots: 1, withoutFileName: 0 };

  it('starts with %PDF- and reloads with one page and the metadata title', async () => {
    const pdf = await createContinuityPdf({
      productionTitle: 'My Film',
      scopeLabel: 'Day 03',
      takeRows: [makeTakeRow(0)],
      checklist: [makeChecklistRow('1A')],
      unscheduled: [],
      notes: [],
      gaps: { notShot: [makeChecklistRow('1B')], noGoodTake: [] },
      totals,
      generatedAt: FIXED_DATE,
    });
    expect(bytesToBinary(pdf.slice(0, 5))).toBe('%PDF-');
    const reloaded = await PDFDocument.load(pdf);
    expect(reloaded.getPageCount()).toBe(1);
    expect(reloaded.getTitle()).toBe('Continuity Report - My Film');
  });

  it('paginates a long take log across several pages', async () => {
    const takeRows = Array.from({ length: 120 }, (_, index) => makeTakeRow(index));
    const pdf = await createContinuityPdf({
      productionTitle: 'My Film',
      takeRows,
      checklist: [],
      unscheduled: [],
      notes: [],
      gaps: { notShot: [], noGoodTake: [] },
      totals: { takes: 120, goodTakes: 1, plannedShots: 0, coveredShots: 0, withoutFileName: 0 },
      generatedAt: FIXED_DATE,
    });
    const reloaded = await PDFDocument.load(pdf);
    expect(reloaded.getPageCount()).toBeGreaterThan(1);
    expect(inflateContentStreams(pdf).join('\n')).toContain(pdfHexToken('ContinuityMarker-119'));
  });

  it('prints good-take words and gap lists as tokens', async () => {
    const pdf = await createContinuityPdf({
      productionTitle: 'My Film',
      takeRows: [makeTakeRow(0)],
      checklist: [makeChecklistRow('1A')],
      unscheduled: [],
      notes: [],
      gaps: { notShot: [makeChecklistRow('1B')], noGoodTake: [] },
      totals,
      generatedAt: FIXED_DATE,
    });
    const combined = inflateContentStreams(pdf).join('\n');
    expect(combined).toContain(pdfHexToken('Good'));
    expect(combined).toContain(pdfHexToken('Not shot (1)'));
  });

  it('renders unknown file names as dashes and keeps umlauts', async () => {
    const pdf = await createContinuityPdf({
      productionTitle: 'My Film',
      takeRows: [{ ...makeTakeRow(0), fileName: '', description: 'Müller close-up' }],
      checklist: [],
      unscheduled: [],
      notes: [],
      gaps: { notShot: [], noGoodTake: [] },
      totals: { takes: 1, goodTakes: 1, plannedShots: 0, coveredShots: 0, withoutFileName: 1 },
      generatedAt: FIXED_DATE,
    });
    const combined = inflateContentStreams(pdf).join('\n');
    expect(combined).toContain(pdfHexToken('Müller'));
    expect(combined).toContain(pdfHexToken('without a file name'));
  });

  it('renders the take-details appendix with filled values', async () => {
    const pdf = await createContinuityPdf({
      productionTitle: 'My Film',
      takeRows: [
        {
          ...makeTakeRow(0),
          detail: {
            soundRoll: 'DetailSoundRoll-1',
            soundFileName: 'DetailSoundFile-1.wav',
            soundNotes: 'Boom only',
            wildTrack: true,
            slateDate: 'DetailSlateDate-1',
            slateLocation: 'DetailSlateLoc-1',
            slateEnvironment: 'INT',
            slateDayNight: 'Night',
            cameraLabel: 'DetailCamLabel-1',
            shutterSpeed: '1/48',
            whitePointKelvin: '5600',
            filter: 'DetailFilter-1',
            cameraNotes: 'DetailCamNotes-1',
          },
        },
      ],
      checklist: [],
      unscheduled: [],
      gaps: { notShot: [], noGoodTake: [] },
      totals: { takes: 1, goodTakes: 1, plannedShots: 0, coveredShots: 0, withoutFileName: 0 },
      notes: [],
      generatedAt: FIXED_DATE,
    });
    const combined = inflateContentStreams(pdf).join('\n');
    expect(combined).toContain(pdfHexToken('Take details'));
    expect(combined).toContain(pdfHexToken('DetailSoundRoll-1'));
    expect(combined).toContain(pdfHexToken('DetailSoundFile-1.wav'));
    expect(combined).toContain(pdfHexToken('Wild track'));
    expect(combined).toContain(pdfHexToken('DetailSlateLoc-1'));
    expect(combined).toContain(pdfHexToken('DetailCamLabel-1'));
    expect(combined).toContain(pdfHexToken('DetailFilter-1'));
    expect(combined).toContain(pdfHexToken('DetailCamNotes-1'));
  });

  it('skips takes without detail in the appendix', async () => {
    const pdf = await createContinuityPdf({
      productionTitle: 'My Film',
      takeRows: [{ ...makeTakeRow(0), detail: { soundRoll: 'DetailSoundRoll-1' } }, makeTakeRow(1)],
      checklist: [],
      unscheduled: [],
      gaps: { notShot: [], noGoodTake: [] },
      totals: { takes: 2, goodTakes: 1, plannedShots: 0, coveredShots: 0, withoutFileName: 0 },
      notes: [],
      generatedAt: FIXED_DATE,
    });
    const combined = inflateContentStreams(pdf).join('\n');
    expect(combined).toContain(pdfHexToken('Take details'));
    expect(combined).toContain(pdfHexToken('DetailSoundRoll-1'));
    expect(combined).toContain(pdfHexToken('Tk 1'));
    expect(combined).not.toContain(pdfHexToken('Tk 2'));
    const emptyDetail = await createContinuityPdf({
      productionTitle: 'My Film',
      takeRows: [makeTakeRow(0)],
      checklist: [],
      unscheduled: [],
      gaps: { notShot: [], noGoodTake: [] },
      totals: { takes: 1, goodTakes: 1, plannedShots: 0, coveredShots: 0, withoutFileName: 0 },
      notes: [],
      generatedAt: FIXED_DATE,
    });
    expect(inflateContentStreams(emptyDetail).join('\n')).not.toContain(pdfHexToken('Take details'));
  });

  it('renders continuity notes grouped with photo counts', async () => {
    const pdf = await createContinuityPdf({
      productionTitle: 'My Film',
      takeRows: [makeTakeRow(0)],
      checklist: [],
      unscheduled: [],
      gaps: { notShot: [], noGoodTake: [] },
      totals: { takes: 1, goodTakes: 1, plannedShots: 0, coveredShots: 0, withoutFileName: 0 },
      notes: [
        {
          department: 'Wardrobe',
          subject: 'Ada Coat',
          sceneNumber: '4',
          scriptDay: '1',
          description: 'CoatNote-desc',
          notes: 'CoatNote-extra',
          photoCount: 2,
        },
        { department: 'Props', subject: 'Lens map', description: 'LensNote-desc', photoCount: 0 },
      ],
      generatedAt: FIXED_DATE,
    });
    const combined = inflateContentStreams(pdf).join('\n');
    expect(combined).toContain(pdfHexToken('Continuity notes'));
    expect(combined).toContain(pdfHexToken('Wardrobe'));
    expect(combined).toContain(pdfHexToken('Ada Coat'));
    expect(combined).toContain(pdfHexToken('Sc 4'));
    expect(combined).toContain(pdfHexToken('Day 1'));
    expect(combined).toContain(pdfHexToken('CoatNote-desc'));
    expect(combined).toContain(pdfHexToken('CoatNote-extra'));
    expect(combined).toContain(pdfHexToken('2 photo(s)'));
    expect(combined).toContain(pdfHexToken('Props'));
    expect(combined).toContain(pdfHexToken('LensNote-desc'));
    expect(combined.indexOf(pdfHexToken('Wardrobe'))).toBeLessThan(combined.indexOf(pdfHexToken('Props')));
  });

  it('renders no notes section for an empty notes array', async () => {
    const pdf = await createContinuityPdf({
      productionTitle: 'My Film',
      takeRows: [makeTakeRow(0)],
      checklist: [],
      unscheduled: [],
      gaps: { notShot: [], noGoodTake: [] },
      totals: { takes: 1, goodTakes: 1, plannedShots: 0, coveredShots: 0, withoutFileName: 0 },
      notes: [],
      generatedAt: FIXED_DATE,
    });
    expect(inflateContentStreams(pdf).join('\n')).not.toContain(pdfHexToken('Continuity notes'));
  });

  it('builds the canonical continuity filename', () => {
    expect(buildContinuityPdfFilename({ productionTitle: 'My Film', qualifier: 'day-03' })).toBe(
      'my-film_continuity-report_day-03.pdf',
    );
  });
});

const makeShotRef = (shotNumber: string, overrides: Partial<ChecklistShot> = {}): ChecklistShot => ({
  shotId: `shot-${shotNumber}`,
  setupId: 'setup-1',
  sceneNumber: '4',
  shotNumber,
  name: `Shot ${shotNumber}`,
  unplanned: false,
  takeCount: 1,
  covered: true,
  attemptedNotCovered: false,
  ...overrides,
});

const makeReport = (sceneCount: number): DailyProgressReport => ({
  productionDayId: 'd1',
  dayName: 'Day 03',
  date: '2026-09-04',
  crewCall: '06:30',
  plannedWrap: '19:00',
  scenes: Array.from({ length: sceneCount }, (_, index) => ({
    sceneNumber: index === sceneCount - 1 ? 'ProgressMarker-739' : `${4 + index}`,
    pageEighths: 8,
    plannedShots: 2,
    coveredShots: 1,
    complete: false,
  })),
  scenesScheduled: sceneCount,
  scenesCompleted: 0,
  pagesScheduledEighths: sceneCount * 8,
  pagesCoveredEighths: 0,
  setupsScheduled: 1,
  setupsCompleted: 0,
  shotsScheduled: sceneCount * 2,
  shotsCovered: sceneCount,
  shotsAttempted: 1,
  shotsNotShot: [makeShotRef('1B', { takeCount: 0, covered: false })],
  shotsUnscheduled: [],
  takesLogged: 3,
  takesGood: 1,
  takesNg: 1,
  firstTakeAt: '08:00',
  lastTakeAt: '10:30',
  shootingSpanMinutes: 150,
  scheduleVarianceMinutes: 30,
  scheduleVarianceLabel: '0h 30m behind',
  gearMovement: [{ id: 'g1', name: 'Camera Truck', kind: 'Truck' }],
});

describe('daily progress PDF', () => {
  it('starts with %PDF- and reloads with one page and the metadata title', async () => {
    const pdf = await createDailyProgressPdf({
      productionTitle: 'My Film',
      report: makeReport(1),
      plannedDayMinutes: 750,
      generatedAt: FIXED_DATE,
    });
    expect(bytesToBinary(pdf.slice(0, 5))).toBe('%PDF-');
    const reloaded = await PDFDocument.load(pdf);
    expect(reloaded.getPageCount()).toBe(1);
    expect(reloaded.getTitle()).toBe('Daily Progress - My Film - Day 03');
  });

  it('paginates a long scene list across several pages', async () => {
    const pdf = await createDailyProgressPdf({
      productionTitle: 'My Film',
      report: makeReport(120),
      plannedDayMinutes: 750,
      generatedAt: FIXED_DATE,
    });
    const reloaded = await PDFDocument.load(pdf);
    expect(reloaded.getPageCount()).toBeGreaterThan(1);
    expect(inflateContentStreams(pdf).join('\n')).toContain(pdfHexToken('ProgressMarker-739'));
  });

  it('prints the schedule verdict and the unmarked gear as tokens', async () => {
    const pdf = await createDailyProgressPdf({
      productionTitle: 'My Film',
      report: makeReport(1),
      plannedDayMinutes: 750,
      generatedAt: FIXED_DATE,
    });
    const combined = inflateContentStreams(pdf).join('\n');
    expect(combined).toContain(pdfHexToken('0h 30m behind'));
    expect(combined).toContain(pdfHexToken('Not marked'));
  });

  it('reports unknown pages honestly and keeps umlauts byte-identical', async () => {
    const report = { ...makeReport(1), pagesScheduledEighths: null, pagesCoveredEighths: null };
    const pdf = await createDailyProgressPdf({
      productionTitle: 'Müller Film',
      director: 'Müller',
      report,
      plannedDayMinutes: null,
      generatedAt: FIXED_DATE,
    });
    const combined = inflateContentStreams(pdf).join('\n');
    expect(combined).toContain(pdfHexToken('not all scenes have a page length'));
    expect(combined).toContain(pdfHexToken('Müller'));
  });

  it('builds the canonical daily-progress filename', () => {
    expect(buildDailyProgressPdfFilename({ productionTitle: 'My Film', qualifier: 'day-03' })).toBe(
      'my-film_daily-progress_day-03.pdf',
    );
  });
});
