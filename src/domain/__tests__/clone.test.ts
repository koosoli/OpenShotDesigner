import { describe, it, expect } from 'vitest';
import { cloneSetupWithNewIds, cloneProjectWithNewIds } from '../clone';
import { validateProject } from '../validation';
import type { CameraElement } from '../../types';
import {
  buildRichSetup,
  collectIds,
  intersectIds,
  makeProject,
} from '../../utils/__tests__/fixtures';

const errorCodes = (issues: ReturnType<typeof validateProject>) =>
  issues.filter((issue) => issue.severity === 'error').map((issue) => issue.code);

describe('cloneSetupWithNewIds', () => {
  const rich = buildRichSetup();

  it('deep-clones without mutating the original', () => {
    const snapshot = structuredClone(rich);
    const clone = cloneSetupWithNewIds(rich);
    expect(clone).not.toBe(rich);
    expect(clone.elements).not.toBe(rich.elements);
    expect(clone.shots).not.toBe(rich.shots);
    expect(rich).toEqual(snapshot);
    // structure is otherwise preserved
    expect(clone.elements).toHaveLength(rich.elements.length);
    expect(clone.shots).toHaveLength(rich.shots.length);
    expect(clone.scriptLines).toHaveLength(3);
    expect(clone.scriptMarks).toHaveLength(1);
    expect(clone.avScriptRows).toHaveLength(1);
    expect(clone.customEquipment).toHaveLength(1);
  });

  it('assigns ids fully disjoint from the original ids', () => {
    const clone = cloneSetupWithNewIds(rich);
    const overlap = intersectIds(collectIds(rich), collectIds(clone));
    expect(overlap).toEqual([]);
  });

  it('regenerates nested actor speech cue ids while preserving beat dialogue', () => {
    const clone = cloneSetupWithNewIds(rich);
    const originalActor = rich.elements.find((element) => element.type === 'actor' && element.speechCues?.length);
    const clonedActor = clone.elements.find((element) => element.type === 'actor' && element.name === originalActor?.name);
    if (originalActor?.type !== 'actor' || clonedActor?.type !== 'actor') throw new Error('Expected actor fixtures');
    expect(clonedActor.speechCues?.[0].id).not.toBe(originalActor.speechCues?.[0].id);
    expect(clonedActor.speechCues?.[0].beat).toBe(1);
    expect(clonedActor.speechCues?.[0].text).toBe('Hello there.');
  });

  it('gives every cloned entity a unique id', () => {
    const clone = cloneSetupWithNewIds(rich);
    const ids = [...collectIds(clone)];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps the literal "start" storyboard slot and remaps waypoint-keyed slots', () => {
    const clone = cloneSetupWithNewIds(rich);
    const cloneCamA = clone.elements.find(
      (el): el is CameraElement => el.type === 'camera' && el.cameraLabel === 'A',
    )!;
    const cloneShot1 = clone.shots.find((s) => s.name === 'Wide')!;
    const slots = Object.keys(cloneShot1.storyboardFrames!);

    expect(slots).toContain('start');
    expect(slots).toHaveLength(2);
    expect(slots).toContain(cloneCamA.path[0].id);
    expect(Object.keys(cloneShot1.storyboardFrames!)).not.toContain('fx-wp-cam-a-1');
    expect(cloneShot1.storyboardFrames!['start']).toEqual({ image: 'data:image/png;base64,START', note: 'base frame' });
    expect(cloneShot1.storyboardFrames![cloneCamA.path[0].id]).toEqual({ image: 'data:image/png;base64,KEY1' });
  });

  it('remaps every internal reference to point at cloned entities', () => {
    const clone = cloneSetupWithNewIds(rich);
    const elementIds = new Set(clone.elements.map((el) => el.id));
    const shotIds = new Set(clone.shots.map((s) => s.id));
    const lineIds = new Set((clone.scriptLines ?? []).map((l) => l.id));
    // Storyboard frame slots are keyed by camera waypoint id (or 'start').
    const waypointIds = new Set(
      clone.elements.flatMap((el) => ('path' in el && Array.isArray(el.path) ? el.path.map((wp) => wp.id) : [])),
    );

    for (const shot of clone.shots) {
      expect(elementIds.has(shot.cameraId)).toBe(true);
      for (const actorId of shot.subjectActorIds) expect(elementIds.has(actorId)).toBe(true);
      if (shot.scriptLineId) expect(lineIds.has(shot.scriptLineId)).toBe(true);
      for (const key of Object.keys(shot.storyboardFrames ?? {})) {
        if (key !== 'start') expect(waypointIds.has(key)).toBe(true);
      }
    }
    for (const el of clone.elements) {
      if (el.type === 'camera' && el.associatedShotId) expect(shotIds.has(el.associatedShotId)).toBe(true);
      if ('lookAtTargetId' in el && el.lookAtTargetId) expect(elementIds.has(el.lookAtTargetId)).toBe(true);
    }
    for (const mark of clone.scriptMarks ?? []) {
      expect(shotIds.has(mark.shotId)).toBe(true);
      expect(lineIds.has(mark.startLineId)).toBe(true);
      expect(lineIds.has(mark.endLineId)).toBe(true);
      if (mark.wavyStartLineId) expect(lineIds.has(mark.wavyStartLineId)).toBe(true);
      if (mark.wavyEndLineId) expect(lineIds.has(mark.wavyEndLineId)).toBe(true);
    }
    for (const row of clone.avScriptRows ?? []) {
      if (row.linkedShotId) expect(shotIds.has(row.linkedShotId)).toBe(true);
    }
    for (const line of clone.scriptLines ?? []) {
      if (line.linkedShotId) expect(shotIds.has(line.linkedShotId)).toBe(true);
    }
    for (const item of clone.customEquipment ?? []) {
      if (item.elementId) expect(elementIds.has(item.elementId)).toBe(true);
      for (const pkg of item.packageItems ?? []) {
        expect(typeof pkg.id).toBe('string');
        expect(pkg.id).not.toBe('');
      }
    }
    expect(clone.backgroundImage?.id).toBeTruthy();
  });

  it('produces a setup that validates with zero errors inside a wrapping project', () => {
    const clone = cloneSetupWithNewIds(rich);
    const project = makeProject([clone]);
    project.scriptLines = clone.scriptLines;
    expect(errorCodes(validateProject(project))).toEqual([]);
  });
});

describe('cloneProjectWithNewIds', () => {
  const buildProject = () => {
    const rich = buildRichSetup();
    const project = makeProject([rich], { id: 'fx-project-orig', title: 'Original Title' });
    project.scriptLines = rich.scriptLines;
    return project;
  };

  it('gives the project a fresh id and maps activeSetupId onto the cloned setup', () => {
    const project = buildProject();
    const clone = cloneProjectWithNewIds(project);
    expect(clone.id).not.toBe(project.id);
    expect(clone.activeSetupId).not.toBe(project.activeSetupId);
    const active = clone.setups.find((s) => s.id === clone.activeSetupId);
    expect(active?.name).toBe('Rich Setup');
  });

  it('applies overrides, including an explicit id', () => {
    const project = buildProject();
    const clone = cloneProjectWithNewIds(project, { title: 'Overridden', id: 'fixed-clone-id' });
    expect(clone.title).toBe('Overridden');
    expect(clone.id).toBe('fixed-clone-id');
  });

  it('clones are internally consistent: validation reports zero errors', () => {
    const clone = cloneProjectWithNewIds(buildProject());
    expect(errorCodes(validateProject(clone))).toEqual([]);
  });

  it('remaps project-level script lines and keeps data intact', () => {
    const project = buildProject();
    const clone = cloneProjectWithNewIds(project);
    const shotIds = new Set(clone.setups.flatMap((s) => s.shots.map((sh) => sh.id)));
    expect(clone.scriptLines).toHaveLength(project.scriptLines!.length);
    for (const line of clone.scriptLines ?? []) {
      if (line.linkedShotId) expect(shotIds.has(line.linkedShotId)).toBe(true);
    }
    expect(clone.director).toBe(project.director);
    expect(clone.date).toBe(project.date);
  });

  it('remaps production calendar event ids and dependencies', () => {
    const project = buildProject();
    project.productionCalendarEvents = [
      { id: 'event-a', title: 'Prep', startDate: '2026-09-01', endDate: '2026-09-02', category: 'preproduction' },
      { id: 'event-b', title: 'Shoot', startDate: '2026-09-03', endDate: '2026-09-05', category: 'shoot', dependencyIds: ['event-a'] },
    ];
    const clone = cloneProjectWithNewIds(project);
    expect(clone.productionCalendarEvents?.map((event) => event.id)).not.toEqual(['event-a', 'event-b']);
    expect(clone.productionCalendarEvents?.[1].dependencyIds).toEqual([clone.productionCalendarEvents?.[0].id]);
  });

  it('two successive clones yield mutually disjoint ids', () => {
    const project = buildProject();
    const c1 = cloneProjectWithNewIds(project);
    const c2 = cloneProjectWithNewIds(project);
    expect(intersectIds(collectIds(c1), collectIds(c2))).toEqual([]);
    expect(c1.id).not.toBe(c2.id);
  });
});
