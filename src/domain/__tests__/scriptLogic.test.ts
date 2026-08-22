import { describe, it, expect } from 'vitest';
import {
  buildCharacterCatalog,
  collectCharacterDialogue,
  deriveScriptBreakdown,
  mergeCharacterCatalogs,
  mergeCharacters,
  normalizeCharacterName,
  parseSceneHeading,
  replaceSceneHeadingLocation,
  sceneHeadingLocationQuery,
  suggestCharacters,
  suggestLocations,
} from '../script/logic';
import type { Character } from '../script/types';
import type { ScriptBreakdownLine } from '../script/logic';

describe('normalizeCharacterName', () => {
  it('uppercases and trims a plain name', () => {
    expect(normalizeCharacterName('  john ')).toEqual({ canonicalName: 'JOHN' });
  });

  it('extracts V.O. extension case-insensitively', () => {
    const result = normalizeCharacterName('John (v.o.)');
    expect(result.canonicalName).toBe('JOHN');
    expect(result.extension).toBe('V.O.');
  });

  it('extracts O.S. and CONT’D extensions', () => {
    expect(normalizeCharacterName("JANE (O.S.)")).toEqual({
      canonicalName: 'JANE',
      extension: 'O.S.',
    });
    expect(normalizeCharacterName("JANE (CONT'D)")).toEqual({
      canonicalName: 'JANE',
      extension: "CONT'D",
    });
  });

  it('keeps JR. suffix in the canonical name', () => {
    expect(normalizeCharacterName('JOHN JR.')).toEqual({ canonicalName: 'JOHN JR.' });
  });

  it('leaves unknown parenthesized content in the canonical name', () => {
    expect(normalizeCharacterName('JOHN (SINGING)')).toEqual({
      canonicalName: 'JOHN (SINGING)',
    });
  });

  it('collapses internal whitespace', () => {
    expect(normalizeCharacterName('MARY   JANE')).toEqual({ canonicalName: 'MARY JANE' });
  });

  it('returns empty canonical name for empty input', () => {
    expect(normalizeCharacterName('   ')).toEqual({ canonicalName: '' });
  });
});

describe('buildCharacterCatalog', () => {
  it('collects typed character cues and merges by canonical name with aliases', () => {
    const catalog = buildCharacterCatalog([
      { text: 'INT. LOFT - NIGHT', type: 'scene' },
      { text: 'JENNA', type: 'character' },
      { text: 'Stop it, Reggie!', type: 'dialogue' },
      { text: 'JENNA (V.O.)', type: 'character' },
      { text: 'Later...', type: 'dialogue' },
    ]);
    expect(catalog).toHaveLength(1);
    expect(catalog[0].canonicalName).toBe('JENNA');
    expect(catalog[0].aliases).toContain('JENNA (V.O.)');
  });

  it('accepts untyped cue lines only when followed by dialogue', () => {
    const catalog = buildCharacterCatalog([
      { text: 'REGGIE' },
      { text: "I can't.", type: 'dialogue' },
    ]);
    expect(catalog).toHaveLength(1);
    expect(catalog[0].canonicalName).toBe('REGGIE');
  });

  it('rejects untyped uppercase lines not preceding dialogue', () => {
    const catalog = buildCharacterCatalog([
      { text: 'THE END' },
      { text: 'A car drives past.', type: 'action' },
    ]);
    expect(catalog).toHaveLength(0);
  });

  it('never treats sluglines as character cues', () => {
    const catalog = buildCharacterCatalog([
      { text: 'INT. LOFT - NIGHT', type: 'scene' },
      { text: 'They stare.', type: 'dialogue' },
    ]);
    expect(catalog).toHaveLength(0);
  });

  it('keeps suffix abbreviations like JOHN JR. as distinct characters', () => {
    const catalog = buildCharacterCatalog([
      { text: 'JOHN', type: 'character' },
      { text: 'Hello.', type: 'dialogue' },
      { text: 'JOHN JR.', type: 'character' },
      { text: 'Hi dad.', type: 'dialogue' },
    ]);
    const names = catalog.map((c) => c.canonicalName).sort();
    expect(names).toEqual(['JOHN', 'JOHN JR.']);
  });

  it('produces unique ids across the catalog', () => {
    const catalog = buildCharacterCatalog([
      { text: 'A', type: 'character' },
      { text: 'Line.', type: 'dialogue' },
      { text: 'B', type: 'character' },
      { text: 'Line.', type: 'dialogue' },
    ]);
    const ids = new Set(catalog.map((c) => c.id));
    expect(ids.size).toBe(catalog.length);
  });

  it('returns an empty catalog for empty input', () => {
    expect(buildCharacterCatalog([])).toEqual([]);
  });
});

describe('parseSceneHeading', () => {
  it('parses INT with location, sub-location and time of day', () => {
    expect(parseSceneHeading("INT. JOHN'S APARTMENT - KITCHEN - NIGHT")).toEqual({
      intExt: 'INT',
      location: "JOHN'S APARTMENT",
      subLocation: 'KITCHEN',
      timeOfDay: 'NIGHT',
    });
  });

  it('parses EXT headings', () => {
    expect(parseSceneHeading('EXT. STREET - DAY')).toEqual({
      intExt: 'EXT',
      location: 'STREET',
      timeOfDay: 'DAY',
    });
  });

  it('parses I/E variants as INT_EXT', () => {
    expect(parseSceneHeading('INT./EXT. GARAGE - DUSK').intExt).toBe('INT_EXT');
    expect(parseSceneHeading('I/E GARAGE - DUSK').intExt).toBe('INT_EXT');
  });

  it('maps EST to OTHER', () => {
    expect(parseSceneHeading('EST. HILLSIDE - SUNSET').intExt).toBe('OTHER');
  });

  it('keeps unknown final segments out of timeOfDay', () => {
    const result = parseSceneHeading('INT. OFFICE - MEETING ROOM');
    expect(result.location).toBe('OFFICE');
    expect(result.subLocation).toBe('MEETING ROOM');
    expect(result.timeOfDay).toBeUndefined();
  });

  it('handles heading without sub-location or time', () => {
    expect(parseSceneHeading('INT. VAULT')).toEqual({ intExt: 'INT', location: 'VAULT' });
  });

  it('strips fountain scene numbers', () => {
    expect(parseSceneHeading('INT. LOFT - NIGHT #8A#')).toEqual({
      intExt: 'INT',
      location: 'LOFT',
      timeOfDay: 'NIGHT',
    });
  });

  it('returns an almost-empty result for unrecognized patterns', () => {
    expect(parseSceneHeading('A CAR DRIVES PAST')).toEqual({});
    expect(parseSceneHeading('')).toEqual({});
    expect(parseSceneHeading('INT.')).toEqual({ intExt: 'INT' });
  });
});

describe('scene heading autocomplete', () => {
  it('extracts the location query from a partial slugline', () => {
    expect(sceneHeadingLocationQuery('INT. HAR')).toBe('HAR');
    expect(sceneHeadingLocationQuery('EXT. HARBOR - NIGHT')).toBe('HARBOR');
  });

  it('replaces only the location and preserves slugline context', () => {
    expect(replaceSceneHeadingLocation('INT. OLD PLACE - KITCHEN - NIGHT', 'Harbor House'))
      .toBe('INT. HARBOR HOUSE - KITCHEN - NIGHT');
    expect(replaceSceneHeadingLocation('EXT. HAR', 'Harbor Warehouse'))
      .toBe('EXT. HARBOR WAREHOUSE');
  });
});

const makeCharacter = (id: string, canonicalName: string, aliases: string[] = []): Character => ({
  id,
  canonicalName,
  aliases,
});

describe('suggestCharacters', () => {
  const catalog = [
    makeCharacter('char-1', 'JENNA'),
    makeCharacter('char-2', 'JOHN JR.'),
    makeCharacter('char-3', 'REGGIE', ['REGGIE (V.O.)']),
  ];

  it('matches by prefix on canonical name', () => {
    expect(suggestCharacters(catalog, 'jen')).toEqual([catalog[0]]);
  });

  it('matches aliases too', () => {
    expect(suggestCharacters(catalog, 'reggie (v')).toEqual([catalog[2]]);
  });

  it('is case-insensitive', () => {
    expect(suggestCharacters(catalog, 'joHN jr')).toEqual([catalog[1]]);
  });

  it('falls back to fuzzy subsequence matching', () => {
    expect(suggestCharacters(catalog, 'jna')).toEqual([catalog[0]]);
  });

  it('ranks prefix above substring deterministically', () => {
    const richer = [
      makeCharacter('char-a', 'JOHNSON'),
      makeCharacter('char-b', 'MAJOR JOHN'),
      makeCharacter('char-c', 'JOHN'),
    ];
    const result = suggestCharacters(richer, 'john');
    expect(result[0]).toBe(richer[2]);
    // Ties broken alphabetically by canonical name.
    expect(result.slice(1).map((c) => c.canonicalName)).toEqual(['JOHNSON', 'MAJOR JOHN']);
  });

  it('respects limit', () => {
    const many = ['A', 'B', 'C'].map((n, i) => makeCharacter(`char-${i}`, n));
    expect(suggestCharacters(many, '', 2)).toEqual([]);
    expect(suggestCharacters(many, 'a', 2)).toHaveLength(1);
    const manyB = ['BA', 'BB', 'BC'].map((n, i) => makeCharacter(`char-${i}`, n));
    expect(suggestCharacters(manyB, 'b', 2)).toHaveLength(2);
  });

  it('returns nothing for blank queries', () => {
    expect(suggestCharacters(catalog, '   ')).toEqual([]);
  });
});

describe('suggestLocations', () => {
  const locations = [
    { name: 'Loft' },
    { name: 'Studio', aliases: ['Stage 4'] },
    { name: 'Harbor Warehouse' },
  ];

  it('matches names and aliases case-insensitively', () => {
    expect(suggestLocations(locations, 'lof')[0].name).toBe('Loft');
    expect(suggestLocations(locations, 'stage')[0].name).toBe('Studio');
  });

  it('supports fuzzy matching', () => {
    expect(suggestLocations(locations, 'habor')[0].name).toBe('Harbor Warehouse');
  });

  it('is deterministic and respects limit', () => {
    const many = ['BA', 'BB', 'BC'].map((name) => ({ name }));
    expect(suggestLocations(many, 'b', 2)).toHaveLength(2);
    expect(suggestLocations(many, 'b', 2).map((l) => l.name)).toEqual(['BA', 'BB']);
  });

  it('returns nothing for blank queries', () => {
    expect(suggestLocations(locations, '')).toEqual([]);
  });
});

describe('mergeCharacters', () => {
  const catalog = [
    makeCharacter('char-a', 'JENNA', ['JENNA (V.O.)']),
    makeCharacter('char-b', 'JOHN'),
    makeCharacter('char-c', 'JENNIFER', ['JENNA (O.S.)']),
  ];

  it('merges aliases and duplicate canonical name into primary', () => {
    const result = mergeCharacters(catalog, 'char-a', 'char-c');
    expect(result.catalog).toHaveLength(2);
    const primary = result.catalog.find((c) => c.id === 'char-a');
    expect(primary?.canonicalName).toBe('JENNA');
    expect(primary?.aliases).toEqual(['JENNA (V.O.)', 'JENNA (O.S.)', 'JENNIFER']);
    expect(result.catalog.find((c) => c.id === 'char-c')).toBeUndefined();
  });

  it('remaps the duplicate id to the primary id and leaves others alone', () => {
    const { remap } = mergeCharacters(catalog, 'char-a', 'char-c');
    expect(remap('char-c')).toBe('char-a');
    expect(remap('char-b')).toBe('char-b');
    expect(remap('char-a')).toBe('char-a');
  });

  it('does not mutate the input catalog', () => {
    const snapshot = JSON.stringify(catalog);
    mergeCharacters(catalog, 'char-a', 'char-c');
    expect(JSON.stringify(catalog)).toBe(snapshot);
  });

  it('deduplicates aliases case-insensitively and deterministically', () => {
    const dupes = [
      makeCharacter('char-x', 'SAM', ['sammy']),
      makeCharacter('char-y', 'SAMUEL', ['Sammy', 'SAMMY']),
    ];
    const result = mergeCharacters(dupes, 'char-x', 'char-y');
    expect(result.catalog[0].aliases).toEqual(['sammy', 'SAMUEL']);
  });

  it('is a no-op when ids are equal or missing', () => {
    const noop = mergeCharacters(catalog, 'char-a', 'char-a');
    expect(noop.catalog).toBe(catalog);
    expect(noop.remap('char-c')).toBe('char-c');
    const missing = mergeCharacters(catalog, 'nope', 'char-c');
    expect(missing.catalog).toBe(catalog);
  });
});

describe('live script breakdown', () => {
  it('preserves canonical project character ids and links aliases in scenes', () => {
    const canonical = [makeCharacter('char-jane', 'JANE DOE', ['JANE'])];
    const merged = mergeCharacterCatalogs(canonical, [makeCharacter('found', 'JANE')]);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('char-jane');

    const result = deriveScriptBreakdown([
      { id: 'line-scene-1', text: 'INT. STUDIO - DAY', type: 'scene', sceneNumber: '12' },
      { id: 'line-char-1', text: 'JANE', type: 'character' },
      { id: 'line-dialogue-1', text: 'Ready.', type: 'dialogue' },
    ], canonical);
    expect(result.scenes[0].sceneNumber).toBe('12');
    expect(result.scenes[0].characterIds).toEqual(['char-jane']);
  });

  it('links a script location through a canonical alias and groups its scenes', () => {
    const result = deriveScriptBreakdown([
      { id: 'scene-a', text: 'EXT. STAGE FOUR - DAY', type: 'scene', sceneNumber: '2' },
      { id: 'scene-b', text: 'INT. STAGE FOUR - NIGHT', type: 'scene', sceneNumber: '8' },
    ], [], [{
      id: 'loc-stage-4',
      name: 'Studio Babelsberg Stage 4',
      aliases: ['Stage Four'],
      type: 'stage',
      referenceAssetIds: [],
    }]);
    expect(result.locations).toHaveLength(1);
    expect(result.locations[0].locationId).toBe('loc-stage-4');
    expect(result.locations[0].scenes.map((scene) => scene.sceneNumber)).toEqual(['2', '8']);
  });

  it('keeps the screenplay optional', () => {
    expect(deriveScriptBreakdown([], [], [])).toEqual({ characters: [], scenes: [], locations: [] });
  });
});

describe('collectCharacterDialogue', () => {
  const lines = (rows: Array<[string, string | undefined]>): ScriptBreakdownLine[] =>
    rows.map(([text, type], index) => ({
      id: `line-${index + 1}`,
      text,
      ...(type !== undefined ? { type } : {}),
    }));

  it('collects dialogue lines for one character in script order', () => {
    const script = lines([
      ['INT. ROOM - NIGHT', 'scene'],
      ['DETECTIVE', 'character'],
      ['Where were you last night?', 'dialogue'],
      ['(leaning in)', 'parenthetical'],
      ['Answer carefully.', 'dialogue'],
      ['SUSPECT', 'character'],
      ['I was home.', 'dialogue'],
      ['DETECTIVE', 'character'],
      ['That is not what the logs say.', 'dialogue'],
    ]);
    const result = collectCharacterDialogue(script, 'DETECTIVE');
    expect(result.map((entry) => entry.text)).toEqual([
      'Where were you last night?',
      'Answer carefully.',
      'That is not what the logs say.',
    ]);
    expect(result[0].lineId).toBe('line-3');
    expect(result[0].sceneNumber).toBeUndefined();
  });

  it('matches aliases and reports the enclosing scene number', () => {
    const script: ScriptBreakdownLine[] = [
      { id: 's1', text: 'INT. A - NIGHT', type: 'scene', sceneNumber: '3' },
      { id: 'c1', text: 'HALLORAN (V.O.)', type: 'character' },
      { id: 'd1', text: 'Freeze.', type: 'dialogue' },
      { id: 'c2', text: 'JOHN', type: 'character' },
      { id: 'd2', text: 'Never.', type: 'dialogue' },
      { id: 's2', text: 'INT. B - DAY', type: 'scene', sceneNumber: '4', omitted: true },
      { id: 'c3', text: 'HALLORAN', type: 'character' },
      { id: 'd3', text: 'Cut.', type: 'dialogue' },
    ];
    const result = collectCharacterDialogue(script, 'DETECTIVE', ['Halloran']);
    expect(result.map((entry) => entry.text)).toEqual(['Freeze.']);
    expect(result[0].sceneNumber).toBe('3');
  });

  it('stops at action lines and ignores other characters entirely', () => {
    const script = lines([
      ['SARAH', 'character'],
      ['Hello?', 'dialogue'],
      ['She crosses to the window.', 'action'],
      ['Still nothing.', 'dialogue'],
      ['JOHN', 'character'],
      ['Hey.', 'dialogue'],
    ]);
    expect(collectCharacterDialogue(script, 'SARAH').map((entry) => entry.text)).toEqual([
      'Hello?',
    ]);
    expect(collectCharacterDialogue(script, 'NOBODY')).toEqual([]);
    expect(collectCharacterDialogue(script, '')).toEqual([]);
  });

  it('skips blank and untyped filler lines without ending the speech run', () => {
    const script = lines([
      ['SARAH', 'character'],
      ['Line one.', 'dialogue'],
      ['', undefined],
      ['   ', undefined],
      ['Line two.', 'dialogue'],
    ]);
    expect(collectCharacterDialogue(script, 'SARAH').map((entry) => entry.text)).toEqual([
      'Line one.',
      'Line two.',
    ]);
  });
});
