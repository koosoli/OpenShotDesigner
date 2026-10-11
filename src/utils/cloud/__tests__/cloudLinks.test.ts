/**
 * Cloud links: which file a project came from, at which version, and how the
 * next save must treat the server copy.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { cloudCopyFileName, planCloudSave, readCloudLink, writeCloudLink } from '../cloudLinks';

describe('cloud links', () => {
  beforeEach(() => localStorage.clear());

  it('remembers a link per project and provider', () => {
    writeCloudLink('p1', 'webdav', { fileName: 'film.osd', version: 'v1', syncedAt: '2026-10-11T10:00:00.000Z' });
    expect(readCloudLink('p1', 'webdav')).toEqual({ fileName: 'film.osd', version: 'v1', syncedAt: '2026-10-11T10:00:00.000Z' });
    expect(readCloudLink('p1', 'drive')).toBeUndefined();
    expect(readCloudLink('p2', 'webdav')).toBeUndefined();
  });

  it('survives unreadable storage', () => {
    localStorage.setItem('openshotdesigner_ui_cloud.links', '{nope');
    expect(readCloudLink('p1', 'webdav')).toBeUndefined();
  });
});

describe('planCloudSave', () => {
  it('updates the known version of a linked file', () => {
    expect(planCloudSave({ fileName: 'film.osd', version: 'v1', syncedAt: '' }, 'other.osd', [{ name: 'film.osd' }]))
      .toEqual({ kind: 'update', fileName: 'film.osd', version: 'v1' });
  });

  it('creates when nothing of that name is there', () => {
    expect(planCloudSave(undefined, 'film.osd', [{ name: 'x.osd' }])).toEqual({ kind: 'create', fileName: 'film.osd' });
  });

  it('asks before touching a same-named file this browser never saw', () => {
    expect(planCloudSave(undefined, 'film.osd', [{ name: 'film.osd', modified: 'yesterday' }]))
      .toEqual({ kind: 'ask', fileName: 'film.osd', remoteModified: 'yesterday' });
  });
});

describe('cloudCopyFileName', () => {
  it('stamps a copy before the extension', () => {
    expect(cloudCopyFileName('film.osd', new Date(2026, 9, 11, 14, 5))).toBe('film (copy 2026-10-11 14.05).osd');
  });
});
