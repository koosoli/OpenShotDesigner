import { describe, it, expect } from 'vitest';
import type { Person, CastAssignment } from '../people';
import { createId } from '../ids';

describe('Person', () => {
  it('creates a minimal person with only required fields', () => {
    const person: Person = { id: createId('person'), displayName: 'Ada Okafor' };
    expect(person.displayName).toBe('Ada Okafor');
    expect(person.kind).toBeUndefined();
  });

  it('supports all optional fields and kinds', () => {
    const kinds: NonNullable<Person['kind']>[] = [
      'crew',
      'cast',
      'talent',
      'contact',
      'client',
      'artist',
      'other',
    ];
    for (const kind of kinds) {
      const person: Person = {
        id: createId('person'),
        displayName: 'Person',
        kind,
        department: 'Camera',
        role: '1st AC',
        email: 'person@example.com',
        phone: '+49 30 123456',
        notes: 'Prefers email',
      };
      expect(person.kind).toBe(kind);
      expect(person.department).toBe('Camera');
    }
  });
});

describe('CastAssignment', () => {
  it('links a character to a person without merging them', () => {
    const characterId = createId('char');
    const person: Person = { id: createId('person'), displayName: 'Ada Okafor' };
    const assignment: CastAssignment = {
      id: createId('comment'),
      characterId,
      personId: person.id,
      notes: 'Lead',
    };
    expect(assignment.characterId).toBe(characterId);
    expect(assignment.personId).toBe(person.id);
    expect(assignment.id).not.toBe(person.id);
    expect(assignment.id).not.toBe(characterId);
  });

  it('keeps character and person ids in distinct namespaces', () => {
    const characterId = createId('char');
    const personId = createId('person');
    expect(characterId.startsWith('char-')).toBe(true);
    expect(personId.startsWith('person-')).toBe(true);
    const assignment: CastAssignment = {
      id: createId('comment'),
      characterId,
      personId,
    };
    expect(assignment.characterId.startsWith('char-')).toBe(true);
    expect(assignment.personId.startsWith('person-')).toBe(true);
  });
});
