import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DISCOVERY_SERVICES, PeerDiscovery } from '../peerDiscovery';

const failedUrl = 'wss://relay.damus.io';
const sockets: Socket[] = [];
const attempts: string[] = [];
let throwOnFailure = false;
class Socket {
  readyState = 0; bufferedAmount = 0;
  onopen: (() => void) | null = null; onclose: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  send = vi.fn();
  constructor(readonly url: string) {
    attempts.push(url);
    if (throwOnFailure && url === failedUrl) throw new Error('Connection blocked');
    sockets.push(this);
  }
  open() { this.readyState = 1; this.onopen?.(); }
  close() { this.readyState = 3; this.onclose?.(); }
}
beforeEach(() => {
  vi.useFakeTimers(); vi.spyOn(Math, 'random').mockReturnValue(0);
  vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('WebSocket', Socket);
  sockets.length = 0; attempts.length = 0; throwOnFailure = false;
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function discovery() {
  const available = vi.fn();
  const owner = new PeerDiscovery('1'.repeat(64), available);
  const room = owner.join({ appId: 'DiscoveryRetryTest', password: '1'.repeat(64) }, crypto.randomUUID());
  await vi.waitFor(() => expect(attempts).toHaveLength(DISCOVERY_SERVICES.length));
  return { owner, room, available };
}
const failedSockets = () => sockets.filter((socket) => socket.url === failedUrl);
async function exhaustFailures(flap = false) {
  for (let index = 0; index < 3; index++) {
    const socket = failedSockets().at(-1)!;
    if (flap) socket.open();
    socket.close();
    if (index < 2) await vi.advanceTimersByTimeAsync(1000 * 2 ** index);
  }
}

describe('public discovery retry budgets', () => {
  it('backs off a failed service independently while healthy services stay connected', async () => {
    const { owner, room, available } = await discovery();
    try {
      const healthy = sockets.filter((socket) => socket.url !== failedUrl);
      healthy.forEach((socket) => socket.open());
      await exhaustFailures();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(failedSockets()).toHaveLength(3);
      expect(healthy.every((socket) => socket.readyState === 1)).toBe(true);
      expect(available).toHaveBeenCalledTimes(2);
      for (const url of DISCOVERY_SERVICES.filter((url) => url !== failedUrl)) expect(attempts.filter((attempt) => attempt === url)).toHaveLength(1);
    } finally { const leaving = room.leave(); owner.close(); await vi.advanceTimersByTimeAsync(100); await leaving; }
    const before = attempts.length;
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(attempts).toHaveLength(before);
  });

  it('does not reset the failure budget for a relay that repeatedly opens and immediately closes', async () => {
    const { owner, room } = await discovery();
    try {
      await exhaustFailures(true);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(failedSockets()).toHaveLength(3);
    } finally { const leaving = room.leave(); owner.close(); await vi.advanceTimersByTimeAsync(100); await leaving; }
  });

  it('probes again after the cooldown and restores fast recovery after a stable connection', async () => {
    const { owner, room } = await discovery();
    try {
      await exhaustFailures();
      await vi.advanceTimersByTimeAsync(5 * 60_000 - 1);
      expect(failedSockets()).toHaveLength(3);
      await vi.advanceTimersByTimeAsync(1);
      expect(failedSockets()).toHaveLength(4);
      failedSockets().at(-1)!.open();
      await vi.advanceTimersByTimeAsync(30_000);
      failedSockets().at(-1)!.close();
      await vi.advanceTimersByTimeAsync(1000);
      expect(failedSockets()).toHaveLength(5);
    } finally { const leaving = room.leave(); owner.close(); await vi.advanceTimersByTimeAsync(100); await leaving; }
  });

  it('isolates constructor failures instead of aborting the other discovery services', async () => {
    throwOnFailure = true;
    const { owner, room } = await discovery();
    try {
      await vi.advanceTimersByTimeAsync(60_000);
      expect(attempts.filter((url) => url === failedUrl)).toHaveLength(3);
      expect(sockets).toHaveLength(2);
      sockets.forEach((socket) => socket.open());
      expect(sockets.every((socket) => socket.readyState === 1)).toBe(true);
    } finally { const leaving = room.leave(); owner.close(); await vi.advanceTimersByTimeAsync(100); await leaving; }
  });

  it('does not retry a service quarantined for oversized incoming messages', async () => {
    const { owner, room } = await discovery();
    try {
      const socket = failedSockets()[0]; socket.open();
      socket.onmessage?.({ data: 'x'.repeat(128 * 1024 + 1) });
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      expect(socket.readyState).toBe(3);
      expect(failedSockets()).toHaveLength(1);
    } finally { const leaving = room.leave(); owner.close(); await vi.advanceTimersByTimeAsync(100); await leaving; }
  });
});
