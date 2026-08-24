/**
 * The project JSON backup download.
 *
 * This is the sharper of the two filename bugs. It sanitised whitespace and
 * nothing else — `.toLowerCase().replace(/\s+/g, '_')` — so a production
 * called `Ocean's 11: Director/Draft "2"` produced a download name carrying a
 * slash, a colon and quotes. Those are illegal on Windows and the slash reads
 * as a path separator, so the browser mangled the name or refused the download
 * outright.
 *
 * It matters more here than anywhere else in the app: this file IS the
 * project. A backup that will not save is the one failure a user discovers
 * only when they need it.
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

import { TopNavbar } from '../toolbar/TopNavbar';
import { projectFixture, renderWithProject } from './renderWithProject';
import {
  captureDownloads,
  startsWithBom,
  type DownloadCapture,
} from '../../utils/__tests__/captureDownloads';
import type { Project } from '../../types';

let capture: DownloadCapture;

beforeEach(() => {
  capture = captureDownloads();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Everything the navbar reads, stated in full so its coupling is visible. */
const navDeps = () => ({
  activeSetup: { id: 's1', name: 'Scene 1', elements: [], shots: [], gridSettings: undefined },
  historyIndex: 0,
  historyLength: 1,
  undo: () => {},
  redo: () => {},
  setActiveSetupId: () => {},
  addSetup: () => {},
  duplicateCurrentSetup: () => {},
  deleteSetup: () => {},
  saveRevision: () => {},
  loadTemplateScene: () => {},
  loadExampleProductionData: () => {},
  loadProjectFromJson: () => {},
  setGridSettings: () => {},
  openViewfinder: () => {},
  displaySettings: {},
  updateDisplaySettings: () => {},
  isModuleVisible: () => true,
  setModuleVisible: () => {},
});

const render = (title: string) =>
  renderWithProject(
    <TopNavbar />,
    projectFixture({
      title,
      // Cast at the edge: the navbar reads only id/name/elements/shots off a
      // setup, and spelling out all nine fields would obscure that.
      setups: [{ id: 's1', name: 'Scene 1', elements: [], shots: [] }] as unknown as Project['setups'],
    }) as Project,
    navDeps(),
    { toggleTheme: () => {}, openDashboard: () => {} },
  );

const saveJson = () => fireEvent.click(screen.getByLabelText('Save & Download Project JSON'));

describe('the project JSON backup', () => {
  it('attaches the anchor before clicking it', async () => {
    render('The Long Wait');
    saveJson();
    expect((await capture.only()).attachedWhenClicked).toBe(true);
  });

  it('survives a title the filesystem would refuse', async () => {
    // The bug: this produced a name containing `/`, `:` and `"`.
    render('Ocean’s 11: Director/Draft "2"');
    saveJson();
    const { filename } = await capture.only();
    expect(filename).toBe('ocean’s_11_director_draft_2_openshotdesigner.json');
    expect(filename).not.toMatch(/[/:"<>|?*\\]/);
  });

  it('falls back for an untitled production', async () => {
    // Was `_openshotdesigner.json` — a name starting with an underscore,
    // after a title that contributed nothing.
    render('');
    saveJson();
    expect((await capture.only()).filename).toBe('project_openshotdesigner.json');
  });

  it('writes the project as readable JSON', async () => {
    render('The Long Wait');
    saveJson();
    const { text } = await capture.only();
    expect(JSON.parse(text).title).toBe('The Long Wait');
  });

  it('carries no byte-order mark, which would break JSON.parse', async () => {
    // `JSON.parse` throws on a leading U+FEFF. This is the one export where a
    // BOM is not a formatting nuisance but a file nothing can read back.
    render('The Long Wait');
    saveJson();
    const file = await capture.only();
    expect(startsWithBom(file.bytes)).toBe(false);
    expect(() => JSON.parse(file.text)).not.toThrow();
  });

  it('revokes the object URL', () => {
    render('The Long Wait');
    saveJson();
    expect(capture.objectUrlsRevoked).toEqual(capture.objectUrlsCreated);
  });
});
