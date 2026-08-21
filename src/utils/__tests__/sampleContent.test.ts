import { describe, expect, it } from 'vitest';
import { parseSampleScreenplay, sampleMarksFor } from '../sampleContent';

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
