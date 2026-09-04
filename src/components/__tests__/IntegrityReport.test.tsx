/**
 * IntegrityReport component: summary counts plus grouped, inspectable
 * issues. BEHAVIOUR-ONLY (see `renderWithProject`): render with a
 * ready-built report, assert what is visible, drive it through the DOM.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../context/WorkspaceUIContext', async () => {
  const harness = await import('./renderWithProject');
  return { useWorkspaceUI: () => harness.currentWorkspaceUI() };
});

import { IntegrityReport } from '../dashboard/IntegrityReport';
import { buildIntegrityReport } from '../../domain/integrityReport';
import type { ValidationIssue } from '../../domain/validation';
import { makeCleanSetup, makeProject } from '../../utils/__tests__/fixtures';
import { projectFixture, renderWithProject } from './renderWithProject';

afterEach(cleanup);

const reportWithIssues = () => {
  const setup = makeCleanSetup();
  setup.shots[0].cameraId = 'ghost-cam';
  const project = makeProject([setup]);
  project.reviewComments = [
    { id: 'note-1', targetKind: 'shot', targetId: 'ghost-shot', targetLabel: 'x', body: 'x', createdAt: '', replies: [] },
  ] as typeof project.reviewComments;
  return buildIntegrityReport(project, { verified: 3, unreachable: ['asset-a'], reclaimableBytes: 10 });
};

describe('IntegrityReport', () => {
  it('renders the summary counts', () => {
    const report = buildIntegrityReport(makeProject([makeCleanSetup()]));
    renderWithProject(<IntegrityReport report={report} />, projectFixture());
    expect(screen.getByText(/valid references/)).toBeTruthy();
    expect(screen.getByText(/0 warnings/)).toBeTruthy();
    expect(screen.getByText(/0 errors/)).toBeTruthy();
    expect(screen.getByText(/No broken references/)).toBeTruthy();
  });

  it('groups errors and warnings with their codes', () => {
    renderWithProject(<IntegrityReport report={reportWithIssues()} />, projectFixture());
    expect(screen.getByText(/Errors · 1/)).toBeTruthy();
    expect(screen.getByText(/Warnings · 1/)).toBeTruthy();
    expect(screen.getByText('DANGLING_CAMERA_REF')).toBeTruthy();
    expect(screen.getByText('DANGLING_REVIEW_TARGET')).toBeTruthy();
    expect(screen.getByText('asset-a')).toBeTruthy();
  });

  it('notifies the caller when an issue is selected', async () => {
    const user = userEvent.setup();
    const seen: ValidationIssue[] = [];
    renderWithProject(
      <IntegrityReport report={reportWithIssues()} onSelectIssue={(issue) => seen.push(issue)} />,
      projectFixture(),
    );
    await user.click(screen.getByText('DANGLING_CAMERA_REF'));
    expect(seen.map((issue) => issue.code)).toEqual(['DANGLING_CAMERA_REF']);
  });

  it('closes through the close button', async () => {
    const user = userEvent.setup();
    let closed = 0;
    const report = buildIntegrityReport(makeProject([makeCleanSetup()]));
    renderWithProject(<IntegrityReport report={report} onClose={() => { closed += 1; }} />, projectFixture());
    await user.click(screen.getByRole('button', { name: 'Close integrity report' }));
    expect(closed).toBe(1);
  });
});
