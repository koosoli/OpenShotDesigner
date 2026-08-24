import { describe, expect, it } from 'vitest';
import {
  binderPhotoAssetIds,
  continuityConflicts,
  departmentDayPlan,
  notesForCharacter,
  notesForScene,
  scriptDayOf,
  scriptDaysInUse,
  subjectNameOf,
} from '../continuity/binder';
import type { BinderSources, ContinuityNote } from '../continuity';

let counter = 0;
const note = (partial: Partial<ContinuityNote> & { description: string }): ContinuityNote => ({
  id: `n${(counter += 1)}`,
  department: 'wardrobe',
  ...partial,
});

const CHARACTERS = [
  { id: 'c1', canonicalName: 'JENNA' },
  { id: 'c2', canonicalName: 'MARCUS' },
];

const sources = (notes: ContinuityNote[], extra: Partial<BinderSources> = {}): BinderSources => ({
  notes,
  characters: CHARACTERS,
  ...extra,
});

describe('scriptDayOf', () => {
  it('prefers the note’s own script day', () => {
    // A note can legitimately be on a different script day than its scene — a
    // flashback, a scene that crosses midnight — and the note is the more
    // specific statement.
    const entry = note({ description: 'Coat', sceneNumber: '4', scriptDay: 'D7' });
    expect(scriptDayOf(entry, [{ sceneNumber: '4', scriptDay: 'D1' }])).toBe('D7');
  });

  it('falls back to the scene’s', () => {
    const entry = note({ description: 'Coat', sceneNumber: '4' });
    expect(scriptDayOf(entry, [{ sceneNumber: '4', scriptDay: 'D1' }])).toBe('D1');
  });

  it('is undefined when neither says', () => {
    expect(scriptDayOf(note({ description: 'Coat' }), [])).toBeUndefined();
    expect(scriptDayOf(note({ description: 'Coat', scriptDay: '  ' }), [])).toBeUndefined();
  });
});

describe('subjectNameOf', () => {
  it('resolves a linked character through the script', () => {
    expect(subjectNameOf(note({ description: 'Coat', characterId: 'c1' }), CHARACTERS)).toBe('JENNA');
  });

  it('uses the typed name when there is no script to link to', () => {
    // Rule 1: a production with no screenplay still dresses people.
    expect(subjectNameOf(note({ description: 'Coat', characterName: 'EXTRA 3' }), [])).toBe('EXTRA 3');
  });

  it('says so rather than printing a blank when nobody is named', () => {
    expect(subjectNameOf(note({ description: 'Coat' }), CHARACTERS)).toBe('Unnamed');
  });
});

describe('continuityConflicts', () => {
  it('catches two descriptions for one character on one script day', () => {
    // The reason the binder is keyed on script day at all: on a feature these
    // two notes are written weeks apart, by different people, about scenes
    // nowhere near each other in the schedule.
    const conflicts = continuityConflicts(
      sources([
        note({ characterId: 'c1', sceneNumber: '4', scriptDay: 'D1', description: 'Navy overcoat, buttoned' }),
        note({ characterId: 'c1', sceneNumber: '51', scriptDay: 'D1', description: 'Grey raincoat' }),
      ]),
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].subjectName).toBe('JENNA');
    expect(conflicts[0].message).toContain('script day D1');
    expect(conflicts[0].message).toContain('scenes 4, 51');
  });

  it('resolves the script day through the scene when the notes omit it', () => {
    const conflicts = continuityConflicts(
      sources(
        [
          note({ characterId: 'c1', sceneNumber: '4', description: 'Navy overcoat' }),
          note({ characterId: 'c1', sceneNumber: '51', description: 'Grey raincoat' }),
        ],
        {
          scriptScenes: [
            { sceneNumber: '4', scriptDay: 'D1' },
            { sceneNumber: '51', scriptDay: 'D1' },
          ],
        },
      ),
    );
    expect(conflicts).toHaveLength(1);
  });

  it('does not flag the same description typed twice', () => {
    const conflicts = continuityConflicts(
      sources([
        note({ characterId: 'c1', scriptDay: 'D1', description: 'Navy overcoat' }),
        note({ characterId: 'c1', scriptDay: 'D1', description: '  navy   OVERCOAT ' }),
      ]),
    );
    expect(conflicts).toEqual([]);
  });

  it('does not flag different departments against each other', () => {
    const conflicts = continuityConflicts(
      sources([
        note({ characterId: 'c1', scriptDay: 'D1', department: 'wardrobe', description: 'Navy overcoat' }),
        note({ characterId: 'c1', scriptDay: 'D1', department: 'hair', description: 'Parting on the left' }),
      ]),
    );
    expect(conflicts).toEqual([]);
  });

  it('does not flag different script days against each other', () => {
    // Wardrobe is SUPPOSED to change between story days. Flagging that would
    // make the check useless on any production longer than a day.
    const conflicts = continuityConflicts(
      sources([
        note({ characterId: 'c1', scriptDay: 'D1', description: 'Navy overcoat' }),
        note({ characterId: 'c1', scriptDay: 'D2', description: 'Grey raincoat' }),
      ]),
    );
    expect(conflicts).toEqual([]);
  });

  it('matches script days case- and space-insensitively', () => {
    const conflicts = continuityConflicts(
      sources([
        note({ characterId: 'c1', scriptDay: 'D1', description: 'Navy overcoat' }),
        note({ characterId: 'c1', scriptDay: ' d1 ', description: 'Grey raincoat' }),
      ]),
    );
    expect(conflicts).toHaveLength(1);
  });

  it('skips notes with no script day rather than pooling them under a blank', () => {
    // Pooling would report every un-dayed note as conflicting with every other
    // one, which is the fastest way to make a warning list unreadable.
    const conflicts = continuityConflicts(
      sources([
        note({ characterId: 'c1', description: 'Navy overcoat' }),
        note({ characterId: 'c1', description: 'Grey raincoat' }),
      ]),
    );
    expect(conflicts).toEqual([]);
  });

  it('keeps two people apart even on the same day', () => {
    const conflicts = continuityConflicts(
      sources([
        note({ characterId: 'c1', scriptDay: 'D1', description: 'Navy overcoat' }),
        note({ characterId: 'c2', scriptDay: 'D1', description: 'Grey raincoat' }),
      ]),
    );
    expect(conflicts).toEqual([]);
  });

  it('groups unlinked notes by the name they carry', () => {
    const conflicts = continuityConflicts(
      sources([
        note({ characterName: 'EXTRA 3', scriptDay: 'D1', description: 'Red scarf' }),
        note({ characterName: 'extra 3', scriptDay: 'D1', description: 'Blue scarf' }),
      ]),
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].subjectName).toBe('EXTRA 3');
  });

  it('ignores an empty description rather than treating blank as a variant', () => {
    const conflicts = continuityConflicts(
      sources([
        note({ characterId: 'c1', scriptDay: 'D1', description: 'Navy overcoat' }),
        note({ characterId: 'c1', scriptDay: 'D1', description: '   ' }),
      ]),
    );
    expect(conflicts).toEqual([]);
  });
});

describe('notesForCharacter / notesForScene', () => {
  const all = [
    note({ characterId: 'c1', sceneNumber: '4', description: 'Coat', department: 'wardrobe' }),
    note({ characterId: 'c1', sceneNumber: '4', description: 'Parting left', department: 'hair' }),
    note({ characterId: 'c2', sceneNumber: '4', description: 'Briefcase', department: 'props' }),
  ];

  it('filters by character', () => {
    expect(notesForCharacter(sources(all), 'c1')).toHaveLength(2);
  });

  it('filters by department as well', () => {
    expect(notesForCharacter(sources(all), 'c1', 'hair')).toHaveLength(1);
  });

  it('filters by scene, trimming what the caller passes', () => {
    expect(notesForScene(sources(all), ' 4 ')).toHaveLength(3);
  });
});

describe('departmentDayPlan', () => {
  const all = [
    note({ characterId: 'c1', sceneNumber: '4', description: 'Navy overcoat', department: 'wardrobe' }),
    note({ characterId: 'c1', sceneNumber: '5', description: 'Same coat, wet', department: 'wardrobe' }),
    note({ characterId: 'c2', sceneNumber: '4', description: 'Briefcase', department: 'props' }),
    note({ characterId: 'c1', sceneNumber: '99', description: 'Not today', department: 'wardrobe' }),
  ];

  it('collects one row per person per department, naming every scene', () => {
    const plan = departmentDayPlan(sources(all), ['4', '5']);
    const wardrobe = plan.find((entry) => entry.department === 'wardrobe');
    expect(wardrobe?.subjectName).toBe('JENNA');
    expect(wardrobe?.sceneNumbers).toEqual(['4', '5']);
    expect(wardrobe?.notes).toHaveLength(2);
  });

  it('leaves out scenes that are not on the day', () => {
    const plan = departmentDayPlan(sources(all), ['4', '5']);
    expect(plan.flatMap((entry) => entry.sceneNumbers)).not.toContain('99');
  });

  it('orders by department as declared, then by name', () => {
    const plan = departmentDayPlan(sources(all), ['4', '5']);
    expect(plan.map((entry) => entry.department)).toEqual(['wardrobe', 'props']);
  });

  it('is empty for a day whose scenes have no notes', () => {
    expect(departmentDayPlan(sources(all), ['77'])).toEqual([]);
  });
});

describe('scriptDaysInUse / binderPhotoAssetIds', () => {
  it('lists each script day once, in first-use order', () => {
    const days = scriptDaysInUse(
      sources([
        note({ description: 'a', scriptDay: 'D2' }),
        note({ description: 'b', scriptDay: 'D1' }),
        note({ description: 'c', scriptDay: ' d2 ' }),
      ]),
    );
    expect(days).toEqual(['D2', 'D1']);
  });

  it('deduplicates photo references across notes', () => {
    expect(
      binderPhotoAssetIds([
        note({ description: 'a', photoAssetIds: ['img1', 'img2'] }),
        note({ description: 'b', photoAssetIds: ['img2', 'img3'] }),
        note({ description: 'c' }),
      ]),
    ).toEqual(['img1', 'img2', 'img3']);
  });
});
