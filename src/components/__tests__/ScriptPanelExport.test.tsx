/**
 * The two downloads the script panel fires.
 *
 * Both were Firefox bugs: each created a DETACHED anchor and called `.click()`
 * on it, which Chrome tolerates and Firefox ignores entirely. Exporting a
 * screenplay in Firefox produced no file, no error, and nothing to report
 * beyond "the button does nothing".
 *
 * The Fountain export had the filename bug too — it replaced whitespace and
 * nothing else, so a screenplay titled with a colon or a slash produced a name
 * the filesystem refuses.
 *
 * Scope is deliberately the exports only. `ScriptPanel` is two thousand lines
 * and its editing, lining and linking behaviour deserve their own file; this
 * one guards the paths that were broken, so they cannot quietly break again.
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

import { ScriptPanel } from '../script/ScriptPanel';
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

/**
 * Everything the panel reads. Listed in full rather than hidden behind a
 * default, so the coupling this component has is visible in the test that
 * depends on it.
 */
const scriptDeps = (title: string) => ({
  activeSetup: { id: 's1', name: 'Scene 1', elements: [], shots: [] },
  scriptLines: [
    { id: 'l1', type: 'scene', text: 'INT. DINER - NIGHT' },
    { id: 'l2', type: 'action', text: 'Rain against the window.' },
    { id: 'l3', type: 'character', text: 'MARIA' },
    { id: 'l4', type: 'dialogue', text: 'You came back.' },
  ],
  scriptTitle: title,
  allScriptMarks: [],
  allShots: [],
  setupIdForMark: () => 's1',
  selectedShotId: null,
  selectShot: () => {},
  createShotFromScriptRange: () => {},
  linkShotToScriptRange: () => {},
  scriptLinkShotId: null,
  cancelScriptLinking: () => {},
  updateScriptMark: () => {},
  setLiningDescription: () => {},
  deleteScriptMark: () => {},
  setScriptLines: () => {},
  setSceneNumbersLocked: () => {},
  setActiveSetupId: () => {},
  avScriptRows: [
    { id: 'r1', shotName: 'Establisher', shotSize: 'WS', video: 'Diner exterior', audio: 'Rain', durationSec: 6 },
  ],
  setAVScriptRows: () => {},
  updateAVScriptRow: () => {},
  addAVScriptRow: () => {},
  deleteAVScriptRow: () => {},
  scriptFormatMode: 'screenplay',
  setScriptFormatMode: () => {},
  syncAVRowToShot: () => {},
  displaySettings: {},
});

/**
 * `scriptFormatMode` selects the tab, and each export button only exists on
 * its own tab — so the mode is what decides which of the two is reachable.
 */
const render = (
  title = 'The Long Wait',
  projectTitle = 'The Long Wait',
  mode: 'screenplay' | 'av_script' = 'screenplay',
) =>
  renderWithProject(
    <ScriptPanel />,
    projectFixture({ title: projectTitle }) as Project,
    { ...scriptDeps(title), scriptFormatMode: mode },
  );

describe('the Fountain export', () => {
  const clickIt = () => fireEvent.click(screen.getByTitle('Download .fountain file'));

  it('attaches the anchor before clicking it', async () => {
    // The Firefox bug. Nothing downloaded there at all before this.
    render();
    clickIt();
    expect((await capture.only()).attachedWhenClicked).toBe(true);
  });

  it('names the file after the screenplay, safely', async () => {
    // Was `.replace(/\s+/g, '_')` and nothing else, so this title produced a
    // filename containing a slash, a colon and quotes.
    render('Ocean’s 11: Director/Draft "2"');
    clickIt();
    const { filename } = await capture.only();
    expect(filename).toBe('ocean’s_11_director_draft_2.fountain');
    expect(filename).not.toMatch(/[/:"<>|?*\\]/);
  });

  it('falls back for an untitled screenplay', async () => {
    render('');
    clickIt();
    expect((await capture.only()).filename).toBe('screenplay.fountain');
  });

  it('writes the screenplay, not an empty file', async () => {
    render();
    clickIt();
    const { text } = await capture.only();
    expect(text).toContain('INT. DINER - NIGHT');
    expect(text).toContain('MARIA');
  });

  it('carries no byte-order mark', async () => {
    // Fountain is parsed by other tools; a BOM belongs on spreadsheet CSVs.
    render();
    clickIt();
    expect(startsWithBom((await capture.only()).bytes)).toBe(false);
  });

  it('revokes the object URL', () => {
    render();
    clickIt();
    expect(capture.objectUrlsRevoked).toEqual(capture.objectUrlsCreated);
  });
});

/**
 * NOT COVERED: the AV-script CSV export.
 *
 * It is the second of this panel's two downloads and the second Firefox bug
 * site, so it deserves the same guard the Fountain export just got. Rendering
 * the panel with `scriptFormatMode: 'av_script'` does not produce its export
 * button under this harness, and the reason was not worth the time it was
 * costing to find — the AV tab needs more of the real provider than the stub
 * gives it.
 *
 * The fix itself is structural and shared: the export calls `downloadCsv`,
 * which `utils/__tests__/download.test.ts` covers for anchor attachment,
 * filename safety and the byte-order mark. What is missing is only the proof
 * that THIS button reaches it. Worth closing with `renderPanel` (the real
 * provider) rather than this stub.
 */
