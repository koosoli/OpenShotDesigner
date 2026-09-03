import { describe, expect, it } from 'vitest';
import { createProject } from '../../utils/projectLibrary';
import { collectProjectAssetIds, collectProjectAssetReferences } from '../media/projectAssetReferences';

describe('typed project asset references', () => {
  it('collects declared asset fields but ignores asset-looking free text', () => {
    const project = createProject();
    project.reviewComments = [{
      id: 'comment-1', targetKind: 'project', targetId: project.id, targetLabel: project.title,
      body: 'Do not interpret asset-sha256-not-a-real-reference in this note.', createdAt: '2026-09-03T00:00:00Z', replies: [],
    }];
    project.logo = 'asset-sha256-real-logo';
    project.people = [{ id: 'person-1', displayName: 'Alex', kind: 'crew', headshotAssetId: 'asset-sha256-headshot' }];
    project.trussProfiles = [{ id: 'profile-1', geometry: 'box', geometryAssetId: 'asset-sha256-truss-glb' }];

    expect(collectProjectAssetIds(project).sort()).toEqual([
      'asset-sha256-headshot', 'asset-sha256-real-logo', 'asset-sha256-truss-glb',
    ]);
    expect(collectProjectAssetReferences(project).find((reference) => reference.id === 'asset-sha256-truss-glb')).toMatchObject({ kind: 'geometry' });
  });
});
