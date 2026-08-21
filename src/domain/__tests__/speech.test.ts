import { describe, expect, it } from 'vitest';
import { normalizeSpeechCues, speechCueAtBeat, wrapSpeechText } from '../plan';

describe('actor speech cues', () => {
  const cues = [
    { id: 'speech-1', beat: 1, text: 'We need to leave.' },
    { id: 'speech-3', beat: 3, text: 'Now.' },
  ];

  it('selects speech at the nearest playback beat', () => {
    expect(speechCueAtBeat(cues, 1.2)?.text).toBe('We need to leave.');
    expect(speechCueAtBeat(cues, 2.6)?.text).toBe('Now.');
    expect(speechCueAtBeat(cues, 2)).toBeUndefined();
  });

  it('wraps bubble text into bounded readable lines', () => {
    const lines = wrapSpeechText('This line should wrap cleanly between complete words.', 18, 3);
    expect(lines.length).toBeLessThanOrEqual(3);
    expect(lines[lines.length - 1].endsWith('…')).toBe(true);
  });

  it('normalizes invalid and duplicate beat entries deterministically', () => {
    expect(normalizeSpeechCues([
      { id: 'b', beat: 2, text: 'Second duplicate' },
      { id: 'a', beat: 2.2, text: 'First stable cue' },
      { id: 'blank', beat: 3, text: '  ' },
      { id: 'bad', beat: 0, text: 'Invalid' },
    ])).toEqual([{ id: 'a', beat: 2, text: 'First stable cue' }]);
  });
});
