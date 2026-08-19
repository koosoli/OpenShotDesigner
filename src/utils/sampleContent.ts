import { ScriptLine, ScriptMark } from '../types';
import { SAMPLE_SCREENPLAY } from '../constants/presets';
import { parseScreenplay } from '../components/script/screenplayParser';

/**
 * The screenplay that ships with the example scenes, and the linings that tie
 * it to their shots. Ranges are found by their text rather than by line number,
 * so editing the sample screenplay can never silently mis-line it.
 */

export const parseSampleScreenplay = (): ScriptLine[] =>
  parseScreenplay(SAMPLE_SCREENPLAY, 'Sample scene.fountain');

interface SampleLining {
  /** Template setup this lining belongs to. */
  templateId: string;
  /** Shot id as it appears in SAMPLE_SCENES. */
  shotId: string;
  from: string;
  to: string;
  label: string;
  description: string;
  color: string;
}

const SAMPLE_LININGS: SampleLining[] = [
  {
    templateId: 'setup-dialogue-classic',
    shotId: 'shot-1a',
    from: 'Rain on the window',
    to: 'She leaves.',
    label: '1/1',
    description: 'Master',
    color: '#0284c7',
  },
  {
    templateId: 'setup-dialogue-classic',
    shotId: 'shot-1b',
    from: 'You want to tell me',
    to: 'walk out of a building',
    label: '1/2',
    description: 'OTS Alex',
    color: '#dc2626',
  },
  {
    templateId: 'setup-dialogue-classic',
    shotId: 'shot-1c',
    from: "I don't know what",
    to: 'Ask your brother',
    label: '1/3',
    description: 'OTS Sarah, push in',
    color: '#16a34a',
  },
  {
    templateId: 'setup-noir-interrogation',
    shotId: 'shot-2a',
    from: 'I was having a smoke',
    to: 'Marcus says nothing',
    label: '2/1',
    description: 'CU Marcus',
    color: '#0284c7',
  },
  {
    templateId: 'setup-noir-interrogation',
    shotId: 'shot-2b',
    from: 'Miller stands',
    to: 'holding the door',
    label: '2/2',
    description: 'Two-shot',
    color: '#dc2626',
  },
];

/**
 * Linings for one template scene against a parsed copy of the sample
 * screenplay. `mapShotId` lets a caller that re-ids the cloned shots point the
 * linings at the new ids.
 */
export const sampleMarksFor = (
  templateId: string,
  lines: ScriptLine[],
  sceneNumber: string,
  mapShotId: (shotId: string) => string | undefined = (id) => id
): ScriptMark[] => {
  const idOf = (needle: string) => lines.find((line) => line.text.startsWith(needle))?.id;

  return SAMPLE_LININGS.filter((lining) => lining.templateId === templateId)
    .map((lining, index) => {
      const startLineId = idOf(lining.from);
      const endLineId = idOf(lining.to);
      const shotId = mapShotId(lining.shotId);
      if (!startLineId || !endLineId || !shotId) return null;
      return {
        id: `sample-mark-${templateId}-${index}-${Date.now().toString(36)}`,
        shotId,
        startLineId,
        endLineId,
        label: lining.label,
        description: lining.description,
        color: lining.color,
        sceneNumber,
      } as ScriptMark;
    })
    .filter((mark): mark is ScriptMark => !!mark);
};

export { SAMPLE_SCREENPLAY };
