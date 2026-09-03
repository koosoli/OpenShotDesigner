import { describe, expect, it } from 'vitest';
import { buildReadinessItems, readinessFingerprint } from '../readiness';
import { createProject } from '../../utils/projectLibrary';

describe('production readiness', () => {
  it('changes the dismissal fingerprint when the finding changes', () => {
    const project = createProject();
    project.productionDays = [{
      id: 'day-1',
      name: 'Day 1',
      date: '',
      crewCall: '',
      scheduleBlockIds: [],
    }];
    const before = buildReadinessItems(project)[0];
    expect(before.detail).toContain('date');

    project.productionDays[0].date = '2026-09-03';
    const after = buildReadinessItems(project)[0];
    expect(readinessFingerprint(after)).not.toBe(readinessFingerprint(before));
  });

  it('does not let a good pickup cover a missing good base take', () => {
    const project = createProject({ withSampleScenes: true });
    const shot = project.setups[0].shots[0];
    project.takes = [{
      id: 'take-pu',
      shotId: shot.id,
      takeNumber: 1,
      isGoodTake: true,
      slateTag: 'PU',
    }];
    expect(buildReadinessItems(project)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: `coverage-${shot.id}`, severity: 'blocker' }),
    ]));
  });
});
