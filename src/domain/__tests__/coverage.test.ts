import { describe, expect, it } from 'vitest';
import { coverageIssues, coverageSummary } from '../shots/coverage';
import type { Shot } from '../../types';

let counter = 0;
/** A shot with only the fields the coverage rules read set explicitly. */
const shot = (partial: Partial<Shot> & { sceneNumber: string }): Shot =>
  ({
    id: `s${(counter += 1)}`,
    shotNumber: '1A',
    name: '',
    cameraId: 'cam1',
    cameraLabel: 'A',
    shotSize: 'MS',
    lensMm: 35,
    cameraAngle: 'Eye Level',
    movement: 'Static',
    aspectRatio: '16:9',
    frameRate: 25,
    subjectActorIds: [],
    framingDescription: '',
    status: 'planned',
    takesCount: 0,
    estDurationSeconds: 0,
    order: 0,
    ...partial,
  }) as Shot;

const codes = (issues: ReturnType<typeof coverageIssues>): string[] =>
  issues.map((issue) => issue.code);

describe('no_master', () => {
  it('flags a scene with nothing wider than a medium', () => {
    const issues = coverageIssues({
      shots: [shot({ sceneNumber: '4', shotSize: 'CU' }), shot({ sceneNumber: '4', shotSize: 'MS' })],
    });
    expect(codes(issues)).toContain('no_master');
  });

  it('is satisfied by any wide size, not only WS', () => {
    for (const size of ['ELS', 'WS', 'FS', 'MWS'] as const) {
      const issues = coverageIssues({
        shots: [shot({ sceneNumber: '4', shotSize: size }), shot({ sceneNumber: '4', shotSize: 'CU' })],
      });
      expect(codes(issues)).not.toContain('no_master');
    }
  });

  it('still fires when the only wide was omitted', () => {
    // The point of the check: a struck master is exactly the case where the
    // shot list still LOOKS covered.
    const issues = coverageIssues({
      shots: [
        shot({ sceneNumber: '4', shotSize: 'WS', status: 'omitted' }),
        shot({ sceneNumber: '4', shotSize: 'CU' }),
      ],
    });
    expect(codes(issues)).toContain('no_master');
  });

  it('says nothing about a scene whose every shot is omitted', () => {
    const issues = coverageIssues({
      shots: [shot({ sceneNumber: '4', shotSize: 'CU', status: 'omitted' })],
    });
    expect(issues).toEqual([]);
  });
});

describe('single_angle', () => {
  it('flags two shots framed identically', () => {
    const issues = coverageIssues({
      shots: [
        shot({ sceneNumber: '4', shotSize: 'WS', cameraAngle: 'Eye Level' }),
        shot({ sceneNumber: '4', shotSize: 'WS', cameraAngle: 'Eye Level' }),
      ],
    });
    expect(codes(issues)).toContain('single_angle');
  });

  it('does not flag a scene deliberately covered in one shot', () => {
    const issues = coverageIssues({ shots: [shot({ sceneNumber: '4', shotSize: 'WS' })] });
    expect(codes(issues)).not.toContain('single_angle');
  });

  it('counts a different camera height as a different angle', () => {
    const issues = coverageIssues({
      shots: [
        shot({ sceneNumber: '4', shotSize: 'WS', cameraAngle: 'Eye Level' }),
        shot({ sceneNumber: '4', shotSize: 'WS', cameraAngle: 'Low Angle' }),
      ],
    });
    expect(codes(issues)).not.toContain('single_angle');
  });
});

describe('character_never_solo', () => {
  const actors = [
    { id: 'a1', name: 'JENNA' },
    { id: 'a2', name: 'MARCUS' },
  ];

  it('flags a performer who only ever appears in two-shots', () => {
    const issues = coverageIssues({
      actors,
      shots: [
        shot({ sceneNumber: '4', shotSize: 'WS', subjectActorIds: ['a1', 'a2'] }),
        shot({ sceneNumber: '4', shotSize: 'CU', subjectActorIds: ['a1'] }),
      ],
    });
    const flagged = issues.filter((issue) => issue.code === 'character_never_solo');
    expect(flagged).toHaveLength(1);
    expect(flagged[0].actorId).toBe('a2');
    expect(flagged[0].message).toContain('MARCUS');
  });

  it('does not count an OTS as a single', () => {
    // An over-the-shoulder frames two people. Treating it as coverage of one
    // is the mistake that makes the check useless in a dialogue scene, which
    // is the only kind of scene it exists for.
    const issues = coverageIssues({
      actors,
      shots: [
        shot({ sceneNumber: '4', shotSize: 'WS', subjectActorIds: ['a1', 'a2'] }),
        shot({ sceneNumber: '4', shotSize: 'OTS', subjectActorIds: ['a1'] }),
      ],
    });
    expect(
      issues.filter((issue) => issue.code === 'character_never_solo').map((i) => i.actorId),
    ).toEqual(['a1', 'a2']);
  });

  it('names the shots the performer does appear in', () => {
    const two = shot({ sceneNumber: '4', shotSize: 'WS', subjectActorIds: ['a1', 'a2'] });
    const other = shot({ sceneNumber: '4', shotSize: 'CU', subjectActorIds: ['a1'] });
    const issues = coverageIssues({ actors, shots: [two, other] });
    const flagged = issues.find((issue) => issue.code === 'character_never_solo');
    expect(flagged?.shotIds).toEqual([two.id]);
  });

  it('falls back to a neutral phrase for an unnamed performer', () => {
    const issues = coverageIssues({
      shots: [shot({ sceneNumber: '4', shotSize: 'WS', subjectActorIds: ['ghost'] })],
    });
    const flagged = issues.find((issue) => issue.code === 'character_never_solo');
    expect(flagged?.message).toContain('A performer');
    expect(flagged?.actorName).toBeUndefined();
  });
});

describe('character_uncovered', () => {
  it('flags a character the breakdown names but no shot does', () => {
    const issues = coverageIssues({
      actors: [{ id: 'a3', name: 'THE WAITER' }],
      shots: [shot({ sceneNumber: '4', shotSize: 'WS', subjectActorIds: ['a1'] })],
      sceneActorIds: { '4': ['a1', 'a3'] },
    });
    const flagged = issues.find((issue) => issue.code === 'character_uncovered');
    expect(flagged?.actorId).toBe('a3');
  });

  it('reports a scene with no shots once, not once per character', () => {
    const issues = coverageIssues({
      shots: [],
      sceneActorIds: { '9': ['a1', 'a2', 'a3'] },
    });
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('3 characters');
  });

  it('is skipped entirely when no breakdown is supplied', () => {
    // Rule 1 / rule 36: a project with no screenplay must not be told its
    // characters are uncovered on the strength of data it does not have.
    const issues = coverageIssues({
      shots: [shot({ sceneNumber: '4', shotSize: 'WS' })],
    });
    expect(codes(issues)).not.toContain('character_uncovered');
  });
});

describe('coverageIssues', () => {
  it('ignores shots with no scene number rather than inventing a scene', () => {
    const issues = coverageIssues({ shots: [shot({ sceneNumber: '  ', shotSize: 'CU' })] });
    expect(issues).toEqual([]);
  });

  it('reports scenes in the order they first appear in the shot list', () => {
    const issues = coverageIssues({
      shots: [
        shot({ sceneNumber: '12', shotSize: 'CU' }),
        shot({ sceneNumber: '3', shotSize: 'CU' }),
      ],
    });
    expect(issues.map((issue) => issue.sceneNumber)).toEqual(['12', '3']);
  });
});

describe('coverageSummary', () => {
  it('splits the count by severity', () => {
    const issues = coverageIssues({
      actors: [{ id: 'a1', name: 'JENNA' }],
      shots: [
        shot({ sceneNumber: '4', shotSize: 'CU', subjectActorIds: ['a1'] }),
        shot({ sceneNumber: '4', shotSize: 'CU', subjectActorIds: ['a1'] }),
      ],
    });
    // no_master is a warning; single_angle is a note.
    expect(coverageSummary(issues)).toEqual({ warnings: 1, notes: 1 });
  });
});
