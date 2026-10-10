import { describe, expect, it } from 'vitest';
import { serializeToFdx } from '../script/fdxExport';
import { parseFinalDraftXml } from '../../components/script/screenplayParser';

describe('Final Draft export', () => {
  const lines = [
    { type: 'scene', text: 'INT. DINER - NIGHT', sceneNumber: '12A' },
    { type: 'action', text: 'Rain & neon <outside>.' },
    { type: 'character', text: 'ALEX' },
    { type: 'parenthetical', text: '(quietly)' },
    { type: 'dialogue', text: 'Here.' },
    { type: 'scene', text: 'EXT. ROAD - DAY', sceneNumber: '13', omitted: true },
    { type: 'transition', text: 'CUT TO:' },
  ];

  it('writes Final Draft XML that reads back to the same lines, cover excluded', () => {
    const xml = serializeToFdx(lines, { titlePage: { title: 'The Long Walk', authors: 'A. Writer' } });
    expect(xml).toContain('<FinalDraft DocumentType="Script"');
    expect(xml).toContain('Number="12A"');
    expect(xml).toContain('Rain &amp; neon &lt;outside&gt;.');
    expect(xml).toContain('<TitlePage>');
    const parsed = parseFinalDraftXml(xml);
    expect(parsed.map((line) => [line.type, line.text])).toEqual([
      ['scene', 'INT. DINER - NIGHT'],
      ['action', 'Rain & neon <outside>.'],
      ['character', 'ALEX'],
      ['parenthetical', '(quietly)'],
      ['dialogue', 'Here.'],
      ['scene', 'EXT. ROAD - DAY'],
      ['transition', 'CUT TO:'],
    ]);
    expect(parsed[0].sceneNumber).toBe('12A');
    expect(parsed[5].omitted).toBe(true);
  });
});
