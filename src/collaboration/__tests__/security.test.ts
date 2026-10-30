import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { WebSocket } from 'ws';
import { createConnection } from 'node:net';
import { ValidationPool } from '../../../server/validationPool';
import { createCollaborationRelay } from '../../../server/collaborationRelay';
import { issueTicket, RateLimits, verifyTicket } from '../../../server/admission';
import { createProject } from '../../utils/projectLibrary';
import { MAX_DOCUMENT_BYTES, readDocument, roomProject, seedDocument } from '../model';
import { parseInvite, relayUrl, validateInvite } from '../invite';

const disposal: Array<() => void | Promise<void>> = [];
afterEach(async () => { for (const close of disposal.splice(0).reverse()) await close(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const origin = 'http://localhost:3000';
// Fixed test fixtures, never deployment credentials.
const access = { creationKey: '1'.repeat(64), signingKey: '2'.repeat(64) };
const roomId = () => crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
const tick = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function relayFixture(options: Partial<Parameters<typeof createCollaborationRelay>[0]> = {}) {
  const relay = createCollaborationRelay({ origins: [origin], ...options });
  const port = await relay.listen(0);
  disposal.push(() => relay.close());
  const base = `http://127.0.0.1:${port}`;
  const url = (room: string) => `ws://127.0.0.1:${port}/${room}`;
  async function connect(room: string, ticket?: string, headers?: Record<string, string>) {
    const socket = new WebSocket(url(room), ticket ? ['osd-collab-v1', `ticket.${ticket}`] : [], { origin, headers });
    const messages: any[] = [];
    socket.on('message', (raw) => messages.push(JSON.parse(raw.toString())));
    socket.on('error', () => {});
    disposal.push(() => { if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.terminate(); });
    await new Promise<void>((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
    return { socket, messages, send(update: Uint8Array, id = 1) {
      socket.send(JSON.stringify({ type: 'update', id, data: Buffer.from(update).toString('base64') }));
    } };
  }
  return { base, connect };
}
function validDoc() {
  const doc = new Y.Doc(); seedDocument(doc, roomProject(createProject({ title: 'Private plan' })));
  disposal.push(() => doc.destroy());
  return doc;
}

describe('isolated validation', () => {
  it('reduces full reconnect snapshots to the missing delta in the actual worker', async () => {
    const pool = new ValidationPool(); disposal.push(() => pool.close());
    const doc = validDoc(); const snapshot = Y.encodeStateAsUpdate(doc);
    doc.getMap('plan').set('setting:name', JSON.stringify('One new field'));
    const result = await pool.validate(snapshot, Y.encodeStateAsUpdate(doc));
    expect(result.broadcast.length).toBeLessThan(snapshot.length / 4);
    const receiver = new Y.Doc(); disposal.push(() => receiver.destroy());
    Y.applyUpdate(receiver, snapshot); Y.applyUpdate(receiver, result.broadcast);
    expect(readDocument(receiver)?.setups[0].name).toBe('One new field');
    const repeated = await pool.validate(result.snapshot, Y.encodeStateAsUpdate(doc));
    expect([...repeated.broadcast]).toEqual([0, 0]);
  });
  it('accepts a valid document in the actual validation worker', async () => {
    const pool = new ValidationPool();
    const doc = new Y.Doc(); seedDocument(doc, roomProject(createProject({ title: 'Worker validation' })));
    try { expect((await pool.validate(new Uint8Array([0, 0]), Y.encodeStateAsUpdate(doc))).snapshot.length).toBeGreaterThan(2); }
    finally { await pool.close(); doc.destroy(); }
  });

  it('rejects corrupt binary data and remains available for a subsequent valid request', async () => {
    const pool = new ValidationPool(); disposal.push(() => pool.close());
    await expect(pool.validate(new Uint8Array([0, 0]), new Uint8Array([255, 255, 255]))).rejects.toThrow();
    const accepted = await pool.validate(new Uint8Array([0, 0]), Y.encodeStateAsUpdate(validDoc()));
    const view = new Y.Doc(); disposal.push(() => view.destroy()); Y.applyUpdate(view, accepted.snapshot);
    expect(readDocument(view)?.title).toContain('Private plan');
  });

  it.each(['__proto__', 'constructor', 'prototype'])('rejects the reserved flat field %s before object assembly', (field) => {
    const doc = validDoc();
    const actor = readDocument(doc)!.setups[0].elements[0];
    doc.getMap('plan').set(`elements:${JSON.stringify(actor.id)}:${field}`, '{"polluted":true}');
    expect(() => readDocument(doc)).toThrow();
    expect(({} as any).polluted).toBeUndefined();
  });

  it('rejects pose smuggling of identity and renderer fields', () => {
    const doc = validDoc(); const actor = readDocument(doc)!.setups[0].elements[0];
    doc.getMap('plan').set(`elements:${JSON.stringify(actor.id)}:@pose`, JSON.stringify({ x: 1, y: 2, rotation: 0, type: 'text', id: 'different-object' }));
    expect(() => readDocument(doc)).toThrow(/Unexpected/);
  });

  it.each(['revisions', 'people', 'scriptLines', '__proto__'])('rejects hidden production/poison fields in the room seed: %s', (field) => {
    const doc = validDoc(); const raw = doc.getMap<string>('meta').get('seed')!;
    doc.getMap('meta').set('seed', raw.slice(0, -1) + `,${JSON.stringify(field)}:{"polluted":true}}`);
    expect(() => readDocument(doc)).toThrow();
  });

  it('rejects a seed trying to select a local project identity', () => {
    const doc = validDoc(); const seed = JSON.parse(doc.getMap<string>('meta').get('seed')!);
    seed.id = 'existing-local-project'; doc.getMap('meta').set('seed', JSON.stringify(seed));
    expect(() => readDocument(doc)).toThrow(/identity/);
  });

  it('rejects nested shared types and unexpected shared roots', () => {
    const doc = validDoc(); doc.getMap('plan').set('setting:name', new Y.Text('payload'));
    expect(() => readDocument(doc)).toThrow(/map values/);
    const other = validDoc(); other.getText('unexpected').insert(0, 'hidden content');
    expect(() => readDocument(other)).toThrow(/root/);
  });

  it.each(['url(https://example.com/a.svg)', 'u\\72l(https://example.com/a.svg)', 'URL(#unexpected)'])('rejects SVG paint value %s', (color) => {
    const doc = validDoc(); const actor = readDocument(doc)!.setups[0].elements[0];
    doc.getMap('plan').set(`elements:${JSON.stringify(actor.id)}:color`, JSON.stringify(color));
    expect(() => readDocument(doc)).toThrow(/color/);
  });

  it('rejects malformed path contents and unknown renderer properties', () => {
    const doc = validDoc(); const actor = readDocument(doc)!.setups[0].elements[0];
    doc.getMap('plan').set(`elements:${JSON.stringify(actor.id)}:@pose`, JSON.stringify({ x: 0, y: 0, rotation: 0, path: [null] }));
    expect(() => readDocument(doc)).toThrow(/FloorPlanElement/);
    const other = validDoc(); const id = readDocument(other)!.setups[0].elements[0].id;
    other.getMap('plan').set(`elements:${JSON.stringify(id)}:svg`, JSON.stringify('<svg onload="alert(1)"></svg>'));
    expect(() => readDocument(other)).toThrow(/FloorPlanElement/);
  });

  it('rejects uninitialized garbage and excessive nesting', () => {
    const empty = new Y.Doc(); disposal.push(() => empty.destroy()); empty.getMap('plan').set('setting:name', '"garbage"');
    expect(() => readDocument(empty)).toThrow(/Uninitialized/);
    const doc = validDoc(); const actor = readDocument(doc)!.setups[0].elements[0];
    const value = '['.repeat(40) + '0' + ']'.repeat(40);
    doc.getMap('plan').set(`elements:${JSON.stringify(actor.id)}:name`, value);
    expect(() => readDocument(doc)).toThrow(/complexity/);
  });
});

describe('room admission and expiry', () => {
  it('rejects a noncanonical base64 signature even when it decodes to identical bytes', () => {
    const room = roomId(); const ticket = issueTicket(room, access);
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const changed = ticket.slice(0, -1) + alphabet[alphabet.indexOf(ticket.at(-1)!) ^ 1];
    expect(Buffer.from(ticket.split('.')[1], 'base64url')).toEqual(Buffer.from(changed.split('.')[1], 'base64url'));
    expect(verifyTicket(room, changed, access)).toBeNull();
    expect(verifyTicket(room, ticket, access)).not.toBeNull();
  });
  it('protects room creation even when a caller forges an allowed Origin', async () => {
    const { base } = await relayFixture({ publicAccess: access });
    const denied = await fetch(`${base}/rooms`, { method: 'POST', headers: { Origin: origin } });
    expect(denied.status).toBe(403);
    const wrong = await fetch(`${base}/rooms`, { method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${'3'.repeat(64)}` } });
    expect(wrong.status).toBe(403);
    const allowed = await fetch(`${base}/rooms`, { method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${access.creationKey}` } });
    expect(allowed.status).toBe(201);
    expect(allowed.headers.get('access-control-allow-origin')).toBe(origin);
    expect(allowed.headers.get('cache-control')).toBe('no-store');
    const raw = await allowed.text(); const invite = JSON.parse(raw);
    expect(verifyTicket(invite.room, invite.ticket, access)).not.toBeNull();
    expect(raw).not.toContain(access.creationKey); expect(raw).not.toContain(access.signingKey);
  });

  it('accepts a signed room and rejects missing, forged and cross-room tickets before delivering any data', async () => {
    const { connect } = await relayFixture({ publicAccess: access });
    const room = roomId(); const ticket = issueTicket(room, access);
    const member = await connect(room, ticket); member.send(Y.encodeStateAsUpdate(validDoc()));
    await expect.poll(() => member.messages.some((m) => m.type === 'ack'), { timeout: 5000 }).toBe(true);
    await expect(connect(room)).rejects.toThrow('403');
    const forged = ticket.slice(0, -2) + (ticket.endsWith('AA') ? 'BB' : 'AA');
    await expect(connect(room, forged)).rejects.toThrow('403');
    await expect(connect(roomId(), ticket)).rejects.toThrow('403');
    const guest = await connect(room, ticket);
    await expect.poll(() => guest.messages.some((m) => m.type === 'update')).toBe(true);
  });

  it('rejects expired tickets and weak/incomplete public configuration', async () => {
    const { connect } = await relayFixture({ publicAccess: access });
    const room = roomId(); const expired = issueTicket(room, { ...access, ticketTtlMs: 1000 }, Date.now() - 2000);
    await expect(connect(room, expired)).rejects.toThrow('403');
    expect(() => createCollaborationRelay({ origins: ['https://koosoli.github.io'] })).toThrow(/protected/);
    expect(() => createCollaborationRelay({ origins: [origin], publicAccess: { creationKey: 'short', signingKey: 'short' } })).toThrow(/32-byte/);
    expect(() => createCollaborationRelay({ origins: ['*'] })).toThrow();
    const local = createCollaborationRelay({ origins: [origin] }); disposal.push(() => local.close());
    await expect(local.listen(0, '0.0.0.0')).rejects.toThrow(/Non-loopback/);
  });

  it('does not deliver plan updates to an existing member after its ticket expires', async () => {
    const { connect } = await relayFixture({ publicAccess: { ...access, ticketTtlMs: 1000 } });
    const room = roomId(); const ticket = issueTicket(room, { ...access, ticketTtlMs: 1000 });
    const expired = await connect(room, ticket);
    await tick(1100);
    const fresh = await connect(room, issueTicket(room, access));
    const before = expired.messages.length;
    fresh.send(Y.encodeStateAsUpdate(validDoc()));
    await expect.poll(() => fresh.messages.some((m) => m.type === 'ack'), { timeout: 5000 }).toBe(true);
    expect(expired.messages.length).toBe(before);
    await expect.poll(() => expired.socket.readyState).toBe(WebSocket.CLOSED);
  });

  it('enforces IP connection limits despite spoofed forwarding headers, and frees slots after close', async () => {
    const { connect } = await relayFixture({ maxConnectionsPerIp: 1 });
    const a = await connect(roomId());
    await expect(connect(roomId(), undefined, { 'X-Forwarded-For': '203.0.113.15' })).rejects.toThrow('503');
    a.socket.close(); await new Promise((resolve) => a.socket.once('close', resolve));
    const b = await connect(roomId()); expect(b.socket.readyState).toBe(WebSocket.OPEN);
  });

  it('bounds global connections and total rooms', async () => {
    const global = await relayFixture({ maxConnections: 1 });
    await global.connect(roomId()); await expect(global.connect(roomId())).rejects.toThrow('503');
    const rooms = await relayFixture({ maxRooms: 1 });
    const firstRoom = roomId(); await rooms.connect(firstRoom); await rooms.connect(firstRoom);
    await expect(rooms.connect(roomId())).rejects.toThrow('503');
  });

  it('rejects an oversized frame without affecting an existing private room', async () => {
    const { connect } = await relayFixture(); const room = roomId();
    const owner = await connect(room); owner.send(Y.encodeStateAsUpdate(validDoc()));
    await expect.poll(() => owner.messages.some((m) => m.type === 'ack'), { timeout: 5000 }).toBe(true);
    const attacker = await connect(room);
    const close = new Promise<number>((resolve) => attacker.socket.once('close', resolve));
    attacker.socket.send('x'.repeat(MAX_DOCUMENT_BYTES * 1.5 + 1));
    expect(await close).toBe(1009);
    const late = await connect(room);
    await expect.poll(() => late.messages.some((m) => m.type === 'update')).toBe(true);
    const snapshot = new Y.Doc(); disposal.push(() => snapshot.destroy());
    Y.applyUpdate(snapshot, new Uint8Array(Buffer.from(late.messages.find((m) => m.type === 'update').data, 'base64')));
    expect(readDocument(snapshot)?.title).toContain('Private plan');
  });

  it('rejects a burst while validation is pending and does not poison other peers', async () => {
    const { connect } = await relayFixture(); const room = roomId();
    const owner = await connect(room); owner.send(Y.encodeStateAsUpdate(validDoc()));
    await expect.poll(() => owner.messages.some((m) => m.type === 'ack'), { timeout: 5000 }).toBe(true);
    const attacker = await connect(room);
    for (let id = 1; id <= 20; id++) attacker.send(new Uint8Array([0, 0]), id);
    await expect.poll(() => attacker.messages.some((m) => m.type === 'error')).toBe(true);
    owner.send(new Uint8Array([0, 0]), 2);
    await expect.poll(() => owner.messages.some((m) => m.type === 'ack' && m.id === 2), { timeout: 5000 }).toBe(true);
  });

  it.each(['ping', 'pong'] as const)('bounds a %s control-frame flood independently of data messages', async (kind) => {
    const { connect } = await relayFixture(); const room = roomId();
    const owner = await connect(room); owner.send(Y.encodeStateAsUpdate(validDoc()));
    await expect.poll(() => owner.messages.some((m) => m.type === 'ack'), { timeout: 5000 }).toBe(true);
    const attacker = await connect(room);
    for (let index = 0; index < 30; index++) attacker.socket[kind]('probe');
    await expect.poll(() => attacker.socket.readyState, { timeout: 5000 }).toBe(WebSocket.CLOSED);
    owner.send(new Uint8Array([0, 0]), 2);
    await expect.poll(() => owner.messages.some((m) => m.type === 'ack' && m.id === 2), { timeout: 5000 }).toBe(true);
  });

  it('rejects excessive tiny fragments before they form an application message', async () => {
    const { connect } = await relayFixture(); const attacker = await connect(roomId());
    const closed = new Promise<number>((resolve) => attacker.socket.once('close', resolve));
    for (let index = 0; index < 1030; index++) attacker.socket.send('x', { fin: false });
    expect(await closed).toBe(1008);
  });

  it('keeps rooms isolated and denies unauthorized HTTP paths', async () => {
    const { base, connect } = await relayFixture();
    const a = await connect(roomId()); a.send(Y.encodeStateAsUpdate(validDoc()));
    await expect.poll(() => a.messages.some((m) => m.type === 'ack'), { timeout: 5000 }).toBe(true);
    const b = await connect(roomId());
    await expect.poll(() => b.messages.some((m) => m.type === 'update')).toBe(true);
    expect(b.messages.find((m) => m.type === 'update').data).toBe('AAA=');
    expect((await fetch(`${base}/package.json`)).status).toBe(404);
    expect((await fetch(`${base}/rooms`, { method: 'POST', headers: { Origin: 'https://hostile.example' } })).status).toBe(403);
  });

  it('survives reset TCP connections during denied HTTP upgrades', async () => {
    const { base, connect } = await relayFixture();
    const port = Number(new URL(base).port);
    for (let i = 0; i < 20; i++) await new Promise<void>((resolve) => {
      const socket = createConnection({ host: '127.0.0.1', port }, () => {
        socket.write('GET /invalid HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n', () => socket.resetAndDestroy());
      });
      socket.on('error', () => {}); socket.on('close', () => resolve());
    });
    expect((await fetch(`${base}/health`)).status).toBe(200);
    const owner = await connect(roomId()); owner.send(Y.encodeStateAsUpdate(validDoc()));
    await expect.poll(() => owner.messages.some((m) => m.type === 'ack'), { timeout: 5000 }).toBe(true);
  });

  it('bounds rate-limit memory and independently caps counts and bytes', () => {
    const limiter = new RateLimits(1000, 2, 10);
    expect(limiter.consume('ip', 5, 0)).toBe(true); expect(limiter.consume('ip', 5, 1)).toBe(true);
    expect(limiter.consume('ip', 1, 2)).toBe(false); expect(limiter.consume('ip', 1, 1001)).toBe(true);
    for (let i = 0; i < 4095; i++) limiter.consume(String(i), 0, 1001);
    expect(limiter.consume('new-source', 0, 1001)).toBe(false);
    expect(limiter.consume('new-source', 0, 2002)).toBe(true);
  });

  it('strictly validates invitation shapes and rejects expired invitations locally', () => {
    for (const value of [null, [], { relay: 'wss://relay.example', room: ['a'.repeat(64)] }, { relay: 'wss://relay.example', room: 'a'.repeat(64), creationKey: access.creationKey }]) expect(() => validateInvite(value)).toThrow();
    const room = roomId(); const ticket = issueTicket(room, { ...access, ticketTtlMs: 1000 }, Date.now() - 2000);
    expect(() => validateInvite({ relay: 'wss://relay.example', room, ticket })).toThrow(/expired/);
    expect(() => parseInvite('javascript:alert(1)#collab={}')).toThrow(/URL/);
  });

  it('pins public pages to an operator-approved relay and fails closed without configuration', () => {
    vi.stubGlobal('window', { location: { hostname: 'koosoli.github.io' } });
    vi.stubEnv('VITE_COLLAB_RELAY_URL', '');
    expect(() => relayUrl('wss://attacker.example')).toThrow(/not configured/);
    vi.stubEnv('VITE_COLLAB_RELAY_URL', 'wss://trusted.example');
    expect(relayUrl('wss://trusted.example')).toBe('wss://trusted.example');
    expect(() => relayUrl('wss://attacker.example')).toThrow(/not trusted/);
    expect(() => relayUrl('ws://127.0.0.1:1234')).toThrow();
    expect(() => validateInvite({ relay: 'wss://trusted.example', room: roomId() })).toThrow(/signed/);
  });
});
