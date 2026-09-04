/**
 * Task report PDF.
 *
 * Printable data model (mirrors the task boards and their tasks, read-only):
 * one row per task with its board, column (status), priority, due date,
 * assignees and labels. The mapper resolves display facts the way the panel
 * does — an absent priority reads as "normal", a task counts as done when
 * its column is a done column or it carries `completedAt`.
 *
 * Unknown-value handling: a missing due date or assignee list prints as a
 * dash, never as a guessed date or name; an overdue flag is only computed
 * against the supplied day, defaulting to today.
 */

import {
  addPdfPage,
  createPdfDocument,
  drawDocumentHeader,
  embedProductionLogoPng,
  finalizePdfDocument,
} from './document';
import type { PdfDocumentContext, PdfOrientation, PdfPageSize } from './document';
import { buildPdfFilename } from './filenames';
import { drawPdfTable, wrapPdfCellText } from './tables';
import type { PdfTableColumn } from './tables';
import { sanitizePdfText } from './text';
import type { Task, TaskBoard } from '../../domain/tasks';
import type { PDFPage } from 'pdf-lib';

/** One task as the report prints it: display facts resolved, nothing invented. */
export interface TaskReportPdfTask {
  board: string;
  column: string;
  title: string;
  description?: string;
  /** Resolved priority; the panel defaults an absent one to "normal". */
  priority: string;
  /** ISO yyyy-mm-dd; absent means no deadline. */
  dueDate?: string;
  /** Display names, resolved from assignee ids by the mapper. */
  assignees: string[];
  labels: string[];
  completed: boolean;
  overdue: boolean;
}

export interface TaskReportPdfInput {
  productionTitle: string;
  subtitle?: string;
  tasks: TaskReportPdfTask[];
  pageSize?: PdfPageSize;
  orientation?: PdfOrientation;
  generatedAt?: Date;
  draft?: boolean | string;
  confidentialityLine?: string;
  /** Raw PNG bytes for the production logo; corrupt bytes print logo-less. */
  logoPngBytes?: Uint8Array;
}

export interface TaskReportPdfFilenameInput {
  productionTitle: string;
  qualifier?: string;
  date?: string;
}

/** `my-film_task-report.pdf`, with optional scope and date segments. */
export const buildTaskReportPdfFilename = (input: TaskReportPdfFilenameInput): string =>
  buildPdfFilename({
    production: input.productionTitle,
    document: 'task-report',
    ...(input.qualifier === undefined ? {} : { qualifier: input.qualifier }),
    ...(input.date === undefined ? {} : { date: input.date }),
  });

/**
 * Map domain tasks to report rows in board order, resolving column titles,
 * assignee names and the done/overdue flags the way the panels do.
 *
 * `assigneeNames` maps person ids to display names; ids without a name print
 * as a dash rather than as a raw id nobody on the unit recognises.
 */
export const taskReportRowsFromTasks = (
  tasks: readonly Task[],
  boards: readonly TaskBoard[],
  assigneeNames?: ReadonlyMap<string, string>,
  today: string = new Date().toISOString().slice(0, 10),
): TaskReportPdfTask[] => {
  const boardById = new Map(boards.map((board) => [board.id, board] as const));
  const nameOf = (id: string): string | undefined => assigneeNames?.get(id);
  return tasks.map((task) => {
    const board = boardById.get(task.boardId);
    const column = board?.columns.find((candidate) => candidate.id === task.columnId);
    const completed = column?.isDone === true || task.completedAt !== undefined;
    const dueDate = task.dueDate && task.dueDate.trim() !== '' ? task.dueDate : undefined;
    return {
      board: board?.title ?? '—',
      column: column?.title ?? '—',
      title: task.title,
      ...(task.description && task.description.trim() !== '' ? { description: task.description } : {}),
      priority: task.priority ?? 'normal',
      ...(dueDate !== undefined ? { dueDate } : {}),
      assignees: task.assigneeIds.map((id) => nameOf(id)).filter((name): name is string => !!name),
      labels: [...task.labels],
      completed,
      overdue: !completed && dueDate !== undefined && dueDate < today,
    };
  });
};

const DASH = '—';

const TASK_COLUMNS: PdfTableColumn[] = [
  { header: 'Status', widthFrac: 12, align: 'center' },
  { header: 'Task', widthFrac: 34 },
  { header: 'Priority', widthFrac: 11, align: 'center' },
  { header: 'Due', widthFrac: 11, align: 'center' },
  { header: 'Assignees', widthFrac: 16 },
  { header: 'Labels', widthFrac: 16 },
];

const SECTION_TITLE_SIZE = 11;
const BODY_SIZE = 9;
const BODY_LINE_HEIGHT = BODY_SIZE * 1.35;
const SECTION_GAP = 10;
const BLOCK_GAP = 6;

interface PageCursor {
  page: PDFPage;
  cursorY: number;
}

/** New page when fewer than `needed` points remain above the footer zone. */
const ensureSpace = (ctx: PdfDocumentContext, cursor: PageCursor, needed: number): PageCursor => {
  if (cursor.cursorY - needed < ctx.margins.bottom) {
    const page = addPdfPage(ctx);
    return { page, cursorY: ctx.contentTop };
  }
  return cursor;
};

const drawSectionTitle = (ctx: PdfDocumentContext, cursor: PageCursor, title: string): PageCursor => {
  const placed = ensureSpace(ctx, cursor, 34);
  placed.page.drawText(sanitizePdfText(title), {
    x: ctx.margins.left,
    y: placed.cursorY - SECTION_TITLE_SIZE,
    size: SECTION_TITLE_SIZE,
    font: ctx.bold,
  });
  return { page: placed.page, cursorY: placed.cursorY - SECTION_TITLE_SIZE - BLOCK_GAP };
};

/** Single "Label: value" line; kept in one drawText call so values stay searchable. */
const drawKeyValue = (ctx: PdfDocumentContext, cursor: PageCursor, label: string, value: string): PageCursor => {
  const placed = ensureSpace(ctx, cursor, BODY_LINE_HEIGHT + 2);
  placed.page.drawText(sanitizePdfText(`${label}: ${value}`), {
    x: ctx.margins.left,
    y: placed.cursorY - BODY_SIZE,
    size: BODY_SIZE,
    font: ctx.regular,
  });
  return { page: placed.page, cursorY: placed.cursorY - BODY_LINE_HEIGHT };
};

const drawBodyLines = (ctx: PdfDocumentContext, cursor: PageCursor, text: string): PageCursor => {
  const lines = wrapPdfCellText(ctx.regular, text, ctx.contentWidth, BODY_SIZE);
  const needed = lines.length * BODY_LINE_HEIGHT + BLOCK_GAP;
  const placed = ensureSpace(ctx, cursor, needed);
  lines.forEach((line, index) => {
    placed.page.drawText(line, {
      x: ctx.margins.left,
      y: placed.cursorY - BODY_LINE_HEIGHT * (index + 1) + 3,
      size: BODY_SIZE,
      font: ctx.regular,
    });
  });
  return { page: placed.page, cursorY: placed.cursorY - lines.length * BODY_LINE_HEIGHT - 2 };
};

const statusOf = (task: TaskReportPdfTask): string => {
  if (task.completed) return 'Done';
  if (task.overdue) return 'Overdue';
  return 'Open';
};

/** Render the task report and return the finished PDF bytes. */
export const createTaskReportPdf = async (input: TaskReportPdfInput): Promise<Uint8Array> => {
  const open = input.tasks.filter((task) => !task.completed);
  const overdue = input.tasks.filter((task) => task.overdue);

  const ctx = await createPdfDocument({
    title: `Task Report - ${input.productionTitle}`,
    subject: 'Task report',
    pageSize: input.pageSize ?? 'A4',
    orientation: input.orientation ?? 'landscape',
    productionTitle: input.productionTitle,
    generatedAt: input.generatedAt,
    draft: input.draft,
    confidentialityLine: input.confidentialityLine,
  });
  const logo = await embedProductionLogoPng(ctx.doc, input.logoPngBytes);
  const page = addPdfPage(ctx);
  const headerY = drawDocumentHeader(ctx, page, ctx.contentTop, {
    productionTitle: input.productionTitle,
    documentTitle: 'Task Report',
    subtitle: input.subtitle ?? `${input.tasks.length} task${input.tasks.length === 1 ? '' : 's'}`,
    logo,
  });
  let cursor: PageCursor = { page, cursorY: headerY };

  cursor = drawSectionTitle(ctx, cursor, 'Summary');
  cursor = drawKeyValue(ctx, cursor, 'Total tasks', String(input.tasks.length));
  cursor = drawKeyValue(ctx, cursor, 'Open', String(open.length));
  cursor = drawKeyValue(ctx, cursor, 'Completed', String(input.tasks.length - open.length));
  cursor = drawKeyValue(ctx, cursor, 'Overdue', String(overdue.length));
  cursor = { page: cursor.page, cursorY: cursor.cursorY - SECTION_GAP + BLOCK_GAP };

  if (input.tasks.length === 0) {
    drawBodyLines(ctx, cursor, 'No tasks on any board yet.');
  } else {
    // Group consecutive rows of one board under a shared heading, in input order.
    const groups: Array<{ board: string; tasks: TaskReportPdfTask[] }> = [];
    for (const task of input.tasks) {
      const current = groups[groups.length - 1];
      if (current && current.board === task.board) current.tasks.push(task);
      else groups.push({ board: task.board, tasks: [task] });
    }
    for (const group of groups) {
      cursor = drawSectionTitle(ctx, cursor, group.board);
      const rows = group.tasks.map((task) => [
        statusOf(task),
        task.description ? `${task.title}\n${task.description}` : task.title,
        task.priority,
        task.dueDate ?? DASH,
        task.assignees.length > 0 ? task.assignees.join(', ') : DASH,
        task.labels.length > 0 ? task.labels.join(', ') : DASH,
      ]);
      const result = drawPdfTable(ctx, cursor.page, cursor.cursorY, TASK_COLUMNS, rows);
      cursor = { page: result.page, cursorY: result.cursorY - SECTION_GAP + BLOCK_GAP };
    }
  }

  return finalizePdfDocument(ctx);
};
