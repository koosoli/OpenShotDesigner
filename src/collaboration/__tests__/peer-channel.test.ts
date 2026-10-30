import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JoinRoomCallbacks, MessageActionConfig, Room } from '@trystero-p2p/core';
import { PeerChannel } from '../peerChannel';

const mocked = vi.hoisted(() => ({ join: vi.fn(), available: (() => {}) as () => void, close: vi.fn() }));
vi.mock('../peerDiscovery', () => ({ PeerDiscovery: class {
  constructor(_secret: string, available: () => void) { mocked.available = available; }
  join = mocked.join;
  close = mocked.close;
} }));
let callbacks: JoinRoomCallbacks;
let config: MessageActionConfig<string>;
let room: Room;
const send = vi.fn(async (_data: string, _options?: unknown) => {});
const channels: PeerChannel[] = [];
const nativeClose = vi.fn();
beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto); send.mockClear(); mocked.close.mockClear(); nativeClose.mockClear();
  vi.stubGlobal('RTCPeerConnection', class {});
  room = {
    makeAction: vi.fn((_name, settings) => { config = settings; return { send }; }),
    getPeers: () => ({ participant: { close: nativeClose } }),
    leave: async () => {}, onPeerJoin: null, onPeerLeave: null,
  } as unknown as Room;
  mocked.join.mockImplementation((_config, _id, handlers) => { callbacks = handlers; return room; });
});
afterEach(() => { channels.splice(0).forEach((c) => c.close()); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
async function open() {
  const channel = new PeerChannel('1'.repeat(64)); channels.push(channel);
  await vi.waitFor(() => expect(room.onPeerJoin).toBeTypeOf('function'));
  mocked.available(); return channel;
}
const receive = (packet: object, peerId: string) => config.onMessage!(JSON.stringify(packet), { peerId });
const acknowledgments = () => send.mock.calls.map((args) => JSON.parse(args[0] as unknown as string)).filter((packet) => packet.type === 'ack');

describe('direct transport validation receipts and bounded admission', () => {
  it('never reports delivery without a peer and ignores forged/unknown ACKs', async () => {
    const channel = await open(); const events = vi.fn(); channel.onmessage = events;
    channel.send(JSON.stringify({ type: 'update', id: 1, data: 'AAA=' }));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(events).not.toHaveBeenCalled();
    room.onPeerJoin!('participant');
    receive({ type: 'ack', id: 1 }, 'outsider'); receive({ type: 'ack', id: 99 }, 'participant');
    expect(events.mock.calls.filter(([e]) => JSON.parse(e.data).type === 'ack')).toHaveLength(0);
    receive({ type: 'ack', id: 1 }, 'participant');
    expect(events.mock.calls.filter(([e]) => JSON.parse(e.data).type === 'ack')).toHaveLength(1);
  });
  it('deduplicates mesh copies but acknowledges them only after editor validation', async () => {
    const channel = await open(); room.onPeerJoin!('first'); room.onPeerJoin!('second');
    const events = vi.fn(); channel.onmessage = events;
    receive({ type: 'update', id: 10, data: 'AAA=' }, 'first');
    receive({ type: 'update', id: 42, data: 'AAA=' }, 'second');
    await vi.waitFor(() => expect(events).toHaveBeenCalledTimes(1));
    expect(acknowledgments()).toHaveLength(0);
    channel.confirm('first', 10);
    await vi.waitFor(() => expect(acknowledgments()).toHaveLength(2));
    expect(acknowledgments().map((packet) => packet.id).sort()).toEqual([10, 42]);
    receive({ type: 'update', id: 43, data: 'AAA=' }, 'second');
    await vi.waitFor(() => expect(acknowledgments()).toHaveLength(3));
    expect(events).toHaveBeenCalledTimes(1);
  });
  it('refuses a seventh participant before application events are admitted', async () => {
    await open();
    for (let i = 0; i < 5; i++) await callbacks.onPeerHandshake!(`peer${i}`, async () => {}, async () => ({ data: '' }), true);
    await expect(callbacks.onPeerHandshake!('extra', async () => {}, async () => ({ data: '' }), true)).rejects.toThrow('participant limit');
  });
  it('never lets a reused sequence confirm a different unvalidated payload', async () => {
    const channel = await open(); room.onPeerJoin!('participant');
    const events = vi.fn(); channel.onmessage = events;
    receive({ type: 'update', id: 9, data: 'AAA=' }, 'participant');
    await vi.waitFor(() => expect(events).toHaveBeenCalledTimes(1));
    receive({ type: 'update', id: 9, data: 'AQ==' }, 'participant');
    await vi.waitFor(() => expect(nativeClose).toHaveBeenCalledTimes(1));
    expect(acknowledgments()).toHaveLength(0);
    channel.confirm('participant', 9);
    expect(acknowledgments()).toHaveLength(1);
    room.onPeerJoin!('second'); events.mockClear();
    receive({ type: 'update', id: 10, data: 'AQ==' }, 'second');
    await vi.waitFor(() => expect(events).toHaveBeenCalledTimes(1));
    expect(acknowledgments()).toHaveLength(1);
  });
  it('rejects oversized, uninvited and metadata-bearing transfers before assembling plan payloads', async () => {
    await open(); room.onPeerJoin!('participant');
    const context = { peerId: 'participant', byteLength: 4 * 1024 * 1024, kind: 'message' as const, signal: new AbortController().signal };
    expect(config.onReceive!(context)).toBe(false);
    expect(config.onReceive!({ ...context, byteLength: 10, peerId: 'outsider' })).toBe(false);
    expect(config.onReceive!({ ...context, byteLength: 10, metadata: { hidden: true } })).toBe(false);
    expect(config.onReceive!({ ...context, byteLength: 10 })).toBe(true);
  });
  it('also rejects sequence substitution with a previously accepted payload', async () => {
    const channel = await open(); room.onPeerJoin!('participant');
    const events = vi.fn(); channel.onmessage = events;
    receive({ type: 'update', id: 1, data: 'AQ==' }, 'participant');
    await vi.waitFor(() => expect(events).toHaveBeenCalledTimes(1));
    channel.confirm('participant', 1); send.mockClear();
    receive({ type: 'update', id: 2, data: 'AAA=' }, 'participant');
    await vi.waitFor(() => expect(events).toHaveBeenCalledTimes(2));
    receive({ type: 'update', id: 2, data: 'AQ==' }, 'participant');
    await vi.waitFor(() => expect(nativeClose).toHaveBeenCalledTimes(1));
    expect(acknowledgments()).toHaveLength(0);
  });
  it('reclaims abandoned handshake slots instead of permanently filling the room', async () => {
    await open();
    for (let i = 0; i < 5; i++) await callbacks.onPeerHandshake!(`pending${i}`, async () => {}, async () => ({ data: '' }), true);
    const now = Date.now(); vi.spyOn(Date, 'now').mockReturnValue(now + 10_001);
    await expect(callbacks.onPeerHandshake!('new', async () => {}, async () => ({ data: '' }), true)).resolves.toBeUndefined();
  });
  it('closes physical connections and discovery when leaving, including warm reconnect state', async () => {
    const channel = await open(); channel.close();
    expect(nativeClose).toHaveBeenCalledTimes(1); expect(mocked.close).toHaveBeenCalledTimes(1);
    expect(channel.readyState).toBe(3);
  });
});
