import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import type { Project } from '../../types';
import * as library from '../../utils/projectLibrary';
import { useProjectHistory } from '../../context/useProjectHistory';
import { useCollaboration } from '../useCollaboration';
import { CollaborationSession } from '../session';
import { roomProject, seedDocument, readDocument, writeLocalChanges } from '../model';
import * as invitation from '../invite';

const clone = (p: Project): Project => structuredClone(p);
let current: CollaborationSession;
const sessions: CollaborationSession[] = [];
beforeEach(() => {
  localStorage.clear();
  vi.spyOn(CollaborationSession.prototype, 'open').mockImplementation(async function (this: CollaborationSession, seed?: Project) {
    // Capture the real instance; only cache/network startup is replaced here.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    current = this; sessions.push(this);
    if (seed) seedDocument(this.doc, seed);
  });
  vi.spyOn(invitation, 'requestInvite').mockImplementation(async (relay) => invitation.createInvite(relay));
});
afterEach(() => { cleanup(); sessions.splice(0).forEach((s) => s.close()); vi.restoreAllMocks(); });
function editor() {
  return renderHook(() => {
    const [project, rawSet] = useState(() => library.createProject({ title: 'Original' }));
    const collaboration = useCollaboration(project, rawSet);
    const history = useProjectHistory(project, rawSet, collaboration);
    return { project, rawSet, collaboration, history };
  });
}
async function start(hook: ReturnType<typeof editor>) {
  await act(async () => { await hook.result.current.collaboration.start('ws://localhost:1234'); });
  await waitFor(() => expect(hook.result.current.project.title).toContain('shared plan'));
}
function incoming(update: (p: Project) => void) {
  const peer = new Y.Doc(); Y.applyUpdate(peer, Y.encodeStateAsUpdate(current.doc));
  const before = readDocument(peer)!; const after = clone(before); update(after);
  writeLocalChanges(peer, before, after);
  Y.applyUpdate(current.doc, Y.encodeStateAsUpdate(peer), 'network'); peer.destroy();
}

describe('real collaboration/editor lifecycle with transport isolated', () => {
  it('starts the default direct session without requesting a server invite or operator credentials', async () => {
    const hook = editor();
    await act(async () => { await hook.result.current.collaboration.startDirect(); });
    await waitFor(() => expect(hook.result.current.project.title).toContain('shared plan'));
    expect(invitation.requestInvite).not.toHaveBeenCalled();
    expect(hook.result.current.collaboration.invite?.relay).toBe(invitation.DIRECT_RELAY);
  });
  it('cancels a direct start before its asynchronous modules finish loading', async () => {
    const hook = editor(); let pending!: Promise<void>;
    await act(async () => {
      pending = hook.result.current.collaboration.startDirect();
      hook.result.current.collaboration.leave(); await pending;
    });
    expect(CollaborationSession.prototype.open).not.toHaveBeenCalled();
    expect(hook.result.current.project.title).toBe('Original');
  });
  it('preserves a queued local action and an independent incoming action in the same React batch, with local-only undo', async () => {
    const hook = editor(); await start(hook);
    const originalX = hook.result.current.project.setups[0].elements[0].x;
    const setter = hook.result.current.history.setProject;
    act(() => {
      hook.result.current.history.setProject((prev) => {
        const next = clone(prev); next.setups[0].elements[0].x = 12345; return next;
      });
      incoming((p) => { p.setups[0].name = 'Remote scene'; });
    });
    expect(hook.result.current.project.setups[0].elements[0].x).toBe(12345);
    expect(hook.result.current.project.setups[0].name).toBe('Remote scene');
    expect(readDocument(current.doc)!.setups[0].elements[0].x).toBe(12345);
    expect(hook.result.current.history.setProject).toBe(setter);
    act(() => hook.result.current.collaboration.undo());
    expect(hook.result.current.project.setups[0].elements[0].x).toBe(originalX);
    expect(hook.result.current.project.setups[0].name).toBe('Remote scene');
    expect(current.undoManager.canUndo()).toBe(false);
  });

  it('keeps multiple queued local actions together without echoing the received state', async () => {
    const hook = editor(); await start(hook);
    act(() => {
      for (const x of [101, 102]) hook.result.current.history.setProject((prev) => {
        const next = clone(prev); next.setups[0].elements[0].x = x; return next;
      });
      incoming((p) => { p.setups[0].elements[1].rotation = 77; });
    });
    expect(hook.result.current.project.setups[0].elements[0].x).toBe(102);
    expect(hook.result.current.project.setups[0].elements[1].rotation).toBe(77);
    const updates = vi.fn(); current.doc.on('update', updates);
    act(() => incoming((p) => { p.setups[0].name = 'Again'; }));
    expect(updates).toHaveBeenCalledTimes(1);
  });

  it('stops sharing when a second scene is added and keeps that whole local project', async () => {
    const hook = editor(); await start(hook);
    act(() => hook.result.current.history.setProject((prev) => {
      const next = clone(prev); next.setups.push({ ...clone(prev).setups[0], id: 'additional-plan' }); return next;
    }));
    expect(hook.result.current.project.setups).toHaveLength(2);
    expect(hook.result.current.collaboration.active).toBe(false);
    expect(hook.result.current.collaboration.status?.error).toContain('one fixed plan');
  });

  it.each(['leave', 'switch', 'unmount'] as const)('cancels delayed room creation on %s and ignores even a late successful response', async (action) => {
    let resolve!: (invite: invitation.Invite) => void;
    let signal: AbortSignal | undefined;
    vi.mocked(invitation.requestInvite).mockImplementation((_relay, _key, abort) => {
      signal = abort; return new Promise((done) => { resolve = done; });
    });
    const hook = editor(); const original = hook.result.current.project;
    let pending!: Promise<void>;
    act(() => { pending = hook.result.current.collaboration.start('ws://localhost:1234'); });
    await waitFor(() => expect(resolve).toBeTypeOf('function'));
    act(() => {
      if (action === 'leave') hook.result.current.collaboration.leave();
      if (action === 'switch') hook.result.current.rawSet(library.createProject({ title: 'Different project' }));
      if (action === 'unmount') hook.unmount();
    });
    expect(signal?.aborted).toBe(true);
    await act(async () => { resolve(invitation.createInvite('ws://localhost:1234')); await pending; });
    expect(CollaborationSession.prototype.open).not.toHaveBeenCalled();
    if (action !== 'unmount') {
      expect(hook.result.current.collaboration.active).toBe(false);
      expect(hook.result.current.project.title).toBe(action === 'switch' ? 'Different project' : original.title);
    }
  });

  it('does not attach a late plan after switching away while waiting for a room', async () => {
    const hook = editor();
    await act(async () => { await hook.result.current.collaboration.join(invitation.createInvite('ws://localhost:1234')); });
    act(() => hook.result.current.rawSet(library.createProject({ title: 'Opened elsewhere' })));
    expect(hook.result.current.collaboration.active).toBe(false);
    expect(hook.result.current.project.title).toBe('Opened elsewhere');
  });

  it('saves the latest original before entering a separate room copy', async () => {
    const hook = editor(); const id = hook.result.current.project.id;
    await act(async () => {
      hook.result.current.history.setProject((p) => ({ ...p, title: 'Just typed' }));
      await hook.result.current.collaboration.join(invitation.createInvite('ws://localhost:1234'));
    });
    act(() => seedDocument(current.doc, roomProject(library.createProject({ title: 'Shared' }))));
    await waitFor(() => expect(hook.result.current.project.title).toBe('Shared — shared plan'));
    expect(library.readProject(id)?.title).toBe('Just typed');
    expect(hook.result.current.project.id).not.toBe(id);
  });

  it('retains the original when saving it before joining fails', async () => {
    const hook = editor(); const original = hook.result.current.project;
    vi.spyOn(library, 'writeProject').mockImplementation(() => { throw new Error('Storage quota exceeded'); });
    await act(async () => { await hook.result.current.collaboration.start('ws://localhost:1234'); });
    expect(hook.result.current.project).toBe(original);
    expect(hook.result.current.collaboration.active).toBe(false);
    expect(hook.result.current.collaboration.status?.error).toContain('Storage quota');
  });
});
