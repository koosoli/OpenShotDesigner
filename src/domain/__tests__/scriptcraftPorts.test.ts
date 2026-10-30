import { describe, expect, it } from 'vitest';
import { parseFinalDraftXml, parseScreenplay, parseScreenplayText, serializeToFountain } from '../../components/script/screenplayParser';
import { serializeToFdx } from '../script/fdxExport';
import { fdxColorToHex, hexToFdxColor } from '../script/fdxParagraphs';
import { parseFdxTags } from '../script/fdxTags';
import { compareDrafts, textSimilarity, wordDiff } from '../script/compareDrafts';
import { reconcileScriptLineIds } from '../script/reconcile';
import { markRevisedLines } from '../script/revisionColors';
import { deriveScriptBreakdown } from '../script/logic';
import { ENTER_EMPTY_CHANGES, ENTER_NEW, SHIFT_TAB_CHANGES, TAB_CHANGES, TAB_NEW, startsSceneHeading } from '../script/elementFlow';
import { autoContdCueIds, dualDialogueSides, paginateScreenplay } from '../script/pagination';
import { parseFdxDocument } from '../script/fdxDocument';
import { characterScriptStats } from '../script/characterStats';
import { setScreenplayLayoutCommand } from '../commands';
import type { Project } from '../../types';

const DUAL_FDX = `<?xml version="1.0" encoding="UTF-8"?>
<FinalDraft DocumentType="Script" Version="5">
  <Content>
    <Paragraph Number="4" Type="Scene Heading">
      <SceneProperties Length="3/8" Page="2" Title="" Color="#FFFF00000000">
        <Summary>
          <Paragraph Type="General"><Text>They argue about the money.</Text></Paragraph>
        </Summary>
      </SceneProperties>
      <Text>INT. BANK - DAY</Text>
    </Paragraph>
    <Paragraph>
      <DualDialogue>
        <Paragraph Type="Character"><Text>ANA</Text></Paragraph>
        <Paragraph Type="Dialogue"><Text TagNumber="1">Give it back.</Text></Paragraph>
        <Paragraph Type="Character"><Text>BEN</Text></Paragraph>
        <Paragraph Type="Dialogue"><Text>No.</Text></Paragraph>
      </DualDialogue>
    </Paragraph>
  </Content>
  <TagData>
    <TagCategories><TagCategory Id="c1" Name="Props"/></TagCategories>
    <TagDefinitions><TagDefinition Id="d1" CatId="c1" Label="Envelope"/></TagDefinitions>
    <Tags><Tag Number="1"><DefId>d1</DefId></Tag></Tags>
  </TagData>
</FinalDraft>`;

describe('Final Draft dual dialogue and index cards', () => {
  it('reads both speeches, marks the second cue dual and keeps the card off the slugline', () => {
    const parsed = parseFinalDraftXml(DUAL_FDX);
    expect(parsed.map((line) => [line.type, line.text])).toEqual([
      ['scene', 'INT. BANK - DAY'],
      ['character', 'ANA'],
      ['dialogue', 'Give it back.'],
      ['character', 'BEN'],
      ['dialogue', 'No.'],
    ]);
    expect(parsed[3].dual).toBe(true);
    expect(parsed[1].dual).toBeUndefined();
    expect(parsed[0].synopsis).toBe('They argue about the money.');
    expect(parsed[0].sceneColor).toBe('#ff0000');
  });

  it('finds tags inside dual dialogue', () => {
    expect(parseFdxTags(DUAL_FDX)[0]).toMatchObject({ name: 'Envelope', paragraphs: ['Give it back.'] });
  });

  it('round-trips dual dialogue and the card through export', () => {
    const lines = parseScreenplay(DUAL_FDX, 'bank.fdx');
    const xml = serializeToFdx(lines);
    expect(xml).toContain('<DualDialogue>');
    expect(xml).toContain('<Summary>');
    const again = parseFinalDraftXml(xml);
    expect(again.map((line) => [line.type, line.text, line.dual ?? false])).toEqual(
      lines.map((line) => [line.type, line.text, line.dual ?? false]),
    );
    expect(again[0].synopsis).toBe('They argue about the money.');
    expect(again[0].sceneColor).toBe('#ff0000');
  });

  it('converts Final Draft colours both ways', () => {
    expect(fdxColorToHex('#FFFF00000000')).toBe('#ff0000');
    expect(fdxColorToHex('#12AB34')).toBe('#12ab34');
    expect(fdxColorToHex('nonsense')).toBeUndefined();
    expect(hexToFdxColor('#ff0000')).toBe('#FFFF00000000');
  });

  it('carries the summary and colour into the scene list', () => {
    const { scenes } = deriveScriptBreakdown(parseScreenplay(DUAL_FDX, 'bank.fdx'));
    expect(scenes[0]).toMatchObject({ synopsis: 'They argue about the money.', color: '#ff0000' });
  });
});

describe('Fountain dual dialogue, synopses and page breaks', () => {
  const raw = [
    'INT. BANK - DAY',
    '= They argue about the money.',
    '',
    'ANA',
    'Give it back.',
    '',
    'BEN ^',
    'No.',
    '',
    '===',
    '',
    'EXT. STREET - NIGHT',
  ].join('\n');

  it('reads ^ as dual, = as the scene synopsis and === as a page break', () => {
    const parsed = parseScreenplayText(raw);
    expect(parsed.map((line) => [line.type, line.text])).toEqual([
      ['scene', 'INT. BANK - DAY'],
      ['character', 'ANA'],
      ['dialogue', 'Give it back.'],
      ['character', 'BEN'],
      ['dialogue', 'No.'],
      ['page-break', ''],
      ['scene', 'EXT. STREET - NIGHT'],
    ]);
    expect(parsed[3].dual).toBe(true);
    expect(parsed[0].synopsis).toBe('They argue about the money.');
  });

  it('writes them back', () => {
    const fountain = serializeToFountain(parseScreenplay(raw, 'bank.fountain'));
    expect(fountain).toContain('= They argue about the money.');
    expect(fountain).toContain('BEN ^');
    const again = parseScreenplayText(fountain);
    expect(again[3]).toMatchObject({ type: 'character', text: 'BEN', dual: true });
  });

  it('knows which column each dual line prints in', () => {
    const lines = parseScreenplay(raw, 'bank.fountain');
    const sides = dualDialogueSides(lines);
    expect(lines.slice(1, 5).map((line) => sides.get(line.id))).toEqual(['left', 'left', 'right', 'right']);
  });
});

describe('automatic (CONT\'D) for the editor', () => {
  it('flags a cue whose character spoke last in the scene', () => {
    const lines = [
      { id: 'h', type: 'scene', text: 'INT. A - DAY' },
      { id: 'c1', type: 'character', text: 'ANA' },
      { id: 'd1', type: 'dialogue', text: 'One.' },
      { id: 'a', type: 'action', text: 'She sits.' },
      { id: 'c2', type: 'character', text: 'ANA' },
      { id: 'd2', type: 'dialogue', text: 'Two.' },
    ];
    expect([...autoContdCueIds(lines)]).toEqual(['c2']);
  });
});

describe('word-level draft comparison', () => {
  it('diffs words and keeps the text recoverable', () => {
    const pieces = wordDiff('She opens the door.', 'She slowly opens the red door.');
    expect(pieces.filter((piece) => piece.op === 'added').map((piece) => piece.text.trim())).toEqual(['slowly', 'red']);
    expect(pieces.filter((piece) => piece.op !== 'removed').map((piece) => piece.text).join('')).toBe('She slowly opens the red door.');
    expect(pieces.filter((piece) => piece.op !== 'added').map((piece) => piece.text).join('')).toBe('She opens the door.');
  });

  it('scores similarity by shared words', () => {
    expect(textSimilarity('a b c d', 'a b c d')).toBe(1);
    expect(textSimilarity('a b', 'c d')).toBe(0);
  });

  it('classifies changed, added, removed and moved lines', () => {
    const older = [
      { type: 'scene', text: 'INT. ROOM - DAY' },
      { type: 'action', text: 'A cat sleeps.' },
      { type: 'action', text: 'She opens the door.' },
      { type: 'action', text: 'A dog barks.' },
      { type: 'action', text: 'Rain falls outside the window.' },
      { type: 'action', text: 'Cut this line entirely please.' },
    ];
    const newer = [
      { type: 'scene', text: 'INT. ROOM - DAY' },
      { type: 'action', text: 'She slowly opens the door.' },
      { type: 'action', text: 'A dog barks.' },
      { type: 'action', text: 'Something brand new happens here.' },
      { type: 'action', text: 'Rain falls outside the window.' },
      { type: 'action', text: 'A cat sleeps.' },
    ];
    const result = compareDrafts(older, newer);
    expect(result.moved).toBe(1);
    expect(result.removed).toBe(1);
    expect(result.added).toBe(1);
    expect(result.unchanged).toBe(3);
    const changed = result.diffs.filter((diff) => diff.kind === 'changed');
    expect(changed).toHaveLength(1);
    expect(changed[0]).toMatchObject({ old: 2, new: 1, scene: 'INT. ROOM - DAY' });
  });
});

describe('reworded lines keep their identity', () => {
  it('reuses the id of a reworded line and marks it revised', () => {
    const previous = [
      { id: 'h', type: 'scene', text: 'INT. ROOM - DAY', sceneNumber: '1' },
      { id: 'a', type: 'action', text: 'She opens the door.' },
      { id: 'b', type: 'action', text: 'A dog barks.' },
    ];
    const next = [
      { id: 'n0', type: 'scene', text: 'INT. ROOM - DAY', sceneNumber: '1' },
      { id: 'n1', type: 'action', text: 'She slowly opens the door.' },
      { id: 'n2', type: 'action', text: 'A dog barks.' },
    ];
    const reconciled = reconcileScriptLineIds(next, previous);
    expect(reconciled.map((line) => line.id)).toEqual(['h', 'a', 'b']);
    const marked = markRevisedLines(reconciled, new Map(previous.map((line) => [line.id, line.text] as const)), 1);
    expect(marked.map((line) => (line as { revisedIn?: number }).revisedIn)).toEqual([undefined, 1, undefined]);
  });

  it('keeps an index card the new draft does not carry', () => {
    const previous = [{ id: 'h', type: 'scene', text: 'INT. ROOM - DAY', sceneNumber: '1', synopsis: 'Arrival.', sceneColor: '#ff0000' }];
    const next = [{ id: 'n0', type: 'scene', text: 'INT. ROOM - DAY', sceneNumber: '1' }];
    expect(reconcileScriptLineIds(next, previous)[0]).toMatchObject({ id: 'h', synopsis: 'Arrival.', sceneColor: '#ff0000' });
  });
});

describe('Final Draft element flow', () => {
  it('types the classic exchange', () => {
    expect(TAB_NEW.action).toBe('character');
    expect(ENTER_NEW.character).toBe('dialogue');
    expect(ENTER_NEW.dialogue).toBe('action');
    expect(ENTER_NEW.action).toBe('action');
    expect(TAB_NEW.dialogue).toBe('parenthetical');
    expect(ENTER_NEW.parenthetical).toBe('dialogue');
    expect(ENTER_NEW.transition).toBe('scene');
  });

  it('reaches a transition from an empty action line with Tab, Tab', () => {
    expect(TAB_CHANGES[TAB_CHANGES.action!]).toBe('transition');
    expect(TAB_CHANGES.transition).toBe('scene');
    expect(ENTER_EMPTY_CHANGES.action).toBe('scene');
    expect(SHIFT_TAB_CHANGES.character).toBe('action');
  });

  it('turns "int. " on an action line into a heading', () => {
    expect(startsSceneHeading('int. diner')).toBe(true);
    expect(startsSceneHeading('EXT. ')).toBe(true);
    expect(startsSceneHeading('int./ext. car')).toBe(true);
    expect(startsSceneHeading('i/e porch')).toBe(true);
    expect(startsSceneHeading('Interesting things happen.')).toBe(false);
    expect(startsSceneHeading('int.')).toBe(false);
  });
});

describe('setScreenplayLayoutCommand', () => {
  it('stores only what differs from Letter with automatic (CONT\'D)', () => {
    const project = { screenplayLayout: undefined } as unknown as Project;
    const a4 = setScreenplayLayoutCommand(project, { layout: { paper: 'a4' } }).project;
    expect(a4.screenplayLayout).toEqual({ paper: 'a4' });
    const off = setScreenplayLayoutCommand(a4, { layout: { autoContd: false } }).project;
    expect(off.screenplayLayout).toEqual({ paper: 'a4', autoContd: false });
    const back = setScreenplayLayoutCommand(setScreenplayLayoutCommand(off, { layout: { paper: undefined } }).project, { layout: { autoContd: undefined } });
    expect(back.project.screenplayLayout).toBeUndefined();
    expect(back.meta.type).toBe('setScreenplayLayout');
  });
});

describe('Final Draft fidelity (ScriptCraft v0.5)', () => {
  const FILE = `<?xml version="1.0"?>
<FinalDraft DocumentType="Script" Version="6">
  <Content>
    <Paragraph Type="Outline 1"><Text>ACT ONE</Text></Paragraph>
    <Paragraph Number="1" Type="Scene Heading"><Text>INT. BANK - DAY</Text></Paragraph>
    <Paragraph Type="Action"><Text RevisionID="2">The vault is open.</Text></Paragraph>
    <Paragraph Type="Action"><Text RevisionID="0">Nobody notices.</Text></Paragraph>
  </Content>
  <PageLayout><PageSize Height="11.69" Width="8.27"/></PageLayout>
  <MoresAndContinueds><DialogueBreaks AutomaticCharacterContinueds="No"/></MoresAndContinueds>
  <Revisions ActiveSet="2">
    <Revision ID="1" Name="Blue Rev. (10/01/26)" PageColor="#BFBFDBDBFEFE"/>
    <Revision ID="2" Name="Pink Rev. (10/12/26)" PageColor="#FBFBCFCFE8E8"/>
  </Revisions>
  <TitlePage><Content>
    <Paragraph Alignment="Center"><Text>THE BANK JOB</Text></Paragraph>
    <Paragraph Alignment="Center"><Text>Written by</Text></Paragraph>
    <Paragraph Alignment="Center"><Text>Ada Writer</Text></Paragraph>
    <Paragraph Alignment="Left"><Text>ada@example.com</Text></Paragraph>
    <Paragraph Alignment="Right"><Text>Pink Revision</Text></Paragraph>
    <Paragraph Alignment="Right"><Text>10/12/26</Text></Paragraph>
  </Content></TitlePage>
</FinalDraft>`;

  it('keeps outline paragraphs out of the action and reads revision colours', () => {
    const lines = parseScreenplay(FILE, 'bank.fdx');
    expect(lines.map((line) => [line.type, line.text, line.revisedIn])).toEqual([
      ['scene', 'INT. BANK - DAY', undefined],
      ['action', 'The vault is open.', 2],
      ['action', 'Nobody notices.', undefined],
    ]);
    expect(lines[0].structure).toEqual([expect.objectContaining({ level: 1, title: 'ACT ONE' })]);
  });

  it('reads the cover, the paper, automatic (CONT\'D) and the active revision', () => {
    const settings = parseFdxDocument(FILE);
    expect(settings.titlePage).toMatchObject({ title: 'THE BANK JOB', credit: 'Written by', authors: 'Ada Writer', contact: 'ada@example.com', draftLabel: 'Pink Revision', date: '10/12/26' });
    expect(settings.layout).toEqual({ paper: 'a4', autoContd: false });
    expect(settings.activeRevision).toBe(2);
  });

  it('writes the paper, (CONT\'D) setting and revision sets back out', () => {
    const lines = parseScreenplay(FILE, 'bank.fdx');
    const xml = serializeToFdx(lines, { layout: { paper: 'a4', autoContd: false }, revisionIndex: 2 });
    expect(xml).toContain('<PageSize Height="11.69" Width="8.27"/>');
    expect(xml).toContain('AutomaticCharacterContinueds="No"');
    expect(xml).toContain('<Revisions ActiveSet="2"');
    expect(xml).toContain('<Text RevisionID="2">The vault is open.</Text>');
    const again = parseFdxDocument(xml);
    expect(again).toMatchObject({ layout: { paper: 'a4', autoContd: false }, activeRevision: 2 });
    expect(parseScreenplay(xml, 'again.fdx').find((line) => line.text === 'The vault is open.')?.revisedIn).toBe(2);
  });
});

describe('Fountain shots', () => {
  it('round-trips a shot that is not a standard shot call', () => {
    const lines = [
      { id: 'a', lineNumber: 1, type: 'scene' as const, text: 'INT. BANK - DAY' },
      { id: 'b', lineNumber: 2, type: 'shot' as const, text: 'BIG HEAD OF MARA' },
      { id: 'c', lineNumber: 3, type: 'shot' as const, text: 'ANGLE ON THE DOOR' },
    ];
    const fountain = serializeToFountain(lines);
    expect(fountain).toContain('!BIG HEAD OF MARA [[shot]]');
    expect(parseScreenplayText(fountain).map((line) => [line.type, line.text])).toEqual([
      ['scene', 'INT. BANK - DAY'],
      ['shot', 'BIG HEAD OF MARA'],
      ['shot', 'ANGLE ON THE DOOR'],
    ]);
  });
});

describe('dual dialogue (CONT\'D) stays in its column', () => {
  it('moves a long continued cue left inside the column', () => {
    const lines = [
      ...Array.from({ length: 24 }, (_, i) => ({ id: `f${i}`, type: 'action', text: `Beat ${i}.` })),
      { id: 'c1', type: 'character', text: 'BARTHOLOMEW' },
      { id: 'd1', type: 'dialogue', text: Array.from({ length: 14 }, (_, i) => `Sentence number ${i} is here.`).join(' ') },
      { id: 'c2', type: 'character', text: 'BEN', dual: true },
      { id: 'd2', type: 'dialogue', text: 'No.' },
    ];
    const { pages } = paginateScreenplay(lines);
    const contd = pages[1].lines.find((line) => line.kind === 'contd');
    expect(contd?.text).toBe("BARTHOLOMEW (CONT'D)");
    expect(contd!.col + contd!.text.length).toBeLessThanOrEqual(28);
  });
});

describe('character figures', () => {
  it('counts speeches, words, first page and pages', () => {
    const lines = [
      { id: 'h', type: 'scene', text: 'INT. A - DAY' },
      { id: 'c1', type: 'character', text: 'ANA' },
      { id: 'p1', type: 'parenthetical', text: '(softly)' },
      { id: 'd1', type: 'dialogue', text: 'One two three.' },
      { id: 'c2', type: 'character', text: 'ANA (V.O.)' },
      { id: 'd2', type: 'dialogue', text: 'Four.' },
    ];
    const { characters, scenes } = deriveScriptBreakdown(lines);
    const stats = characterScriptStats(lines, characters, scenes, new Map([['c1', '12A']]));
    expect(stats.get(characters[0].id)).toEqual({ speeches: 2, words: 4, firstPage: '12A', eighths: scenes[0].pageLengthEighths });
  });
});

describe('multi-camera format and scene CONTINUED', () => {
  const scene = (n: number, extra: PaginationLineLike[] = []) => [
    { id: `h${n}`, type: 'scene', text: `INT. SET ${n} - DAY` },
    { id: `c${n}`, type: 'character', text: 'ANA' },
    { id: `d${n}`, type: 'dialogue', text: 'This line of dialogue is long enough that it wraps onto a second line.' },
    ...extra,
  ];
  type PaginationLineLike = { id: string; type: string; text: string };

  it('double-spaces dialogue and starts every scene on a new page', () => {
    const lines = [...scene(1), ...scene(2)];
    const feature = paginateScreenplay(lines);
    const multicam = paginateScreenplay(lines, { multicam: true });
    expect(feature.pages).toHaveLength(1);
    expect(multicam.pages).toHaveLength(2);
    const rows = multicam.pages[0].lines.filter((line) => line.index === 2 && line.text).map((line) => line.row);
    expect(rows[1] - rows[0]).toBe(2);
  });

  it('marks a scene that runs over a page with (CONTINUED) and CONTINUED:', () => {
    const lines = [
      { id: 'h', type: 'scene', text: 'INT. HALL - DAY' },
      ...Array.from({ length: 40 }, (_, i) => ({ id: `a${i}`, type: 'action', text: `Beat ${i}.` })),
      { id: 'h2', type: 'scene', text: 'INT. ROOM - DAY' },
      { id: 'b', type: 'action', text: 'Quiet.' },
    ];
    const { pages, rowsPerPage } = paginateScreenplay(lines, { sceneContinued: true });
    const marks = pages.map((page) => page.lines.filter((line) => line.kind === 'continued').map((line) => [line.text, line.row]));
    expect(marks[0]).toEqual([['(CONTINUED)', rowsPerPage - 1]]);
    expect(marks[1]).toEqual([['CONTINUED:', 0]]);
    expect(pages.every((page) => page.lines.every((line) => line.row < rowsPerPage))).toBe(true);
    expect(paginateScreenplay(lines).pages.flatMap((page) => page.lines).some((line) => line.kind === 'continued')).toBe(false);
  });

  it('round-trips both settings through Final Draft', () => {
    const xml = serializeToFdx([{ type: 'scene', text: 'INT. A - DAY' }], { layout: { format: 'multicam', sceneContinued: true } });
    expect(parseFdxDocument(xml).layout).toEqual({ format: 'multicam', sceneContinued: true });
  });
});

describe('Final Draft script notes', () => {
  it('imports a note under its paragraph and writes it back', () => {
    const xml = `<?xml version="1.0"?><FinalDraft DocumentType="Script"><Content>
      <Paragraph Type="Action"><ScriptNote Author="Ada" ID="1"><Paragraph><Text>Shorten this.</Text></Paragraph></ScriptNote><Text>The vault opens.</Text></Paragraph>
    </Content></FinalDraft>`;
    const lines = parseScreenplay(xml, 'notes.fdx');
    expect(lines.map((line) => [line.type, line.text])).toEqual([['action', 'The vault opens.']]);
    expect(lines[0].notes).toEqual([expect.objectContaining({ author: 'Ada', text: 'Shorten this.', start: 0, end: 16 })]);
    const again = parseScreenplay(serializeToFdx(lines), 'again.fdx');
    expect(again.map((line) => [line.type, line.text])).toEqual([['action', 'The vault opens.']]);
    expect(again[0].notes).toEqual([expect.objectContaining({ author: 'Ada', text: 'Shorten this.', start: 0, end: 16 })]);
  });
});

describe('cues with a lower-case extension', () => {
  it("reads EDWARD (cont'd) as a cue", () => {
    const parsed = parseScreenplayText(['INT. A - DAY', '', "EDWARD (cont'd)", 'Gold.'].join('\n'));
    expect(parsed.map((line) => [line.type, line.text])).toEqual([['scene', 'INT. A - DAY'], ['character', "EDWARD (CONT'D)"], ['dialogue', 'Gold.']]);
  });
});
