/**
 * People commands: the first domain cluster lifted out of the context.
 *
 * The behaviour under test used to live inside `ContactsPanel`, which meant
 * the referential cleanup on delete could only be exercised by rendering a
 * React tree. These tests are the reason the move was worth making: they run
 * in milliseconds, they state the invariant directly, and a second delete path
 * added later inherits both the behaviour and this net.
 *
 * The invariant that matters most: a person leaves no dangling reference
 * behind. A stale assignee id silently drops a name off a task card; a stale
 * pick-up prints "contact removed" on a call sheet that is already at the
 * unit base.
 */
import { describe, expect, it } from 'vitest';
import type { Project } from '../../../types';
import type { Person } from '../../people/types';
import {
  assignCastCommand,
  assignKeyRoleCommand,
  importPeopleCommand,
  removePersonCommand,
  setCastNumberCommand,
  upsertPersonCommand,
} from '../people';

const person = (id: string, overrides: Partial<Person> = {}): Person =>
  ({
    id,
    displayName: id,
    kind: 'crew',
    ...overrides,
  }) as Person;

/**
 * A project where one person is referenced from every place that can hold a
 * person id — the whole point of the delete command.
 */
const projectWithReferences = (): Project =>
  ({
    id: 'p1',
    title: 'Test Production',
    director: 'Ana Vogel',
    cinematographer: '',
    setups: [],
    activeSetupId: '',
    people: [
      person('sam', { displayName: 'Sam Ortiz' }),
      person('lee', { displayName: 'Lee Park' }),
    ],
    castAssignments: [
      { characterId: 'char-1', personId: 'sam' },
      { characterId: 'char-2', personId: 'lee' },
    ],
    characters: [
      { id: 'char-1', canonicalName: 'ALEX', aliases: [] },
      { id: 'char-2', canonicalName: 'SARAH', aliases: [] },
    ],
    locations: [
      { id: 'loc-1', name: 'Warehouse', contactIds: ['sam', 'lee'] },
      { id: 'loc-2', name: 'Rooftop', contactIds: ['lee'] },
    ],
    tasks: [
      { id: 't-1', title: 'Scout', assigneeIds: ['sam'] },
      { id: 't-2', title: 'Rig', assigneeIds: ['lee'] },
    ],
    productionDays: [
      {
        id: 'd-1',
        callSheet: { pickups: [{ personId: 'sam' }, { personId: 'lee' }] },
      },
    ],
  }) as unknown as Project;

describe('upsertPersonCommand', () => {
  it('adds a new contact and says so', () => {
    const before = projectWithReferences();
    const { project, meta } = upsertPersonCommand(before, {
      person: person('nia', { displayName: 'Nia Bell' }),
    });
    expect(project.people).toHaveLength(3);
    expect(meta.description).toBe('Add Nia Bell');
    expect(meta.type).toBe('upsertPerson');
  });

  it('replaces an existing contact rather than appending a duplicate', () => {
    const { project, meta } = upsertPersonCommand(projectWithReferences(), {
      person: person('sam', { displayName: 'Sam Ortiz-Reyes' }),
    });
    expect(project.people).toHaveLength(2);
    expect(project.people?.find((p) => p.id === 'sam')?.displayName).toBe('Sam Ortiz-Reyes');
    expect(meta.description).toBe('Update Sam Ortiz-Reyes');
  });

  it('leaves the input project untouched', () => {
    const before = projectWithReferences();
    upsertPersonCommand(before, { person: person('nia') });
    expect(before.people).toHaveLength(2);
  });

  it('rejects a person with no id', () => {
    expect(() =>
      upsertPersonCommand(projectWithReferences(), { person: person('') }),
    ).toThrow(/non-empty string/);
  });
});

describe('removePersonCommand', () => {
  it('removes the person', () => {
    const { project } = removePersonCommand(projectWithReferences(), { personId: 'sam' });
    expect(project.people?.map((p) => p.id)).toEqual(['lee']);
  });

  it('leaves no dangling reference anywhere', () => {
    const { project } = removePersonCommand(projectWithReferences(), { personId: 'sam' });

    const serialized = JSON.stringify({
      cast: project.castAssignments,
      locations: project.locations,
      tasks: project.tasks,
      days: project.productionDays,
    });
    expect(serialized).not.toContain('"sam"');
  });

  it('keeps everyone else exactly as they were', () => {
    const { project } = removePersonCommand(projectWithReferences(), { personId: 'sam' });
    expect(project.castAssignments).toEqual([{ characterId: 'char-2', personId: 'lee' }]);
    expect(project.locations?.[0]?.contactIds).toEqual(['lee']);
    expect(project.tasks?.[1]?.assigneeIds).toEqual(['lee']);
  });

  it('counts what it swept up in the description', () => {
    const { meta } = removePersonCommand(projectWithReferences(), { personId: 'sam' });
    // 1 cast + 1 location + 1 task + 1 pick-up.
    expect(meta.description).toBe('Remove Sam Ortiz and 4 references');
  });

  it('reports the sweep as a warning the caller can surface', () => {
    const { warnings } = removePersonCommand(projectWithReferences(), { personId: 'sam' });
    expect(warnings?.[0]).toMatch(/1 cast assignment/);
    expect(warnings?.[0]).toMatch(/1 call-sheet pick-up/);
  });

  it('says so plainly when nothing else referenced them', () => {
    const base = projectWithReferences();
    const isolated = {
      ...base,
      people: [...(base.people ?? []), person('zoe', { displayName: 'Zoe Kim' })],
    } as Project;
    const { meta, warnings } = removePersonCommand(isolated, { personId: 'zoe' });
    expect(meta.description).toBe('Remove Zoe Kim');
    expect(warnings).toBeUndefined();
  });

  it('rejects an unknown id instead of silently doing nothing', () => {
    // A no-op delete looks like success at the call site and hides a bug.
    expect(() =>
      removePersonCommand(projectWithReferences(), { personId: 'nobody' }),
    ).toThrow(/unknown person id/);
  });

  it('leaves the input project untouched', () => {
    const before = projectWithReferences();
    removePersonCommand(before, { personId: 'sam' });
    expect(before.people).toHaveLength(2);
    expect(before.castAssignments).toHaveLength(2);
  });
});

describe('assignCastCommand', () => {
  it('casts a performer and names both sides in the log', () => {
    const { project, meta } = assignCastCommand(projectWithReferences(), {
      characterId: 'char-2',
      personId: 'sam',
    });
    expect(
      project.castAssignments?.find((a) => a.characterId === 'char-2')?.personId,
    ).toBe('sam');
    expect(meta.description).toBe('Cast Sam Ortiz as SARAH');
  });

  it('vacates the part when no person is given', () => {
    const { project, meta } = assignCastCommand(projectWithReferences(), {
      characterId: 'char-1',
    });
    expect(project.castAssignments?.some((a) => a.characterId === 'char-1')).toBe(false);
    expect(meta.description).toBe('Vacate ALEX');
  });

  it('persists a merged character catalogue alongside the assignment', () => {
    // Discovered character ids must stay stable, or the next breakdown pass
    // re-creates them and the casting is silently lost.
    const merged = [
      { id: 'char-1', canonicalName: 'ALEX', aliases: [] },
      { id: 'char-3', canonicalName: 'MARTA', aliases: [] },
    ];
    const { project } = assignCastCommand(projectWithReferences(), {
      characterId: 'char-3',
      personId: 'lee',
      characters: merged,
    });
    expect(project.characters).toEqual(merged);
  });

  it('rejects an empty character id', () => {
    expect(() =>
      assignCastCommand(projectWithReferences(), { characterId: '' }),
    ).toThrow(/non-empty string/);
  });
});

describe('setCastNumberCommand', () => {
  it('sets the number a character is called by', () => {
    const { project } = setCastNumberCommand(projectWithReferences(), {
      characterId: 'char-1',
      castNumber: 3,
    });
    expect(
      project.castAssignments?.find((a) => a.characterId === 'char-1')?.castNumber,
    ).toBe(3);
  });

  it('rejects a non-numeric cast number', () => {
    expect(() =>
      setCastNumberCommand(projectWithReferences(), {
        characterId: 'char-1',
        castNumber: Number.NaN,
      }),
    ).toThrow(/finite number/);
  });
});

describe('assignKeyRoleCommand', () => {
  it('mirrors the director onto the project field the exports read', () => {
    // The bug this prevents: the crew page says one name and the printed
    // header says another, depending on which screen was used last.
    const { project } = assignKeyRoleCommand(projectWithReferences(), {
      roleKey: 'director',
      personId: 'lee',
    });
    expect(project.director).toBe('Lee Park');
  });

  it('blanks the mirrored field when the role is vacated', () => {
    const filled = assignKeyRoleCommand(projectWithReferences(), {
      roleKey: 'director',
      personId: 'lee',
    }).project;
    const { project } = assignKeyRoleCommand(filled, { roleKey: 'director', personId: '' });
    expect(project.director).toBe('');
  });

  it('rejects an unknown role key', () => {
    expect(() =>
      assignKeyRoleCommand(projectWithReferences(), { roleKey: 'gaffer-in-chief', personId: 'lee' }),
    ).toThrow(/unknown role key/);
  });
});

describe('importPeopleCommand', () => {
  it('appends imported contacts and counts them', () => {
    const { project, meta } = importPeopleCommand(projectWithReferences(), {
      people: [person('a'), person('b')],
    });
    expect(project.people).toHaveLength(4);
    expect(meta.description).toBe('Import 2 contacts');
  });

  it('uses the singular for one contact', () => {
    const { meta } = importPeopleCommand(projectWithReferences(), { people: [person('a')] });
    expect(meta.description).toBe('Import 1 contact');
  });

  it('rejects a non-array payload', () => {
    expect(() =>
      importPeopleCommand(projectWithReferences(), { people: null as unknown as Person[] }),
    ).toThrow(/must be an array/);
  });
});

describe('command metadata', () => {
  it('describes intent rather than mechanism', () => {
    // The whole reason these exist. Every one of these used to log
    // "Update project metadata", which is useless as an undo label.
    const project = projectWithReferences();
    const descriptions = [
      upsertPersonCommand(project, { person: person('nia', { displayName: 'Nia Bell' }) }).meta,
      removePersonCommand(project, { personId: 'sam' }).meta,
      assignCastCommand(project, { characterId: 'char-1', personId: 'lee' }).meta,
      assignKeyRoleCommand(project, { roleKey: 'director', personId: 'lee' }).meta,
    ].map((meta) => meta.description);

    for (const description of descriptions) {
      expect(description).not.toMatch(/update project metadata/i);
      expect(description.length).toBeGreaterThan(5);
    }
  });

  it('stamps a parseable timestamp on every command', () => {
    const { meta } = upsertPersonCommand(projectWithReferences(), { person: person('nia') });
    expect(Number.isNaN(Date.parse(meta.timestamp))).toBe(false);
  });
});
