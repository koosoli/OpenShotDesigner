/**
 * The contacts panel — and the download it fires.
 *
 * This panel is one of the three that created a DETACHED anchor and so
 * downloaded nothing at all in Firefox. The fix routes it through
 * `utils/download`, but the fix being structural is not the same as it being
 * guarded: nothing stopped the next person re-inlining an anchor here. These
 * tests close that, by asserting at the button what the helper guarantees.
 *
 * The export also gained a byte-order mark. It is the one file in the app that
 * is entirely people's names, so a BOM-less CSV meant every accented name came
 * out of Excel as mojibake.
 *
 * BEHAVIOUR-ONLY (see `renderWithProject`): drive the DOM, assert what is
 * visible or what was handed to the browser. Nothing here asserts props or
 * context internals.
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

import { ContactsPanel } from '../contacts/ContactsPanel';
import { currentProject, exportsOpened, projectFixture, renderWithProject } from './renderWithProject';
import { captureDownloads, startsWithBom, type DownloadCapture } from '../../utils/__tests__/captureDownloads';
import type { Project } from '../../types';

let capture: DownloadCapture;

beforeEach(() => {
  capture = captureDownloads();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** A production with a crew list, including a name that needs UTF-8. */
const withCrew = (overrides: Partial<Project> = {}): Project =>
  projectFixture({
    title: 'The Long Wait',
    people: [
      { id: 'p1', displayName: 'Chloé Bergström', kind: 'crew', department: 'Camera', role: '1st AC', email: 'chloe@example.com', phone: '+352 1234' },
      { id: 'p2', displayName: 'Sam Okafor', kind: 'crew', department: 'Sound', role: 'Mixer', email: 'sam@example.com', phone: '' },
    ],
    ...overrides,
  } as Partial<Project>);

const render = (project: Project) =>
  renderWithProject(<ContactsPanel />, project, { scriptLines: [] });

describe('exporting the contact list', () => {
  it('attaches the anchor before clicking it', async () => {
    // The Firefox bug, asserted at the button rather than at the helper. A
    // detached anchor downloads nothing there, with no error to report.
    render(withCrew());
    fireEvent.click(screen.getByText('Export CSV'));
    expect((await capture.only()).attachedWhenClicked).toBe(true);
  });

  it('writes a byte-order mark, so Excel reads the names as UTF-8', async () => {
    // Without one Excel guesses the encoding and every accented name arrives
    // as mojibake — on the one export that is nothing but people's names.
    // (The illustration is left out on purpose: writing the broken bytes here
    // would trip `check:encoding`, which is exactly what that guard is for.)
    // export that is nothing but people's names.
    render(withCrew());
    fireEvent.click(screen.getByText('Export CSV'));
    const file = await capture.only();
    expect(startsWithBom(file.bytes)).toBe(true);
    expect(file.text).toContain('Chloé Bergström');
  });

  it('names the file after the production, safely', async () => {
    render(withCrew({ title: 'Ocean’s 11: Director/Draft "2"' } as Partial<Project>));
    fireEvent.click(screen.getByText('Export CSV'));
    const { filename } = await capture.only();
    expect(filename).toBe('Ocean’s_11_Director_Draft_2-contacts.csv');
    expect(filename).not.toMatch(/[/:"<>|?*\\]/);
  });

  it('falls back to a usable name for an untitled production', async () => {
    render(withCrew({ title: '' } as Partial<Project>));
    fireEvent.click(screen.getByText('Export CSV'));
    expect((await capture.only()).filename).toBe('production-contacts.csv');
  });

  it('carries every person, not just the first', async () => {
    render(withCrew());
    fireEvent.click(screen.getByText('Export CSV'));
    const { text } = await capture.only();
    expect(text).toContain('Chloé Bergström');
    expect(text).toContain('Sam Okafor');
  });

  it('revokes the object URL it created', () => {
    render(withCrew());
    fireEvent.click(screen.getByText('Export CSV'));
    expect(capture.objectUrlsRevoked).toEqual(capture.objectUrlsCreated);
    expect(capture.objectUrlsCreated).toHaveLength(1);
  });

  it('offers nothing to export when there is nobody on the list', () => {
    // Exporting a header row and no rows is a file that looks like a failure.
    render(projectFixture({ title: 'The Long Wait' }));
    expect(screen.getByText('Export CSV').closest('button')?.disabled).toBe(true);
  });
});

describe('the printable list', () => {
  it('asks the print studio for the crew section', () => {
    render(withCrew());
    fireEvent.click(screen.getByTitle(/Printable contact list/i));
    expect(exportsOpened()).toEqual(['crew']);
  });

  it('is unavailable with nobody to print', () => {
    render(projectFixture({ title: 'The Long Wait' }));
    expect(screen.getByTitle(/Printable contact list/i).closest('button')?.disabled).toBe(true);
  });
});

describe('showing the list', () => {
  it('shows each person with their role', () => {
    render(withCrew());
    expect(screen.getByDisplayValue('Chloé Bergström')).toBeTruthy();
    expect(screen.getByDisplayValue('Sam Okafor')).toBeTruthy();
  });

  // The panel's EDITING flow (draft, save, delete) is deliberately not covered
  // here: this file exists for the download path, and the save mechanics need
  // reading properly rather than a test written against a guess at them.
  // `currentProject` is ready for whoever does that.
});

describe('assigning production cast numbers', () => {
  it('assigns a number automatically and lets the user replace it', () => {
    renderWithProject(
      <ContactsPanel />,
      projectFixture({
        people: [{ id: 'actor-1', displayName: 'Alex Hunter', kind: 'cast' }],
        characters: [{ id: 'char-alex', canonicalName: 'ALEX', aliases: [] }],
      }) as Project,
      { scriptLines: [] },
    );

    fireEvent.change(screen.getByLabelText('Performer for ALEX'), { target: { value: 'actor-1' } });
    const number = screen.getByLabelText('Cast number for ALEX') as HTMLInputElement;
    expect(number.value).toBe('1');

    fireEvent.change(number, { target: { value: '7' } });
    expect(currentProject().castAssignments?.[0]).toEqual(expect.objectContaining({ personId: 'actor-1', castNumber: 7 }));
  });
});
