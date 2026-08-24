/**
 * The AV-script CSV export — the gap Part 7 left open.
 *
 * This is the second of `ScriptPanel`'s two downloads and the second of the
 * three sites where a DETACHED anchor meant Firefox downloaded nothing at all.
 * The other two are guarded; this one was not, because the AV tab does not
 * render under the stub harness — `scriptFormatMode` is a real piece of
 * project state, and switching to that tab means writing it and letting the
 * panel's own effect follow.
 *
 * So this file uses `renderPanel`, which mounts the REAL provider. That makes
 * it an integration test rather than a stub test, and slower, which is the
 * price of covering a tab whose existence depends on persisted state.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { renderPanel } from './renderPanel';
import {
  captureDownloads,
  startsWithBom,
  type DownloadCapture,
} from '../../utils/__tests__/captureDownloads';

let capture: DownloadCapture;

beforeEach(() => {
  capture = captureDownloads();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Mount the panel, switch it to the AV tab, and put one row in it. */
const renderAVTab = async () => {
  const panel = await renderPanel({ module: 'script/ScriptPanel', exportName: 'ScriptPanel' });

  await panel.act(() => {
    panel.api().updateProjectMeta({ title: 'The Long Wait' });
    panel.api().setScriptFormatMode('av_script');
  });
  await panel.act(() => {
    panel.api().addAVScriptRow();
  });

  const rows = panel.api().avScriptRows ?? [];
  if (rows.length > 0) {
    await panel.act(() => {
      panel.api().updateAVScriptRow(rows[0].id, {
        shotName: 'Establisher',
        video: 'Diner exterior, rain',
        audio: 'Rain, room tone',
      });
    });
  }

  return panel;
};

const clickExport = async () =>
  fireEvent.click(await screen.findByTitle('Export AV script to CSV'));

describe('the AV script CSV export', () => {
  it('attaches the anchor before clicking it', async () => {
    // The Firefox bug. This export produced no file there at all, silently.
    await renderAVTab();
    await clickExport();
    expect((await capture.only()).attachedWhenClicked).toBe(true);
  });

  it('names the file after the production rather than a timestamp', async () => {
    // Was `av_script_${Date.now()}.csv`, so three exports in a row produced
    // three files nobody could tell apart.
    const panel = await renderAVTab();
    await panel.act(() => {
      panel.api().updateProjectMeta({ title: 'Ocean’s 11: Director/Draft "2"' });
    });
    await clickExport();
    const { filename } = await capture.only();
    expect(filename).toBe('Ocean’s_11_Director_Draft_2_AV_Script.csv');
    expect(filename).not.toMatch(/[/:"<>|?*\\]/);
  });

  it('writes a byte-order mark, for Excel', async () => {
    await renderAVTab();
    await clickExport();
    expect(startsWithBom((await capture.only()).bytes)).toBe(true);
  });

  it('carries the rows, not just the header', async () => {
    await renderAVTab();
    await clickExport();
    const { text } = await capture.only();
    expect(text).toContain('Shot Number');
    expect(text).toContain('Establisher');
    expect(text).toContain('Diner exterior, rain');
  });

  it('revokes the object URL it created', async () => {
    await renderAVTab();
    await clickExport();
    expect(capture.objectUrlsRevoked).toEqual(capture.objectUrlsCreated);
  });
});
