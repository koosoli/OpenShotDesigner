import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { CollaborationSession, type SessionStatus } from '../session';
import { BrowserValidation } from '../browserValidation';
import { RoomCache } from '../roomCache';
import { createInvite, type Invite } from '../invite';
import { createProject } from '../../utils/projectLibrary';
import { readDocument, roomProject } from '../model';
import { validateIncomingUpdate } from '../validateUpdate';

class Socket {
  static readonly OPEN = 1; static readonly CONNECTING = 0;
  static instances: Socket[] = [];
  readyState = 0; sent: Array<{ type: string; id: number; data: string }> = [];
  onopen: (() => void) | null = null; onclose: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() { Socket.instances.push(this); }
  send(data: string) { this.sent.push(JSON.parse(data)); }
  close() { this.readyState = 3; queueMicrotask(() => this.onclose?.()); }
  open() { this.readyState = 1; this.onopen?.(); }
  receive(data: unknown) { this.onmessage?.({ data: JSON.stringify(data) }); }
}
const sessions: CollaborationSession[] = [];
beforeEach(() => {
  Socket.instances = [];
  vi.stubGlobal('WebSocket', Socket); vi.stubGlobal('crypto', webcrypto);
  vi.spyOn(BrowserValidation.prototype, 'validate').mockImplementation(async (snapshot, update) => { validateIncomingUpdate(snapshot, update); });
});
afterEach(() => { sessions.splice(0).forEach((s) => s.close()); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function session(invite: Invite = createInvite('ws://localhost:1234')) {
  const updates: ReturnType<typeof roomProject>[] = []; const states: SessionStatus[] = [];
  const current = new CollaborationSession(invite, (project) => updates.push(project), (state) => states.push(state));
  sessions.push(current); return { current, updates, states };
}
const seed = () => roomProject(createProject({ title: 'Session test' }));

describe('actual session state and transport callbacks', () => {
  it('ignores an old socket opening after offline/online replaced it', async () => {
    const { current, states } = session(); await current.open(seed());
    const old = Socket.instances[0];
    window.dispatchEvent(new Event('offline')); window.dispatchEvent(new Event('online'));
    const replacement = Socket.instances[1]; expect(replacement).toBeDefined();
    old.open(); expect(old.sent).toHaveLength(0); expect(states.at(-1)?.connected).toBe(false);
    replacement.open(); expect(replacement.sent).toHaveLength(1); expect(states.at(-1)?.connected).toBe(true);
  });

  it('acknowledges only outstanding sequences and does not report the initial seed as a reconnect conflict', async () => {
    const { current, states } = session(); await current.open(seed());
    const socket = Socket.instances[0]; socket.open();
    expect(states.at(-1)?.reconciled).toBe(false);
    socket.receive({ type: 'ack', id: socket.sent[0].id });
    await vi.waitFor(() => expect(states.at(-1)?.pending).toBe(false));
  });

  it('recovers the final offline edit from a compact persisted snapshot', async () => {
    const invite = createInvite('ws://localhost:1234'); const first = session(invite);
    await first.current.open(seed());
    const before = readDocument(first.current.doc)!; const after = structuredClone(before);
    after.setups[0].name = 'Last offline edit'; first.current.write(before, after); first.current.close();
    const second = session(invite); await second.current.open();
    expect(second.updates.at(-1)?.setups[0].name).toBe('Last offline edit');
    expect(second.states.at(-1)?.cached).toBe(true);
  });

  it('validates cached binary before applying it and continues without a poisoned cache', async () => {
    vi.spyOn(RoomCache.prototype, 'load').mockResolvedValue(new Uint8Array([255, 255, 255]));
    const { current, states } = session(); await current.open(seed());
    expect(readDocument(current.doc)?.title).toContain('Session test');
    expect(states.at(-1)?.cached).toBe(false); expect(states.at(-1)?.error).toBeTruthy();
    expect(Socket.instances).toHaveLength(1);
  });

  it('flushes the last edit on pagehide before the cache debounce fires', async () => {
    const invite = createInvite('ws://localhost:1234'); const first = session(invite);
    await first.current.open(seed());
    const before = readDocument(first.current.doc)!; const after = structuredClone(before);
    after.setups[0].name = 'Last edit before pagehide'; first.current.write(before, after);
    window.dispatchEvent(new Event('pagehide'));
    const second = session(invite); await second.current.open();
    expect(second.updates.at(-1)?.setups[0].name).toBe('Last edit before pagehide');
  });

  it('never applies a cache response arriving after close', async () => {
    let resolve!: (snapshot: Uint8Array | null) => void;
    vi.spyOn(RoomCache.prototype, 'load').mockImplementation(() => new Promise((done) => { resolve = done; }));
    const { current, updates } = session(); const opening = current.open(seed());
    await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
    current.close(); resolve(Y.encodeStateAsUpdate(current.doc)); await opening;
    expect(updates).toHaveLength(0); expect(Socket.instances).toHaveLength(0);
  });
});
