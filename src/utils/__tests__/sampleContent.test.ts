import { describe, expect, it } from 'vitest';
import { SAMPLE_SCENES } from '../../constants/presets';
import { parseSampleScreenplay, sampleMarksFor, samplePlanningMeta, sampleScheduleMeta } from '../sampleContent';

describe('starter template screenplay', () => {
  it('ships a short screenplay with valid lining for both templates', () => {
    const lines = parseSampleScreenplay();
    expect(lines.length).toBeGreaterThan(8);

    const dialogueMarks = sampleMarksFor('setup-dialogue-classic', lines, '1');
    const interrogationMarks = sampleMarksFor('setup-noir-interrogation', lines, '2');
    expect(dialogueMarks).toHaveLength(3);
    expect(interrogationMarks).toHaveLength(2);

    for (const mark of [...dialogueMarks, ...interrogationMarks]) {
      expect(lines.some((line) => line.id === mark.startLineId)).toBe(true);
      expect(lines.some((line) => line.id === mark.endLineId)).toBe(true);
    }
  });
});

describe('sample schedule meta (template example data)', () => {
  const meta = sampleScheduleMeta();

  it('covers every schedule tab: days, blocks, calendar events and coverage', () => {
    expect(meta.productionDays.length).toBeGreaterThanOrEqual(2);
    expect(meta.scheduleBlocks.length).toBeGreaterThan(meta.productionDays.length);
    expect(meta.productionCalendarEvents.length).toBeGreaterThanOrEqual(3);
    expect(meta.coverageMatrix.cameraIds.length).toBeGreaterThanOrEqual(2);
    expect(meta.coverageMatrix.rowKeys.length).toBeGreaterThanOrEqual(2);
    expect(meta.people.some((p) => p.kind === 'crew')).toBe(true);
    expect(meta.people.some((p) => p.kind === 'cast')).toBe(true);
  });

  it('references only entities that exist in the bundled template scenes', () => {
    const templateIds = new Set(SAMPLE_SCENES.map((s) => s.id));
    const shotIds = new Set(SAMPLE_SCENES.flatMap((s) => s.shots.map((shot) => shot.id)));

    for (const block of meta.scheduleBlocks) {
      if (block.kind === 'setup') expect(templateIds.has(block.setupId)).toBe(true);
      if (block.kind === 'shots') {
        for (const id of block.shotIds) expect(shotIds.has(id)).toBe(true);
      }
    }
  });

  it('keeps day/block references intact and dates ISO-formatted', () => {
    const blockIds = new Set(meta.scheduleBlocks.map((b) => b.id));
    const iso = /^\d{4}-\d{2}-\d{2}$/;

    for (const day of meta.productionDays) {
      expect(day.scheduleBlockIds.length).toBeGreaterThan(0);
      for (const id of day.scheduleBlockIds) expect(blockIds.has(id)).toBe(true);
      if (day.date) expect(iso.test(day.date)).toBe(true);
    }
    for (const event of meta.productionCalendarEvents) {
      expect(iso.test(event.startDate)).toBe(true);
      expect(iso.test(event.endDate)).toBe(true);
      expect(event.endDate >= event.startDate).toBe(true);
    }
  });

  it('aligns coverage cells with the registered camera columns', () => {
    const { cameraIds, rowKeys, cells } = meta.coverageMatrix;
    for (const key of rowKeys) {
      for (const cameraId of Object.keys(cells[key] ?? {})) {
        expect(cameraIds.includes(cameraId)).toBe(true);
      }
    }
  });
});

describe('sample planning meta (template example data)', () => {
  const meta = sampleScheduleMeta();
  const planning = samplePlanningMeta(meta.people);

  it('covers locations, run of show, task board, mood board and logistics', () => {
    expect(planning.locations.length).toBeGreaterThanOrEqual(2);
    expect(planning.runOfShowCues.length).toBeGreaterThanOrEqual(4);
    expect(planning.taskBoards.length).toBeGreaterThanOrEqual(1);
    expect(planning.tasks.length).toBeGreaterThanOrEqual(5);
    expect(planning.moodBoards.length).toBeGreaterThanOrEqual(1);
    expect(planning.logisticsContainers.length).toBeGreaterThanOrEqual(2);
    expect(planning.packedItems.length).toBeGreaterThanOrEqual(4);

    for (const board of planning.moodBoards) {
      expect(board.sections.length).toBeGreaterThan(0);
      expect(board.cards.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('generates unique ids across every new collection', () => {
    const ids = [
      ...planning.locations,
      ...planning.runOfShowCues,
      ...planning.taskBoards,
      ...planning.taskBoards.flatMap((b) => b.columns),
      ...planning.tasks,
      ...planning.tasks.flatMap((t) => t.checklist),
      ...planning.moodBoards,
      ...planning.moodBoards.flatMap((b) => b.sections),
      ...planning.moodBoards.flatMap((b) => b.cards),
      ...planning.logisticsContainers,
      ...planning.packedItems,
    ].map((entity) => entity.id);

    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('points tasks at existing boards, columns and sample people', () => {
    const boardsById = new Map(planning.taskBoards.map((board) => [board.id, board]));

    for (const task of planning.tasks) {
      const board = boardsById.get(task.boardId);
      expect(board).toBeDefined();
      expect(board!.columns.some((column) => column.id === task.columnId)).toBe(true);
      for (const assigneeId of task.assigneeIds) {
        expect(meta.people.some((person) => person.id === assigneeId)).toBe(true);
      }
      if (task.dueDate !== undefined) {
        expect(task.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }

    const doneColumns = new Set(
      planning.taskBoards.flatMap((board) =>
        board.columns.filter((column) => column.isDone).map((column) => `${board.id}:${column.id}`)
      )
    );
    for (const task of planning.tasks) {
      const isDone = doneColumns.has(`${task.boardId}:${task.columnId}`);
      expect(isDone === (task.completedAt !== undefined)).toBe(true);
    }
  });

  it('packs items only into registered containers', () => {
    const containerIds = new Set(planning.logisticsContainers.map((container) => container.id));
    expect(containerIds.size).toBe(planning.logisticsContainers.length);

    for (const item of planning.packedItems) {
      expect(containerIds.has(item.containerId)).toBe(true);
      expect(item.quantity).toBeGreaterThanOrEqual(1);
    }
  });

  it('keeps mood-board cards inside their board sections', () => {
    for (const board of planning.moodBoards) {
      const sectionIds = new Set(board.sections.map((section) => section.id));
      for (const card of board.cards) {
        expect(sectionIds.has(card.sectionId)).toBe(true);
      }
    }
  });

  it('orders run-of-show cues sequentially with valid times', () => {
    const orders = planning.runOfShowCues.map((cue) => cue.order).sort((a, b) => a - b);
    orders.forEach((order, index) => expect(order).toBe(index));

    for (const cue of planning.runOfShowCues) {
      if (cue.plannedStart !== undefined) {
        expect(cue.plannedStart).toMatch(/^\d{1,2}:\d{2}(:\d{2})?$/);
      }
      if (cue.plannedDurationSeconds !== undefined) {
        expect(cue.plannedDurationSeconds).toBeGreaterThan(0);
      }
    }
  });
});
