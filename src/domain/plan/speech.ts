import type { ActorSpeechCue } from '../../types';

/** The cue active at the nearest timeline beat. Duplicate beats resolve deterministically. */
export const speechCueAtBeat = (
  cues: ActorSpeechCue[] | undefined,
  currentBeat: number,
): ActorSpeechCue | undefined => {
  const beat = Math.max(1, Math.round(currentBeat));
  return [...(cues || [])]
    .filter((cue) => cue.beat === beat && cue.text.trim().length > 0)
    .sort((a, b) => a.id.localeCompare(b.id))[0];
};

/** Wrap bubble copy without splitting words unless one word exceeds the limit. */
export const wrapSpeechText = (text: string, maxCharacters = 28, maxLines = 4): string[] => {
  const normalized = text.trim().replace(/\s+/g, ' ');
  const words = normalized.split(' ').filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let line = '';
  let wordIndex = 0;
  for (; wordIndex < words.length; wordIndex += 1) {
    const word = words[wordIndex];
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= maxCharacters || !line) {
      line = candidate;
      continue;
    }
    lines.push(line);
    line = word;
    if (lines.length === maxLines - 1) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (wordIndex < words.length - 1 && lines.length > 0) {
    const last = lines.length - 1;
    lines[last] = `${lines[last].slice(0, Math.max(1, maxCharacters - 1)).trimEnd()}…`;
  }
  return lines;
};

/** Sort and keep one cue per beat, favoring the first stable id. */
export const normalizeSpeechCues = (cues: ActorSpeechCue[]): ActorSpeechCue[] => {
  const byBeat = new Map<number, ActorSpeechCue>();
  [...cues]
    .filter((cue) => Number.isFinite(cue.beat) && cue.beat >= 1 && cue.text.trim())
    .map((cue) => ({ ...cue, beat: Math.round(cue.beat) }))
    .sort((a, b) => a.beat - b.beat || a.id.localeCompare(b.id))
    .forEach((cue) => {
      if (!byBeat.has(cue.beat)) byBeat.set(cue.beat, { ...cue, text: cue.text.trim() });
    });
  return Array.from(byBeat.values());
};
