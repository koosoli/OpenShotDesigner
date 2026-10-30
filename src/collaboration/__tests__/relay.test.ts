import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import * as Y from 'yjs';
import { createCollaborationRelay } from '../../../server/collaborationRelay';
import { createProject } from '../../utils/projectLibrary';
import { readDocument, roomProject, seedDocument, writeLocalChanges } from '../model';
import { createInvite } from '../invite';

const cleanup: Array<() => Promise<void> | void> = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });
const tick = () => new Promise((resolve) => setTimeout(resolve, 30));

async function setup() {
  const relay = createCollaborationRelay({ origins: ['http://localhost:3000'], idleMs: 40 });
  const port = await relay.listen(0);
  cleanup.push(() => relay.close());
  const room = createInvite('ws://localhost:1234').room;
  const url = `ws://127.0.0.1:${port}/${room}`;
  async function peer() {
    const socket = new WebSocket(url, { origin: 'http://localhost:3000' });
    cleanup.push(() => socket.terminate());
    const doc = new Y.Doc();
    const messages: Array<{ type: string; id?: number; count?: number; message?: string }> = [];
    socket.on('message', (raw) => {
      const message = JSON.parse(raw.toString());
      if (message.type === 'update') Y.applyUpdate(doc, new Uint8Array(Buffer.from(message.data, 'base64')));
      messages.push(message);
    });
    await new Promise<void>((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
    return { socket, doc, messages, send(id: number, update = Y.encodeStateAsUpdate(doc)) {
      socket.send(JSON.stringify({ type: 'update', id, data: Buffer.from(update).toString('base64') }));
    } };
  }
  return { url, peer };
}

describe('real WebSocket relay', () => {
  it('supports initial state, late join, acknowledgments and continued editing without the creator', async () => {
    const { peer } = await setup();
    const a = await peer();
    const seed = roomProject(createProject({ title: 'Relay integration' }));
    seedDocument(a.doc, seed); a.send(1);
    await expect.poll(() => a.messages, { timeout: 5000 }).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'ack', id: 1 })]));
    const b = await peer(); const c = await peer();
    await expect.poll(() => readDocument(c.doc)?.title).toBe(seed.title);
    expect(readDocument(b.doc)).toEqual(readDocument(a.doc));
    a.socket.close();
    await expect.poll(() => b.messages.at(-1)?.count).toBe(2);
    const before = readDocument(b.doc)!;
    const after = JSON.parse(JSON.stringify(before));
    after.setups[0].elements[0].x = 777;
    writeLocalChanges(b.doc, before, after); b.send(2);
    await expect.poll(() => readDocument(c.doc)?.setups[0].elements[0].x).toBe(777);
    expect(readDocument(c.doc)).toEqual(readDocument(b.doc));
  });

  it('rejects a replacement seed without poisoning the existing room', async () => {
    const { peer } = await setup();
    const a = await peer();
    const seed = roomProject(createProject({ title: 'Original' }));
    seedDocument(a.doc, seed); a.send(1);
    await expect.poll(() => a.messages.some((m) => m.type === 'ack'), { timeout: 5000 }).toBe(true);
    const bad = await peer();
    await expect.poll(() => readDocument(bad.doc)?.title).toBe(seed.title);
    bad.doc.getMap('meta').set('seed', JSON.stringify(roomProject(createProject({ title: 'Replacement' }))));
    bad.send(2);
    await expect.poll(() => bad.messages.some((m) => m.type === 'error')).toBe(true);
    const late = await peer();
    await expect.poll(() => readDocument(late.doc)?.title).toBe(seed.title);
  });

  it('shows no seeded plan after an empty room expires', async () => {
    const { peer } = await setup();
    const a = await peer();
    seedDocument(a.doc, roomProject(createProject({ title: 'Temporary' }))); a.send(1);
    await expect.poll(() => a.messages.some((m) => m.type === 'ack'), { timeout: 5000 }).toBe(true);
    a.socket.close();
    await new Promise((resolve) => a.socket.once('close', resolve));
    await tick(); await tick();
    const fresh = await peer();
    await expect.poll(() => fresh.messages.some((m) => m.type === 'update')).toBe(true);
    expect(readDocument(fresh.doc)).toBeNull();
  });

  it('rejects connections from unapproved origins', async () => {
    const { url } = await setup();
    const socket = new WebSocket(url, { origin: 'https://unapproved.example' });
    cleanup.push(() => socket.terminate());
    const error = await new Promise<Error>((resolve) => socket.once('error', resolve));
    expect(error.message).toContain('403');
  });
});
