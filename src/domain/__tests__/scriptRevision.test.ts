import { describe, expect, it } from 'vitest';
import { compareScriptRevisions } from '../script/revision';

describe('script revision comparison', () => {
  it('classifies scenes by production number and content', () => {
    const before = [
      { type: 'scene', text: 'INT. HOUSE - DAY', sceneNumber: '1' },
      { type: 'action', text: 'She enters.' },
      { type: 'scene', text: 'EXT. ROAD - DAY', sceneNumber: '2' },
    ];
    const after = [
      { type: 'scene', text: 'INT. HOUSE - DAY', sceneNumber: '1' },
      { type: 'action', text: 'She runs in.' },
      { type: 'scene', text: 'INT. CAR - DAY', sceneNumber: '1A' },
    ];
    const result = compareScriptRevisions(before, after);
    expect(result).toMatchObject({ added: 1, removed: 1, changed: 1, unchanged: 0 });
    expect(result.scenes.find((scene) => scene.key === '1#1')?.kind).toBe('changed');
  });
});
