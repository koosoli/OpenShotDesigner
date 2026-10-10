import { describe, expect, it } from 'vitest';
import { currentRevisionColor, markRevisedLines, revisionColorAt } from '../script/revisionColors';

describe('revision colours', () => {
  it('runs the industry sequence and wraps to 2nd White', () => {
    expect(revisionColorAt(0).label).toBe('White');
    expect(revisionColorAt(1).label).toBe('Blue');
    expect(revisionColorAt(5).label).toBe('Goldenrod');
    expect(revisionColorAt(9).label).toBe('2nd White');
  });

  it('follows imported revisions unless set by hand', () => {
    expect(currentRevisionColor({ scriptRevisions: [{}, {}] }).label).toBe('Pink');
    expect(currentRevisionColor({ scriptRevisions: [{}, {}], scriptRevisionColor: 4 }).label).toBe('Green');
  });

  it('marks only lines that did not survive the re-parse', () => {
    const marked = markRevisedLines([{ id: 'a' }, { id: 'new', revisedIn: undefined }], new Set(['a']), 2);
    expect(marked).toEqual([{ id: 'a' }, { id: 'new', revisedIn: 2 }]);
  });
});
