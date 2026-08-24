/**
 * What the real export buttons actually hand to the browser.
 *
 * `download.test.ts` covers the helper; this covers the CONTRACTS the helper
 * cannot know about — which file gets a byte-order mark and which must not,
 * and what each one is called. Both are decided per exporter, both fail
 * silently when wrong, and neither had a test.
 *
 * The Resolve case is the sharpest: a BOM there is not a cosmetic problem. It
 * glues an invisible U+FEFF to the first header, `File Name` stops matching,
 * and Resolve reports a successful import that populated nothing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureDownloads, startsWithBom, type DownloadCapture } from './captureDownloads';
import { makeProject, makeSetup, makeShot } from './fixtures';
import { exportProjectToCsv, exportShotListToCsv } from '../exportShotList';
import { exportEquipmentToCsv } from '../exportEquipmentCsv';
import { exportContinuityAle, exportContinuityCsv } from '../exportContinuityCsv';
import type { Project } from '../../types';
import type { Take } from '../../domain/continuity';

let capture: DownloadCapture;

beforeEach(() => {
  capture = captureDownloads();
});
afterEach(() => vi.restoreAllMocks());

/** A project whose title is exactly the kind that used to break a filename. */
const awkwardTitle = 'Ocean’s 11: Director/Draft "2"';

/** `makeProject` takes setups first; this keeps the cases about the title. */
const projectTitled = (title: string, setups?: Project['setups']): Project =>
  makeProject(setups, { title });

const takes: Take[] = [
  { id: 't1', shotId: 'shot-1', takeNumber: 1, fileName: 'A001C001.mov', isGoodTake: true },
];

describe('every export attaches its anchor before clicking', () => {
  /**
   * The Firefox bug, asserted once per path. Three of these created a detached
   * anchor and downloaded nothing there — silently, with no error to report.
   */
  const paths: Array<[string, (project: Project) => void]> = [
    ['shot list', (project) => exportShotListToCsv(project.setups[0], project.title)],
    ['full shot list', (project) => exportProjectToCsv(project)],
    ['equipment manifest', (project) => exportEquipmentToCsv(project.setups[0], project.title)],
    ['continuity CSV', (project) => exportContinuityCsv(project, takes)],
    ['continuity ALE', (project) => exportContinuityAle(project, takes)],
  ];

  for (const [name, run] of paths) {
    it(name, async () => {
      run(projectTitled('The Long Wait'));
      expect((await capture.only()).attachedWhenClicked).toBe(true);
    });
  }
});

describe('every export revokes the object URL it created', () => {
  it('leaks nothing', () => {
    const project = projectTitled('The Long Wait');
    exportShotListToCsv(project.setups[0], project.title);
    exportContinuityCsv(project, takes);
    expect(capture.objectUrlsRevoked).toEqual(capture.objectUrlsCreated);
    expect(capture.objectUrlsCreated.length).toBe(2);
  });
});

describe('byte-order marks', () => {
  it('the Resolve CSV has none', async () => {
    // The contract this whole feature is built around. With a BOM the first
    // header is no longer "File Name" and Resolve matches nothing.
    exportContinuityCsv(projectTitled('The Long Wait'), takes);
    const file = await capture.only();
    expect(startsWithBom(file.bytes)).toBe(false);
    expect(file.text.startsWith('File Name,')).toBe(true);
  });

  it('the ALE has none, and keeps its CRLF', async () => {
    exportContinuityAle(projectTitled('The Long Wait'), takes);
    const file = await capture.only();
    expect(startsWithBom(file.bytes)).toBe(false);
    expect(file.text.startsWith('Heading')).toBe(true);
    expect(file.text).toContain('\r\n');
  });

  it('the equipment manifest has one, for Excel', async () => {
    const project = projectTitled('The Long Wait');
    exportEquipmentToCsv(project.setups[0], project.title);
    expect(startsWithBom((await capture.only()).bytes)).toBe(true);
  });

  it('the shot list has one, for Excel', async () => {
    // It did not before this pass — so a scene name or a note with an accent
    // in it came out as mojibake the moment anyone opened the file.
    const project = projectTitled('The Long Wait');
    exportShotListToCsv(project.setups[0], project.title);
    expect(startsWithBom((await capture.only()).bytes)).toBe(true);
  });
});

describe('filenames survive a title the filesystem would refuse', () => {
  it('the full shot list', async () => {
    exportProjectToCsv(projectTitled(awkwardTitle));
    const { filename } = await capture.only();
    expect(filename).toBe('Ocean’s_11_Director_Draft_2_Full_ShotList.csv');
    expect(filename).not.toMatch(/[/:"<>|?*\\]/);
  });

  it('the equipment manifest', async () => {
    const project = projectTitled(awkwardTitle);
    exportEquipmentToCsv(project.setups[0], project.title);
    expect((await capture.only()).filename).not.toMatch(/[/:"<>|?*\\]/);
  });

  it('the continuity CSV', async () => {
    exportContinuityCsv(projectTitled(awkwardTitle), takes);
    expect((await capture.only()).filename).not.toMatch(/[/:"<>|?*\\]/);
  });

  it('a project nobody has titled still exports something openable', async () => {
    exportProjectToCsv(projectTitled(''));
    const { filename } = await capture.only();
    expect(filename).toBe('Production_Full_ShotList.csv');
  });

  it('a scene named with a slash does not become a path', async () => {
    const setup = makeSetup({
      sceneNumber: '4',
      name: 'INT/EXT. CAR - NIGHT',
      shots: [makeShot()],
    });
    exportShotListToCsv(setup, 'The Long Wait');
    const { filename } = await capture.only();
    expect(filename).toBe('ShotList_Scene_4_INT_EXT._CAR_-_NIGHT.csv');
    expect(filename).not.toContain('/');
  });
});

describe('the exported bytes are the exported bytes', () => {
  it('the shot list carries its rows, not just a header', async () => {
    const setup = makeSetup({ sceneNumber: '4', shots: [makeShot({ shotNumber: '4A' })] });
    exportShotListToCsv(setup, 'The Long Wait');
    const { text } = await capture.only();
    expect(text).toContain('4A');
  });

  it('the continuity CSV carries the take, not just the template header', async () => {
    exportContinuityCsv(projectTitled('The Long Wait'), takes);
    const { text } = await capture.only();
    expect(text).toContain('A001C001.mov');
  });
});
