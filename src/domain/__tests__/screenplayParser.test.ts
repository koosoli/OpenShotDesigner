import { describe, expect, it } from 'vitest';
import {
  formatParenthetical,
  parseScreenplay,
  parseScreenplayText,
  sceneNumberForLine,
  serializeToFountain,
} from '../../components/script/screenplayParser';

/** Compact view of the classification, which is what these tests are about. */
const typed = (raw: string): Array<[string, string]> =>
  parseScreenplayText(raw).map((element) => [element.type, element.text]);

describe('scene headings', () => {
  it('recognises the standard prefixes', () => {
    for (const heading of [
      'INT. LOFT - NIGHT',
      'EXT. STREET - DAY',
      'EST. CITY - DAWN',
      'INT./EXT. CAR - NIGHT',
      'I/E. CAR - NIGHT',
    ]) {
      expect(typed(heading)[0][0]).toBe('scene');
    }
  });

  it('upper-cases a lower-case slugline', () => {
    expect(typed('int. loft - night')).toEqual([['scene', 'INT. LOFT - NIGHT']]);
  });

  it('reads a production-draft number from both sides and strips it', () => {
    const [element] = parseScreenplayText('8   INT. LOFT - NIGHT   8');
    expect(element.type).toBe('scene');
    expect(element.text).toBe('INT. LOFT - NIGHT');
    expect(element.sceneNumber).toBe('8');
  });

  it('reads a Fountain forced scene number', () => {
    const [element] = parseScreenplayText('INT. LOFT - NIGHT #8A#');
    expect(element.sceneNumber).toBe('8A');
    expect(element.text).toBe('INT. LOFT - NIGHT');
  });

  it('honours a forced "." slugline that does not start with INT/EXT', () => {
    const [element] = parseScreenplayText('.BLACK SCREEN');
    expect(element.type).toBe('scene');
    expect(element.text).toBe('BLACK SCREEN');
  });

  it('does not treat an ellipsis as a forced slugline', () => {
    expect(typed('..and then it was over')[0][0]).not.toBe('scene');
  });

  it('carries the scene number onto the lines that follow', () => {
    const elements = parseScreenplayText(['8   INT. LOFT - NIGHT   8', '', 'She waits.'].join('\n'));
    expect(elements[1].sceneNumber).toBe('8');
  });
});

describe('character cues and dialogue', () => {
  const scene = 'INT. LOFT - NIGHT\n\n';

  it('classifies a plain cue followed by dialogue', () => {
    expect(typed(`${scene}JENNA\nI told you already.`)).toEqual([
      ['scene', 'INT. LOFT - NIGHT'],
      ['character', 'JENNA'],
      ['dialogue', 'I told you already.'],
    ]);
  });

  it('keeps a cue with ANY bracketed extension as a cue', () => {
    // Regression: only a whitelist of extensions was accepted, so a cue with
    // any other direction became action — and took its dialogue, and the
    // character's entire presence in the breakdown, with it.
    for (const cue of [
      'JENNA (V.O.)',
      'JENNA (O.S.)',
      "JENNA (CONT'D)",
      'JENNA (WHISPERING)',
      'DISPATCHER (INTO RADIO)',
      'MARIA (IN SPANISH)',
      'NEWSREADER (ON TV)',
      "JENNA (CONT'D, O.S.)",
    ]) {
      const elements = parseScreenplayText(`${scene}${cue}\nSomething.`);
      expect(elements[1].type, cue).toBe('character');
      expect(elements[2].type, `${cue} -> dialogue`).toBe('dialogue');
    }
  });

  it('reads a parenthetical between the cue and the dialogue', () => {
    expect(typed(`${scene}JENNA\n(quietly)\nI told you.`)).toEqual([
      ['scene', 'INT. LOFT - NIGHT'],
      ['character', 'JENNA'],
      ['parenthetical', '(quietly)'],
      ['dialogue', 'I told you.'],
    ]);
  });

  it('does not read a leading parenthetical as a parenthetical outside dialogue', () => {
    expect(typed(`${scene}(A beat.)`)[1][0]).toBe('action');
  });

  it('treats a blank line as the end of a dialogue block', () => {
    const elements = typed(`${scene}JENNA\nFirst.\n\nShe leaves.`);
    expect(elements[elements.length - 1]).toEqual(['action', 'She leaves.']);
  });

  it('honours the Fountain @ force for a lower-case name', () => {
    expect(typed(`${scene}@McCLANE\nYippee.`)).toEqual([
      ['scene', 'INT. LOFT - NIGHT'],
      ['character', 'McCLANE'],
      ['dialogue', 'Yippee.'],
    ]);
  });

  it('does not turn two consecutive cue-looking lines into two cues', () => {
    // The second upper-case line is dialogue (shouting), not another cue.
    const elements = typed(`${scene}JENNA\nGET OUT`);
    expect(elements[2]).toEqual(['dialogue', 'GET OUT']);
  });
});

describe('all-caps action', () => {
  it('keeps an all-caps sentence as action, not a cue', () => {
    // A cue never ends in a full stop, which is what separates these.
    const elements = typed('INT. LOFT - NIGHT\n\nTHE DOOR SLAMS SHUT.');
    expect(elements[1][0]).toBe('action');
  });

  it('honours the Fountain ! force for an all-caps action line', () => {
    expect(typed('INT. LOFT - NIGHT\n\n!THE DOOR SLAMS')).toEqual([
      ['scene', 'INT. LOFT - NIGHT'],
      ['action', 'THE DOOR SLAMS'],
    ]);
  });
});

describe('transitions, shots and notes', () => {
  it('recognises standard transitions', () => {
    for (const transition of ['CUT TO:', 'DISSOLVE TO:', 'FADE OUT.', 'SMASH CUT TO:']) {
      expect(typed(transition)[0][0], transition).toBe('transition');
    }
  });

  it('recognises a forced > transition and strips the marker', () => {
    expect(typed('> BURN TO WHITE <')).toEqual([['transition', 'BURN TO WHITE']]);
  });

  it('recognises shot lines', () => {
    for (const shot of ['ANGLE ON THE DOOR', 'CLOSE ON HER HANDS', 'POV - THE STREET']) {
      expect(typed(shot)[0][0], shot).toBe('shot');
    }
  });

  it('reads a note and strips its brackets', () => {
    expect(typed('[[check the date]]')).toEqual([['note', 'check the date']]);
  });
});

describe('noise the parser must drop', () => {
  it('drops page numbers and CONTINUED markers', () => {
    const elements = typed(['12.', '(CONTINUED)', "CONT'D", 'INT. LOFT - NIGHT'].join('\n'));
    expect(elements).toEqual([['scene', 'INT. LOFT - NIGHT']]);
  });

  it('drops a title page block', () => {
    const elements = typed(
      ['Title: The Long Walk', 'Author: Someone', '', 'INT. LOFT - NIGHT', '', 'She waits.'].join('\n'),
    );
    expect(elements[0]).toEqual(['scene', 'INT. LOFT - NIGHT']);
  });

  it('strips Fountain emphasis markers', () => {
    expect(typed('INT. LOFT - NIGHT\n\nShe is *very* **tired** and _done_.')[1][1]).toBe(
      'She is very tired and done.',
    );
  });
});

describe('omitted scenes', () => {
  it('marks a scene omitted from the [[OMITTED]] note that follows it', () => {
    const elements = parseScreenplayText('12  INT. LOFT - NIGHT  12\n[[OMITTED]]');
    expect(elements).toHaveLength(1);
    expect(elements[0].omitted).toBe(true);
  });

  it('ignores an OMITTED note that does not follow a slugline', () => {
    const elements = parseScreenplayText('She waits.\nOMITTED');
    expect(elements.some((element) => element.omitted)).toBe(false);
  });
});

describe('parseScreenplay', () => {
  const source = ['8   INT. LOFT - NIGHT   8', '', 'JENNA', '(quietly)', 'I told you.'].join('\n');

  it('gives every line a unique id', () => {
    const lines = parseScreenplay(source);
    const ids = lines.map((line) => line.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives ids that stay unique across two parses in the same millisecond', () => {
    const first = parseScreenplay(source).map((line) => line.id);
    const second = parseScreenplay(source).map((line) => line.id);
    expect(new Set([...first, ...second]).size).toBe(first.length + second.length);
  });

  it('resolves the scene number for any line in the scene', () => {
    const lines = parseScreenplay(source);
    const dialogue = lines.find((line) => line.type === 'dialogue')!;
    expect(sceneNumberForLine(lines, dialogue.id)).toBe('8');
  });

  it('returns nothing for an id that is not in the script', () => {
    expect(sceneNumberForLine(parseScreenplay(source), 'nope')).toBeUndefined();
  });

  it('returns an empty list for empty input', () => {
    expect(parseScreenplay('')).toEqual([]);
    expect(parseScreenplay('   \n\n  ')).toEqual([]);
  });
});

describe('formatParenthetical', () => {
  it('wraps bare text in brackets and leaves wrapped text alone', () => {
    expect(formatParenthetical('quietly')).toBe('(quietly)');
    expect(formatParenthetical('(quietly)')).toBe('(quietly)');
  });
});

describe('Fountain round trip', () => {
  it('re-parses its own output to the same classification', () => {
    const source = [
      'INT. LOFT - NIGHT',
      '',
      'She waits by the window.',
      '',
      'JENNA',
      '(quietly)',
      'I told you already.',
      '',
      'CUT TO:',
    ].join('\n');

    const first = parseScreenplay(source);
    const fountain = serializeToFountain(first, 'Test');
    const second = parseScreenplay(fountain);

    expect(second.map((line) => [line.type, line.text])).toEqual(
      first.map((line) => [line.type, line.text]),
    );
  });

  it('round-trips an omitted scene', () => {
    const lines = parseScreenplay('12  INT. LOFT - NIGHT  12\n[[OMITTED]]');
    const reparsed = parseScreenplay(serializeToFountain(lines));
    expect(reparsed[0].omitted).toBe(true);
  });
});
