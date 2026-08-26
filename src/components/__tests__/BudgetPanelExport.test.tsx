/**
 * The budget CSV download.
 *
 * This one was never broken — its anchor was always attached — but it was
 * uncovered, and it carries the contract most easily lost: the byte-order mark
 * that makes Excel read the euro column as UTF-8. Drop it and every figure
 * still adds up while every currency symbol turns to mojibake, which reads as
 * a font problem and gets debugged as one.
 *
 * It also had its own filename sanitiser until this pass, so an untitled
 * production exported as `Budget_.csv`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';

vi.mock('../../context/FloorPlanContext', async () => {
  const harness = await import('./renderWithProject');
  return { useFloorPlan: () => harness.currentDeps() };
});
vi.mock('../../context/WorkspaceUIContext', async () => {
  const harness = await import('./renderWithProject');
  return { useWorkspaceUI: () => harness.currentWorkspaceUI() };
});

import { BudgetPanel } from '../budget/BudgetPanel';
import { currentProject, projectFixture, renderWithProject } from './renderWithProject';
import {
  captureDownloads,
  startsWithBom,
  type DownloadCapture,
} from '../../utils/__tests__/captureDownloads';
import type { Project } from '../../types';
import { SAMPLE_SCENES } from '../../constants/presets';

let capture: DownloadCapture;

beforeEach(() => {
  capture = captureDownloads();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const render = (title: string) =>
  renderWithProject(<BudgetPanel />, projectFixture({ title }) as Project, {}, {
    setActiveRightTab: () => {},
  });

/** The export control, whatever it is labelled. */
const exportButton = () =>
  screen.getAllByRole('button').find((b) => /csv|export/i.test(b.textContent ?? '')) as HTMLElement;

describe('exporting the budget', () => {
  it('attaches the anchor before clicking it', async () => {
    render('The Long Wait');
    fireEvent.click(exportButton());
    expect((await capture.only()).attachedWhenClicked).toBe(true);
  });

  it('writes a byte-order mark, so Excel reads the currency as UTF-8', async () => {
    // Without one the numbers survive and the symbols do not, which looks
    // like a font bug and is not one.
    render('The Long Wait');
    fireEvent.click(exportButton());
    expect(startsWithBom((await capture.only()).bytes)).toBe(true);
  });

  it('names the file after the production, safely', async () => {
    render('Ocean’s 11: Director/Draft "2"');
    fireEvent.click(exportButton());
    const { filename } = await capture.only();
    expect(filename).toBe('Budget_Ocean’s_11_Director_Draft_2.csv');
    expect(filename).not.toMatch(/[/:"<>|?*\\]/);
  });

  it('falls back for an untitled production', async () => {
    // Was `Budget_.csv` — a file named after nothing.
    render('');
    fireEvent.click(exportButton());
    expect((await capture.only()).filename).toBe('Budget_Production.csv');
  });

  it('revokes the object URL', () => {
    render('The Long Wait');
    fireEvent.click(exportButton());
    expect(capture.objectUrlsRevoked).toEqual(capture.objectUrlsCreated);
  });
});

describe('editing actual costs', () => {
  it('edits an existing actor line directly and stores the exact total against it', () => {
    renderWithProject(<BudgetPanel />, projectFixture({
      people: [{ id: 'actor-1', displayName: 'Alex Hunter', kind: 'cast', rateCard: { amount: 400, basis: 'flat' } }],
    }) as Project, {}, { setActiveRightTab: () => {} });

    fireEvent.click(screen.getByRole('button', { name: 'Actuals' }));
    const input = screen.getByLabelText('Exact actual for Alex Hunter');
    fireEvent.change(input, { target: { value: '475' } });

    expect(currentProject().budget?.actuals).toEqual([
      expect.objectContaining({ entryId: 'person:actor-1', label: 'Alex Hunter', category: 'above_the_line', amount: 475 }),
    ]);
    expect(screen.getAllByText(/\+.*75/).length).toBeGreaterThan(0);
  });

  it('offers known equipment even before it has a planned rate', () => {
    renderWithProject(<BudgetPanel />, projectFixture({ setups: [SAMPLE_SCENES[0]] }) as Project, {}, { setActiveRightTab: () => {} });

    fireEvent.click(screen.getByRole('button', { name: 'Actuals' }));
    const input = screen.getByLabelText('Exact actual for ARRI Alexa Mini LF');
    expect(screen.getAllByText('Not priced').length).toBeGreaterThan(0);
    fireEvent.change(input, { target: { value: '900' } });

    expect(currentProject().budget?.actuals).toEqual([
      expect.objectContaining({ category: 'equipment', label: 'ARRI Alexa Mini LF', amount: 900 }),
    ]);
  });
});
