import { describe, expect, it } from 'vitest';
import { buildIntegrityReport } from '../integrityReport';
import type { Project } from '../../types';
import { makeCleanSetup, makeProject } from '../../utils/__tests__/fixtures';

const codes = (issues: Array<{ code: string }>) => issues.map((issue) => issue.code);

describe('buildIntegrityReport', () => {
  it('reports zeros plus a positive validReferences count on a clean project', () => {
    const report = buildIntegrityReport(makeProject([makeCleanSetup()]));
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
    expect(report.validReferences).toBeGreaterThan(0);
    expect(report.mediaVerified).toBe(0);
    expect(report.unreachableAssets).toEqual([]);
    expect(Number.isNaN(Date.parse(report.generatedAt))).toBe(false);
  });

  it('lands dangling references in errors and drops validReferences by one per issue', () => {
    const clean = buildIntegrityReport(makeProject([makeCleanSetup()]));
    const setup = makeCleanSetup();
    setup.shots[0].cameraId = 'ghost-cam';
    const broken = buildIntegrityReport(makeProject([setup]));
    expect(codes(broken.errors)).toContain('DANGLING_CAMERA_REF');
    expect(broken.validReferences).toBe(clean.validReferences - broken.errors.length);
  });

  it('lands review-target dangles in warnings, never errors', () => {
    const project = makeProject([makeCleanSetup()]) as Project;
    project.reviewComments = [
      { id: 'note-1', targetKind: 'shot', targetId: 'ghost-shot', targetLabel: 'x', body: 'x', createdAt: '', replies: [] },
    ] as Project['reviewComments'];
    const report = buildIntegrityReport(project);
    expect(report.errors).toEqual([]);
    expect(codes(report.warnings)).toContain('DANGLING_REVIEW_TARGET');
  });

  it('passes asset info through without touching storage', () => {
    const report = buildIntegrityReport(makeProject([makeCleanSetup()]), {
      verified: 7,
      unreachable: ['asset-b', 'asset-a'],
      reclaimableBytes: 1024,
    });
    expect(report.mediaVerified).toBe(7);
    expect(report.unreachableAssets).toEqual(['asset-b', 'asset-a']);
  });
});
