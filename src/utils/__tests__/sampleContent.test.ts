import { describe, expect, it } from 'vitest';
import { SAMPLE_SCENES } from '../../constants/presets';
import { parseSampleScreenplay, sampleMarksFor, sampleScheduleMeta } from '../sampleContent';

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
