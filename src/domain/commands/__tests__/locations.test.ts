/**
 * Location commands.
 *
 * Moving this cluster surfaced a gap: `LocationsPanel` cleared the plan links
 * on delete but not `scriptScene.locationId`, which `resolveDayLocations` also
 * reads. A dangling scene link does not throw — it falls through to the
 * slugline — so the call sheet quietly stops printing the address and prints
 * "INT. WAREHOUSE - NIGHT" where a map should be, and the unit drives to a
 * heading.
 */
import { describe, expect, it } from 'vitest';
import type { Project } from '../../../types';
import { removeLocationCommand, setLocationsCommand } from '../locations';

const linkedProject = (): Project =>
  ({
    id: 'p1',
    title: 'Test Production',
    activeSetupId: 'setup-1',
    locations: [
      { id: 'loc-warehouse', name: 'Warehouse', type: 'location' },
      { id: 'loc-north-end', name: 'North end', type: 'location', parentLocationId: 'loc-warehouse' },
      { id: 'loc-rooftop', name: 'Rooftop', type: 'location' },
    ],
    setups: [
      { id: 'setup-1', name: 'Scene 1', elements: [], shots: [], locationId: 'loc-warehouse' },
      { id: 'setup-2', name: 'Master', elements: [], shots: [], masterPlanForLocationId: 'loc-warehouse' },
      { id: 'setup-3', name: 'Scene 3', elements: [], shots: [], locationId: 'loc-rooftop' },
    ],
    scriptScenes: [
      { id: 'scene-1', sceneNumber: '1', heading: 'INT. WAREHOUSE - NIGHT', locationId: 'loc-warehouse' },
      { id: 'scene-2', sceneNumber: '2', heading: 'EXT. ROOFTOP - DAY', locationId: 'loc-rooftop' },
    ],
  }) as unknown as Project;

describe('removeLocationCommand', () => {
  it('removes the location', () => {
    const { project } = removeLocationCommand(linkedProject(), { locationId: 'loc-warehouse' });
    expect(project.locations?.map((location) => location.id)).not.toContain('loc-warehouse');
  });

  it('re-parents children instead of deleting them', () => {
    // "Stage 2, north end" is a real place. Losing it because its parent was
    // tidied away would be worse than leaving it unfiled.
    const { project } = removeLocationCommand(linkedProject(), { locationId: 'loc-warehouse' });
    const child = project.locations?.find((location) => location.id === 'loc-north-end');
    expect(child).toBeTruthy();
    expect(child?.parentLocationId).toBeUndefined();
  });

  it('clears the plan links', () => {
    const { project } = removeLocationCommand(linkedProject(), { locationId: 'loc-warehouse' });
    expect(project.setups[0].locationId).toBeUndefined();
    expect(project.setups[1].masterPlanForLocationId).toBeUndefined();
  });

  it('clears the SCRIPT SCENE link the panel used to forget', () => {
    // The gap this command was written to close. Without it the day resolves
    // to the slugline and the call sheet prints no address.
    const { project } = removeLocationCommand(linkedProject(), { locationId: 'loc-warehouse' });
    const scene = project.scriptScenes?.find((candidate) => candidate.id === 'scene-1');
    expect(scene?.locationId).toBeUndefined();
    // The scene itself survives — only the link goes.
    expect(scene?.heading).toBe('INT. WAREHOUSE - NIGHT');
  });

  it('leaves no reference to the removed location anywhere', () => {
    const { project } = removeLocationCommand(linkedProject(), { locationId: 'loc-warehouse' });
    const serialized = JSON.stringify({
      locations: project.locations,
      setups: project.setups,
      scenes: project.scriptScenes,
    });
    expect(serialized).not.toContain('loc-warehouse');
  });

  it('leaves every other location and its links untouched', () => {
    const { project } = removeLocationCommand(linkedProject(), { locationId: 'loc-warehouse' });
    expect(project.setups[2].locationId).toBe('loc-rooftop');
    expect(project.scriptScenes?.[1].locationId).toBe('loc-rooftop');
  });

  it('counts the links it cleared', () => {
    const { meta, warnings } = removeLocationCommand(linkedProject(), {
      locationId: 'loc-warehouse',
    });
    // 1 child + 2 setups + 1 scene.
    expect(meta.description).toBe('Remove Warehouse and clear 4 links');
    expect(warnings?.[0]).toMatch(/scene link/);
  });

  it('says so plainly when nothing pointed at it', () => {
    const { meta, warnings } = removeLocationCommand(linkedProject(), {
      locationId: 'loc-north-end',
    });
    expect(meta.description).toBe('Remove North end');
    expect(warnings).toBeUndefined();
  });

  it('copes with a project that has no script scenes at all', () => {
    const noScript = { ...linkedProject(), scriptScenes: undefined } as Project;
    const { project } = removeLocationCommand(noScript, { locationId: 'loc-warehouse' });
    expect(project.scriptScenes).toBeUndefined();
  });

  it('rejects an unknown id rather than silently doing nothing', () => {
    expect(() =>
      removeLocationCommand(linkedProject(), { locationId: 'nope' }),
    ).toThrow(/unknown location id/);
  });

  it('leaves the input project untouched', () => {
    const before = linkedProject();
    removeLocationCommand(before, { locationId: 'loc-warehouse' });
    expect(before.locations).toHaveLength(3);
    expect(before.scriptScenes?.[0].locationId).toBe('loc-warehouse');
  });
});

describe('setLocationsCommand', () => {
  it('applies the updater to the project it is given', () => {
    const first = setLocationsCommand(linkedProject(), {
      update: (previous) => [...previous, { id: 'loc-new', name: 'Car park', type: 'location' } as never],
      description: 'Add Car park',
    });
    const second = setLocationsCommand(first.project, {
      update: (previous) => previous.filter((location) => location.id !== 'loc-rooftop'),
      description: 'Remove Rooftop',
    });
    expect(second.project.locations?.map((location) => location.id)).toEqual([
      'loc-warehouse',
      'loc-north-end',
      'loc-new',
    ]);
  });

  it('carries the caller description into the log', () => {
    const { meta } = setLocationsCommand(linkedProject(), {
      update: (previous) => previous,
      description: 'Edit location',
    });
    expect(meta.description).toBe('Edit location');
  });

  it('rejects a non-function updater', () => {
    expect(() =>
      setLocationsCommand(linkedProject(), { update: [] as never, description: 'nope' }),
    ).toThrow(/must be a function/);
  });
});
