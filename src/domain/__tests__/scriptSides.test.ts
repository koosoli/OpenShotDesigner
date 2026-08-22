import { describe, it, expect } from 'vitest';
import { buildScriptSides, sidesCharacterOptions, splitScenes } from '../script/sides';
import { omitScene } from '../script/omission';

const lines = [
  { id: 'n0', type: 'note', text: 'Draft 3' },
  { id: 'h1', type: 'scene', text: 'INT. KITCHEN - DAY', sceneNumber: '1' },
  { id: 'a1', type: 'action', text: 'Anna pours coffee.' },
  { id: 'c1', type: 'character', text: 'ANNA (V.O.)' },
  { id: 'd1', type: 'dialogue', text: 'Morning.' },
  { id: 'h2', type: 'scene', text: 'EXT. STREET - NIGHT', sceneNumber: '2' },
  { id: 'c2', type: 'character', text: 'BEN' },
  { id: 'd2', type: 'dialogue', text: 'Rain again.' },
  { id: 'h3', type: 'scene', text: 'INT. CAR - NIGHT', sceneNumber: '3' },
  { id: 'c3', type: 'character', text: 'ANNA' },
  { id: 'd3', type: 'dialogue', text: 'Drive.' },
];

describe('splitScenes', () => {
  it('chunks by slugline and keeps a preamble for leading lines', () => {
    const chunks = splitScenes(lines);
    expect(chunks.map((c) => c.id)).toEqual(['preamble-0', 'h1', 'h2', 'h3']);
    expect(chunks[1].lines.map((l) => l.id)).toEqual(['h1', 'a1', 'c1', 'd1']);
  });
});

describe('buildScriptSides', () => {
  it('includes every scene in script order by default', () => {
    const sides = buildScriptSides(lines);
    expect(sides.scenes.map((s) => s.sceneNumber)).toEqual(['1', '2', '3']);
    expect(sides.scenes[0].characters).toEqual(['ANNA']);
    expect(sides.missingSceneIds).toEqual([]);
  });

  it('follows the requested (shooting) order and reports unknown ids', () => {
    const sides = buildScriptSides(lines, { sceneIds: ['h3', 'h1', 'ghost'] });
    expect(sides.scenes.map((s) => s.sceneId)).toEqual(['h3', 'h1']);
    expect(sides.missingSceneIds).toEqual(['ghost']);
  });

  it('filters to the scenes a character speaks in (extension-insensitive)', () => {
    const sides = buildScriptSides(lines, { character: 'anna' });
    expect(sides.scenes.map((s) => s.sceneNumber)).toEqual(['1', '3']);
  });

  it('prints omitted scenes as a slug only, or skips them when asked', () => {
    const omitted = omitScene(lines, 'h2');
    const kept = buildScriptSides(omitted);
    expect(kept.scenes[1]).toMatchObject({ omitted: true, heading: 'SCENE 2 — OMITTED' });
    expect(kept.scenes[1].lines).toHaveLength(1);
    const skipped = buildScriptSides(omitted, { skipOmitted: true });
    expect(skipped.scenes.map((s) => s.sceneNumber)).toEqual(['1', '3']);
  });

  it('lists character options alphabetically', () => {
    expect(sidesCharacterOptions(lines)).toEqual(['ANNA', 'BEN']);
  });
});
