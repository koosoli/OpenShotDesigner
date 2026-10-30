import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DiscoveryCipher, PeerDiscovery } from '../peerDiscovery';
import { createPeerInvite, DIRECT_RELAY, inviteLink, parseInvite, validateInvite } from '../invite';

beforeEach(() => { vi.stubGlobal('crypto', webcrypto); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const message = { peerId: 'abcdefghijklmnopqrst' };
describe('account-free invitation and sealed public discovery', () => {
  it('allows a direct public invite without an operator account or arbitrary endpoint', () => {
    vi.stubGlobal('window', { location: { hostname: 'public.example' } });
    const invite = createPeerInvite();
    expect(invite.relay).toBe(DIRECT_RELAY); expect(invite.room).toHaveLength(64);
    expect(createPeerInvite().room).not.toBe(invite.room);
    const url = inviteLink(invite, 'https://public.example/OpenShotDesigner/');
    expect(new URL(url).search).toBe(''); expect(parseInvite(url)).toEqual(invite);
    expect(() => validateInvite({ ...invite, ticket: 'unexpected' })).toThrow();
    expect(() => validateInvite({ ...invite, endpoint: 'wss://hostile.example' })).toThrow();
  });
  it('encrypts announcements too, authenticates the topic and rejects another room key', async () => {
    const sender = new DiscoveryCipher('1'.repeat(64));
    const encrypted = await sender.seal('topic', message);
    expect(encrypted).not.toContain(message.peerId);
    expect(await new DiscoveryCipher('1'.repeat(64)).open('topic', encrypted)).toEqual(message);
    expect(await new DiscoveryCipher('2'.repeat(64)).open('topic', encrypted)).toBeNull();
    expect(await new DiscoveryCipher('1'.repeat(64)).open('other-topic', encrypted)).toBeNull();
  });
  it('rejects tampering, repeated ciphertext and oversized public relay payloads', async () => {
    const receiver = new DiscoveryCipher('1'.repeat(64));
    const encrypted = await new DiscoveryCipher('1'.repeat(64)).seal('topic', message);
    expect(await receiver.open('topic', encrypted)).toEqual(message);
    expect(await receiver.open('topic', encrypted)).toBeNull();
    const changed = encrypted.slice(0, 25) + (encrypted[25] === 'A' ? 'B' : 'A') + encrypted.slice(26);
    expect(await new DiscoveryCipher('1'.repeat(64)).open('topic', changed)).toBeNull();
    expect(await receiver.open('topic', 'A'.repeat(100_000))).toBeNull();
  });
  it('expires old discovery messages and rejects prototype identities/extra signaling fields', async () => {
    const sender = new DiscoveryCipher('1'.repeat(64));
    const encrypted = await sender.seal('topic', message);
    const now = Date.now(); vi.spyOn(Date, 'now').mockReturnValue(now + 120_001);
    expect(await new DiscoveryCipher('1'.repeat(64)).open('topic', encrypted)).toBeNull();
    vi.restoreAllMocks();
    const badId = await sender.seal('topic', { peerId: '__proto__' });
    expect(await new DiscoveryCipher('1'.repeat(64)).open('topic', badId)).toBeNull();
    const extra = await sender.seal('topic', { ...message, arbitrary: true });
    expect(await new DiscoveryCipher('1'.repeat(64)).open('topic', extra)).toBeNull();
  });
  it('bounds public socket frames before decoding and keeps the invitation secret off discovery sockets', async () => {
    const sockets: Socket[] = [];
    class Socket {
      readyState = 0; onopen: (() => void) | null = null; onclose: (() => void) | null = null;
      onmessage: ((event: { data: unknown }) => void) | null = null;
      onerror: (() => void) | null = null; bufferedAmount = 0;
      send = vi.fn();
      constructor(readonly url: string) { sockets.push(this); }
      close() { this.readyState = 3; this.onclose?.(); }
    }
    vi.stubGlobal('WebSocket', Socket);
    const secret = '1'.repeat(64); const discovery = new PeerDiscovery(secret, () => {});
    const room = discovery.join({ appId: 'DiscoveryGuardTest', password: secret }, crypto.randomUUID());
    try {
      await vi.waitFor(() => expect(sockets).toHaveLength(3));
      sockets.forEach((socket) => { socket.readyState = 1; socket.onopen?.(); });
      await vi.waitFor(() => expect(sockets[0].send.mock.calls.some(([frame]) => JSON.parse(frame)[0] === 'EVENT')).toBe(true));
      for (const socket of sockets) for (const [frame] of socket.send.mock.calls) expect(frame).not.toContain(secret);
      sockets[0].onmessage?.({ data: 'x'.repeat(128 * 1024 + 1) });
      expect(sockets[0].readyState).toBe(3);
      const request = sockets[1].send.mock.calls.map(([frame]) => JSON.parse(frame)).find((frame) => frame[0] === 'REQ');
      sockets[1].onmessage?.({ data: JSON.stringify(['EVENT', request[1], { content: 'not-authenticated-ciphertext', tags: [] }]) });
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(Object.keys(room.getPeers())).toHaveLength(0);
    } finally { await room.leave(); discovery.close(); }
  });
});
