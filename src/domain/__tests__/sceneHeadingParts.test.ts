import { describe, expect, it } from 'vitest';
import {
  composeSceneHeading,
  customTimesIn,
  headingFromBodyInput,
  isTimeOfDay,
  splitCue,
  splitSceneHeading,
  toggleCueExtension,
  withHeadingLocation,
} from '../script/sceneHeadingParts';

describe('splitSceneHeading', () => {
  it('splits prefix, set and time, keeping EXT./INT. distinct', () => {
    expect(splitSceneHeading("INT. JOHN'S APARTMENT - KITCHEN - NIGHT")).toEqual({ prefix: 'INT.', body: "JOHN'S APARTMENT - KITCHEN", time: 'NIGHT' });
    expect(splitSceneHeading('EXT/INT car - day')).toEqual({ prefix: 'EXT./INT.', body: 'car', time: 'DAY' });
    expect(splitSceneHeading('int./ext. Porch - Magic Hour')).toEqual({ prefix: 'INT./EXT.', body: 'Porch', time: 'MAGIC HOUR' });
    expect(splitSceneHeading('I/E. TRUCK - LATE AFTERNOON')).toEqual({ prefix: 'I/E.', body: 'TRUCK', time: 'LATE AFTERNOON' });
  });

  it('leaves a non-time last segment in the set and handles no prefix', () => {
    expect(splitSceneHeading('INT. HOUSE - BASEMENT')).toEqual({ prefix: 'INT.', body: 'HOUSE - BASEMENT', time: '' });
    expect(splitSceneHeading('MONTAGE')).toEqual({ prefix: '', body: 'MONTAGE', time: '' });
    expect(splitSceneHeading('')).toEqual({ prefix: '', body: '', time: '' });
  });

  it('composes back, and round-trips', () => {
    const text = 'EXT./INT. CAR - MOVING - NIGHT';
    expect(composeSceneHeading(splitSceneHeading(text))).toBe(text);
    expect(composeSceneHeading({ prefix: 'EXT.', body: 'STREET', time: '' })).toBe('EXT. STREET');
  });

  it('takes up a prefix or time typed into the set field', () => {
    const current = { prefix: 'INT.', body: '', time: 'DAY' };
    expect(headingFromBodyInput(current, 'living ')).toMatchObject({ text: 'INT. living - DAY', body: 'living ' });
    expect(headingFromBodyInput(current, 'EXT. STREET - NIGHT', { complete: true })).toMatchObject({ text: 'EXT. STREET - NIGHT', body: 'STREET' });
  });

  it('does not snatch a prefix or time from a word still being typed', () => {
    const current = { prefix: 'INT.', body: '', time: 'NIGHT' };
    expect(headingFromBodyInput(current, 'EXT').text).toBe('INT. EXT - NIGHT');
    expect(headingFromBodyInput(current, 'EXTRA ROOM').text).toBe('INT. EXTRA ROOM - NIGHT');
    expect(headingFromBodyInput(current, 'EXT. ').text).toBe('EXT. - NIGHT');
    expect(headingFromBodyInput(current, 'HOSPITAL - DAY').text).toBe('INT. HOSPITAL - DAY - NIGHT');
    expect(headingFromBodyInput(current, 'HOSPITAL - DAY ROOM', { complete: true }).text).toBe('INT. HOSPITAL - DAY ROOM - NIGHT');
    expect(headingFromBodyInput(current, 'HOSPITAL - DAWN', { complete: true }).text).toBe('INT. HOSPITAL - DAWN');
  });

  it('replaces the location but keeps sub-locations', () => {
    expect(withHeadingLocation('EXT./INT. CAR - BACK SEAT - NIGHT', 'taxi')).toBe('EXT./INT. TAXI - BACK SEAT - NIGHT');
  });

  it('recognises times and lists the script’s own', () => {
    expect(isTimeOfDay('moments later')).toBe(true);
    expect(isTimeOfDay('KITCHEN')).toBe(false);
    expect(customTimesIn(['INT. A - DAY', 'EXT. B - LATE AFTERNOON', 'INT. C - EARLY MORNING'])).toEqual(['EARLY MORNING', 'LATE AFTERNOON']);
  });
});

describe('character cue extensions', () => {
  it('splits and toggles extensions', () => {
    expect(splitCue("ALEX (V.O.) (cont'd)")).toEqual({ name: 'ALEX', extensions: ['V.O.', "CONT'D"] });
    expect(toggleCueExtension('ALEX', 'V.O.')).toBe('ALEX (V.O.)');
    expect(toggleCueExtension('ALEX (V.O.)', 'V.O.')).toBe('ALEX');
    expect(toggleCueExtension("ALEX (V.O.)", "CONT'D")).toBe("ALEX (V.O.) (CONT'D)");
  });
});

describe('keyboard suggestions', () => {
  it('matches presets by what was typed', async () => {
    const { matchingPresets, TRANSITIONS } = await import('../script/sceneHeadingParts');
    expect(matchingPresets(TRANSITIONS, '')).toHaveLength(TRANSITIONS.length);
    expect(matchingPresets(TRANSITIONS, 'cut')).toEqual(['CUT TO:', 'SMASH CUT TO:', 'MATCH CUT TO:', 'JUMP CUT TO:', 'INTERCUT WITH:', 'TIME CUT:']);
    expect(matchingPresets(TRANSITIONS, 'CUT TO:')).not.toContain('CUT TO:');
  });

  it('completes a cue extension being typed', async () => {
    const { completeCueExtension, cueExtensionQuery } = await import('../script/sceneHeadingParts');
    expect(cueExtensionQuery('ALEX (v')).toBe('v');
    expect(cueExtensionQuery('ALEX (V.O.)')).toBeNull();
    expect(completeCueExtension('ALEX (v', 'V.O.')).toBe('ALEX (V.O.)');
    expect(completeCueExtension("ALEX (V.O.) (c", "CONT'D")).toBe("ALEX (V.O.) (CONT'D)");
  });

  it('reads the time being typed after the set', async () => {
    const { typedTimeQuery, withoutTypedTime } = await import('../script/sceneHeadingParts');
    expect(typedTimeQuery('LIVING ROOM - DU')).toBe('DU');
    expect(typedTimeQuery('LIVING ROOM - ')).toBe('');
    expect(typedTimeQuery('LIVING ROOM')).toBeNull();
    expect(withoutTypedTime('LIVING ROOM - DU')).toBe('LIVING ROOM');
  });

  it('cycles values with wrap-around', async () => {
    const { cycleValue } = await import('../script/sceneHeadingParts');
    expect(cycleValue(['a', 'b', 'c'], 'c', 1)).toBe('a');
    expect(cycleValue(['a', 'b', 'c'], 'a', -1)).toBe('c');
    expect(cycleValue(['a', 'b'], 'x', 1)).toBe('a');
  });
});
