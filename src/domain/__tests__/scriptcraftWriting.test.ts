import { describe, expect, it } from 'vitest';
import type { ScriptLine } from '../../types';
import { chooseScriptAlternate, editScriptText, findScriptText, moveScriptScene, replaceScriptHits, scriptMetadataError, sliceScriptLine, toggleTextStyle, uppercaseScriptText } from '../script/editing';
import { parseInlineFountain, styledFountain } from '../script/inlineFormat';
import { parseScreenplay, serializeToFountain } from '../../components/script/screenplayParser';
import { serializeToFdx } from '../script/fdxExport';
import { reconcileScriptLineIds } from '../script/reconcile';
import { migrateProject } from '../migrations';
import { createProject } from '../../utils/projectLibrary';
import { paginateScreenplay } from '../script/pagination';

const line = (text = 'Hello world.', patch: Partial<ScriptLine> = {}): ScriptLine => ({ id: 'line', lineNumber: 1, type: 'dialogue', text, ...patch });
const writing = () => line('Hello world.', {
  styles: [{ start: 0, end: 5, bold: true }, { start: 6, end: 11, italic: true, underline: true }],
  notes: [{ id: 'note', text: '<script>alert("x")</script> & review', author: 'Éva', color: '#aabbcc', start: 6, end: 11 }],
  bookmark: 'Review here', alternates: [{ id: 'alt', text: 'Other words.', styles: [{ start: 0, end: 5, bold: true }] }],
});

describe('screenplay style and annotation edits', () => {
  it('maps style and note boundaries through Unicode capitals which expand', () => {
    const result = uppercaseScriptText(line('Die Straße.', { styles: [{ start: 4, end: 10, italic: true }], notes: [{ id: 'n', text: 'Eszett', start: 8, end: 9 }] }));
    expect(result.text).toBe('DIE STRASSE.');
    expect(result.styles).toEqual([{ start: 4, end: 11, italic: true }]);
    expect(result.notes?.[0]).toMatchObject({ start: 8, end: 10 });
  });
  it('toggles only the selected flag and keeps intersecting styles', () => {
    const bold = toggleTextStyle(line(), 0, 5, 'bold');
    const combined = toggleTextStyle(bold, 2, 8, 'italic');
    expect(combined.styles).toEqual([{ start: 0, end: 2, bold: true }, { start: 2, end: 5, bold: true, italic: true }, { start: 5, end: 8, italic: true }]);
    expect(toggleTextStyle(bold, 0, 5, 'bold').styles).toEqual([]);
  });
  it('shifts annotations and styles on insertion and replacement without changing IDs', () => {
    const result = editScriptText(writing(), 'Well, Hello world.');
    expect(result.id).toBe('line');
    expect(result.notes?.[0]).toMatchObject({ start: 12, end: 17, id: 'note' });
    expect(result.styles?.at(-1)).toMatchObject({ start: 12, end: 17, italic: true, underline: true });
    expect(scriptMetadataError(result)).toBeNull();
  });
  it('clips deleted ranges to a valid anchor and splits styled paragraphs', () => {
    const original = writing();
    const erased = editScriptText(original, 'Hello .');
    expect(erased.notes?.[0]).toMatchObject({ start: 6, end: 6 });
    const tail = sliceScriptLine(original, 6, original.text.length);
    expect(tail.text).toBe('world.');
    expect(tail.styles).toEqual([{ start: 0, end: 5, italic: true, underline: true }]);
    expect(tail.notes?.[0]).toMatchObject({ start: 0, end: 5 });
  });
  it('does not split surrogate pairs at a selection boundary', () => {
    const value = toggleTextStyle(line('A😀B'), 2, 3, 'bold');
    expect(value.styles).toEqual([{ start: 1, end: 3, bold: true }]);
    expect(editScriptText(value, 'A😃B').text).toBe('A😃B');
    expect(scriptMetadataError(editScriptText(value, 'A😃B'))).toBeNull();
  });
  it('retains writing metadata when a revised import reuses a paragraph identity', () => {
    const [result] = reconcileScriptLineIds([line('Hello new world.', { id: 'fresh' })], [writing()]);
    expect(result).toMatchObject({ id: 'line', bookmark: 'Review here' });
    expect(result.notes?.[0]).toMatchObject({ start: 6, end: 15 });
    expect(result.alternates).toEqual(writing().alternates);
  });
});

describe('Fountain emphasis and writing metadata', () => {
  it.each([
    'A **bold** and *italic* and _underlined_ word.',
    'An ***important*** _**bold underlined**_ word.',
    'Literal \\*stars\\* and \\_underscores\\_.',
    '**' + 'A'.repeat(5000) + '**',
  ])('round-trips styles and escaped literal characters', (input) => {
    const parsed = parseInlineFountain(input);
    expect(parseInlineFountain(styledFountain(parsed.text, parsed.styles))).toEqual(parsed);
  });
  it('preserves adjacent different styles', () => {
    const value = line('abcd', { styles: [{ start: 0, end: 2, bold: true }, { start: 2, end: 4, bold: true, italic: true }] });
    expect(parseInlineFountain(styledFountain(value.text, value.styles))).toEqual({ text: value.text, styles: value.styles });
  });
  it('keeps inline styles across hard-wrapped paragraphs', () => {
    const parsed = parseScreenplay('!A **bold** word\nand *more*.\n', 'draft.fountain');
    expect(parsed[0].text).toBe('A bold word and more.');
    expect(parsed[0].styles).toEqual([{ start: 2, end: 6, bold: true }, { start: 16, end: 20, italic: true }]);
  });
  it('preserves metadata, structure and Cyrillic cues in a full file round-trip', () => {
    const values = [line('INT. BANK - DAY', { type: 'scene', id: 'scene', sceneNumber: '1', structure: [{ id: 'act', level: 1, title: 'Act One' }] }), line('ЖЕНЯ', { type: 'character', id: 'cue' }), writing()];
    const result = parseScreenplay(serializeToFountain(values), 'roundtrip.fountain');
    expect(result.map((l) => [l.type, l.text])).toEqual(values.map((l) => [l.type, l.text]));
    expect(result[0].structure?.[0]).toMatchObject({ title: 'Act One', level: 1 });
    expect(result[2]).toMatchObject({ notes: writing().notes, styles: writing().styles, alternates: writing().alternates, bookmark: 'Review here' });
  });
  it('refuses arbitrary metadata keys and invalid annotation ranges', () => {
    const encoded = btoa(JSON.stringify({ '__proto__': null, notes: [{ id: 'n', text: 'bad', start: -1, end: 10 }] }));
    expect(() => parseScreenplay(`!Hello.\n[[OSD-META:v1:${encoded}]]`, 'draft.fountain')).toThrow('Invalid screenplay notes');
    const extra = btoa('{"html":"<img src=x onerror=alert(1)>"}');
    expect(() => parseScreenplay(`!Hello.\n[[OSD-META:v1:${extra}]]`, 'draft.fountain')).toThrow('Invalid screenplay metadata');
  });
});

describe('Final Draft writing fidelity', () => {
  it('keeps outline summaries out of the printed script and retains them in FDX and Fountain', () => {
    const source = '<FinalDraft><Content><Paragraph Type="Outline 1"><Text>ACT ONE</Text></Paragraph><Paragraph Type="Summary"><Text>The setup.</Text></Paragraph><Paragraph Type="Scene Heading"><Text>INT. BANK - DAY</Text></Paragraph></Content></FinalDraft>';
    const values = parseScreenplay(source, 'outline.fdx');
    expect(values).toHaveLength(1);
    expect(values[0].structure?.[0]).toMatchObject({ title: 'ACT ONE', summary: 'The setup.' });
    expect(parseScreenplay(serializeToFdx(values), 'back.fdx')[0].structure?.[0].summary).toBe('The setup.');
    expect(parseScreenplay(serializeToFountain(values), 'back.fountain')[0].structure?.[0].summary).toBe('The setup.');
  });
  it('round-trips styles, anchored notes, bookmark, alternatives and outline', () => {
    const source = writing();
    source.structure = [{ id: 'act', title: 'ACT & ONE', level: 1 }];
    const xml = serializeToFdx([source]);
    expect(xml).toContain('Style="Italic+Underline"');
    expect(xml).not.toContain('<script>');
    const [result] = parseScreenplay(xml, 'draft.fdx');
    expect(result.text).toBe(source.text);
    expect(result.styles).toEqual(source.styles);
    expect(result.notes?.[0]).toMatchObject({ ...source.notes![0], id: expect.any(String) });
    expect(result.alternates?.[0]).toMatchObject({ ...source.alternates![0], id: expect.any(String) });
    expect(result.bookmark).toBe(source.bookmark);
    expect(result.structure?.[0]).toMatchObject({ title: 'ACT & ONE', level: 1 });
  });
  it('keeps styling in both dual-dialogue columns', () => {
    const source = [line('ANA', { id: 'a', type: 'character' }), writing(), line('BEN', { id: 'b', type: 'character', dual: true }), { ...writing(), id: 'right' }];
    const result = parseScreenplay(serializeToFdx(source), 'dual.fdx');
    expect(result[1].styles).toEqual(writing().styles);
    expect(result[3].styles).toEqual(writing().styles);
    expect(result[2].dual).toBe(true);
  });
  it('reads the starting position of an inline Final Draft note', () => {
    const [result] = parseScreenplay('<FinalDraft><Content><Paragraph Type="Action"><Text>First </Text><ScriptNote Author="Ada"><Paragraph><Text>Look here</Text></Paragraph></ScriptNote><Text Style="Bold">second.</Text></Paragraph></Content></FinalDraft>', 'note.fdx');
    expect(result.notes?.[0]).toMatchObject({ start: 6, end: 13, author: 'Ada' });
    expect(result.styles).toEqual([{ start: 6, end: 13, bold: true }]);
  });
});

describe('search, alternatives, scene structure and migration', () => {
  it('searches literal punctuation and Unicode without accepting regex syntax', () => {
    expect(findScriptText([line('A.* [x] Ωω')], '.*')).toEqual([{ lineId: 'line', start: 1, end: 3 }]);
    expect(findScriptText([line('A.* [x] Ωω')], 'ω')).toHaveLength(2);
    expect(findScriptText([line('A.* [x] Ωω')], 'ω', true)).toHaveLength(1);
  });
  it('replaces original hits only and retains IDs and annotation bounds', () => {
    const values = [writing()];
    const replaced = replaceScriptHits(values, findScriptText(values, 'world'), 'new world');
    expect(replaced[0].text).toBe('Hello new world.');
    expect(replaced[0].id).toBe('line');
    expect(replaced[0].notes?.[0]).toMatchObject({ start: 6, end: 15 });
    expect(scriptMetadataError(replaced[0])).toBeNull();
  });
  it('swaps an alternative reversibly, keeping the paragraph ID and previous styled version', () => {
    const source = writing(), first = chooseScriptAlternate(source, 'alt'), second = chooseScriptAlternate(first, 'alt');
    expect(first).toMatchObject({ id: 'line', text: 'Other words.', styles: source.alternates?.[0].styles });
    expect(second.text).toBe(source.text);
    expect(second.styles).toEqual(source.styles);
    expect(first.notes?.[0].id).toBe('note');
  });
  it('moves whole scenes and their stable references, leaving the preamble in place', () => {
    const values = [line('Preamble', { id: 'p' }), line('INT. A - DAY', { id: 'a', type: 'scene' }), line('A body', { id: 'aa' }), line('EXT. B - NIGHT', { id: 'b', type: 'scene' }), line('B body', { id: 'bb' })];
    expect(moveScriptScene(values, 'b', -1).map((l) => l.id)).toEqual(['p', 'b', 'bb', 'a', 'aa']);
    expect(moveScriptScene(values, 'a', -1)).toEqual(values);
    const structured: ScriptLine = { ...values[1], structure: [{ id: 's', title: 'Act', level: 1 }] };
    expect(paginateScreenplay([structured]).pages).toEqual(paginateScreenplay([values[1]]).pages);
  });
  it('migrates old projects without rewriting note lines or production IDs', () => {
    const old = { ...createProject({ title: 'Old' }), schemaVersion: 37, scriptLines: [line('Legacy note', { type: 'note' })] };
    const before = structuredClone(old);
    const result = migrateProject(old);
    expect(result.project.schemaVersion).toBe(38);
    expect(result.project.scriptLines).toEqual(before.scriptLines);
    expect(result.project.setups).toEqual(before.setups);
    expect(old).toEqual(before);
  });
  it.each([
    { styles: [{ start: -1, end: 2, bold: true }] },
    { styles: [{ start: 0, end: 2, html: 'x' }] },
    { notes: [{ id: 'n', text: 'x', start: 0, end: 99999 }] },
    { bookmark: 'x'.repeat(121) },
    { alternates: Array.from({ length: 17 }, (_, i) => ({ id: String(i), text: 'x' })) },
    { structure: [{ id: 's', title: 'Act', level: 9 }] },
  ])('rejects invalid or excessive metadata %#', (patch) => {
    expect(scriptMetadataError({ ...line(), ...patch } as ScriptLine)).not.toBeNull();
  });
});
