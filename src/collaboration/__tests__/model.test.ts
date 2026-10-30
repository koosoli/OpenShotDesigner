import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { createProject } from '../../utils/projectLibrary';
import { LOCAL_ORIGIN, assertRoomProject, projectView, readDocument, roomProject, seedDocument, writeLocalChanges } from '../model';
import { createInvite, inviteLink, parseInvite, relayUrl } from '../invite';
import type { Project } from '../../types';

const copy = (project: Project) => JSON.parse(JSON.stringify(project)) as Project;
function peers() {
  const original = createProject({ title: 'Test plan' });
  const seed = roomProject(original);
  const a = new Y.Doc(); const b = new Y.Doc();
  seedDocument(a, seed);
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a), 'remote');
  return { original, seed, a, b };
}
function exchange(a: Y.Doc, b: Y.Doc) {
  const au = Y.encodeStateAsUpdate(a); const bu = Y.encodeStateAsUpdate(b);
  Y.applyUpdate(a, bu, 'remote'); Y.applyUpdate(b, au, 'remote');
  expect(readDocument(a)).toEqual(readDocument(b));
}

describe('shared floor plan model', () => {
  it('isolates a single seed without sharing crew or an unrelated project', () => {
    const { seed, a, b, original } = peers();
    expect(seed.director).toBe('');
    expect(seed.setups).toHaveLength(1);
    expect(() => seedDocument(b, roomProject(createProject({ title: 'Unrelated' })))).toThrow(/already/);
    const first = readDocument(a)!;
    expect(readDocument(b)).toEqual(first);
    const local = projectView(first);
    expect(local.id).not.toBe(original.id);
    expect(local.id).not.toBe(seed.id);
    expect(original.title).toBe('Test plan');
  });

  it('converges offline changes to different objects and gives a late joiner the whole plan', () => {
    const { a, b, seed } = peers();
    const left = copy(seed); const right = copy(seed);
    left.setups[0].elements[0].x = 100;
    right.setups[0].elements[1].rotation = 42;
    writeLocalChanges(a, seed, left); writeLocalChanges(b, seed, right);
    exchange(a, b);
    expect(readDocument(a)!.setups[0].elements[0].x).toBe(100);
    expect(readDocument(a)!.setups[0].elements[1].rotation).toBe(42);
    const late = new Y.Doc(); Y.applyUpdate(late, Y.encodeStateAsUpdate(a));
    expect(readDocument(late)).toEqual(readDocument(a));
    expect(readDocument(late)!.setups[0].elements).toHaveLength(seed.setups[0].elements.length);
  });

  it('keeps a competing transform atomic while merging independent label edits', () => {
    const { a, b, seed } = peers();
    const left = copy(seed); const right = copy(seed);
    Object.assign(left.setups[0].elements[0], { x: 1, y: 2, rotation: 3, name: 'Actor left' });
    Object.assign(right.setups[0].elements[0], { x: 9, y: 8, rotation: 7 });
    writeLocalChanges(a, seed, left); writeLocalChanges(b, seed, right);
    exchange(a, b);
    const element = readDocument(a)!.setups[0].elements[0];
    expect([[1, 2, 3], [9, 8, 7]]).toContainEqual([element.x, element.y, element.rotation]);
    expect(element.name).toBe('Actor left');
  });

  it('does not resurrect a camera deleted while an offline peer moved it', () => {
    const { a, b, seed } = peers();
    const id = seed.setups[0].elements[1].id;
    const deleted = copy(seed);
    deleted.setups[0].elements = deleted.setups[0].elements.filter((e) => e.id !== id);
    deleted.setups[0].shots = [];
    const moved = copy(seed); moved.setups[0].elements[1].x = 999;
    writeLocalChanges(a, seed, deleted); writeLocalChanges(b, seed, moved);
    exchange(a, b);
    expect(readDocument(a)!.setups[0].elements.some((e) => e.id === id)).toBe(false);
    expect(readDocument(a)!.setups[0].shots).toHaveLength(0);
  });

  it('scopes undo/redo to local writes and excludes the initial seed', () => {
    const { a, b, seed } = peers();
    const undo = new Y.UndoManager(a.getMap('plan'), { trackedOrigins: new Set([LOCAL_ORIGIN]) });
    const left = copy(seed); const right = copy(seed);
    left.setups[0].elements[0].x = 100;
    right.setups[0].elements[1].rotation = 42;
    writeLocalChanges(a, seed, left); writeLocalChanges(b, seed, right);
    exchange(a, b);
    undo.undo(); exchange(a, b);
    expect(readDocument(a)!.setups[0].elements[0].x).toBe(seed.setups[0].elements[0].x);
    expect(readDocument(a)!.setups[0].elements[1].rotation).toBe(42);
    expect(undo.canUndo()).toBe(false);
    undo.redo(); exchange(a, b);
    expect(readDocument(a)!.setups[0].elements[0].x).toBe(100);
  });

  it('never publishes personal viewport changes and preserves local module edits', () => {
    const { a, seed } = peers();
    const moved = copy(seed);
    moved.setups[0].canvasScale = 2;
    moved.setups[0].canvasOffset = { x: -999, y: 88 };
    moved.director = 'Local note';
    const before = Y.encodeStateAsUpdate(a);
    writeLocalChanges(a, seed, moved);
    expect(Y.encodeStateAsUpdate(a)).toEqual(before);
    const view = projectView(readDocument(a)!, moved);
    expect(view.setups[0].canvasScale).toBe(2);
    expect(view.director).toBe('Local note');
  });

  it('leaves a later remote edit of the same field intact when local undo runs', () => {
    const { a, b, seed } = peers();
    const undo = new Y.UndoManager(a.getMap('plan'), { trackedOrigins: new Set([LOCAL_ORIGIN]) });
    const local = copy(seed); local.setups[0].elements[0].name = 'Local name';
    writeLocalChanges(a, seed, local); exchange(a, b);
    const before = readDocument(b)!;
    const remote = copy(before); remote.setups[0].elements[0].name = 'Later remote name';
    writeLocalChanges(b, before, remote); exchange(a, b);
    undo.undo(); exchange(a, b);
    expect(readDocument(a)!.setups[0].elements[0].name).toBe('Later remote name');
  });

  it('preserves concurrent additions, collection order and group membership across reconnection', () => {
    const { a, b, seed } = peers();
    const left = copy(seed); const right = copy(seed);
    left.setups[0].elements.push({ ...left.setups[0].elements[0], id: 'actor-left' });
    right.setups[0].elements.push({ ...right.setups[0].elements[0], id: 'actor-right' });
    left.setups[0].groups = [{ id: 'group-left', childIds: [left.setups[0].elements[0].id, 'actor-left'] }];
    right.setups[0].layers = [{ id: 'layer-right', name: 'Lighting', locked: false, visible: true, order: 1 }];
    writeLocalChanges(a, seed, left); writeLocalChanges(b, seed, right);
    exchange(a, b);
    const shared = readDocument(a)!;
    expect(shared.setups[0].elements).toHaveLength(seed.setups[0].elements.length + 2);
    expect(shared.setups[0].groups?.[0].childIds).toContain('actor-left');
    expect(shared.setups[0].layers?.[0].id).toBe('layer-right');
    const reordered = copy(shared); reordered.setups[0].elements.reverse();
    writeLocalChanges(a, shared, reordered); exchange(a, b);
    expect(readDocument(b)!.setups[0].elements.map((e) => e.id)).toEqual(reordered.setups[0].elements.map((e) => e.id));
  });

  it('rejects malformed arrays, nonfinite coordinates and external SVG paint references', () => {
    const { seed } = peers();
    const malformed = copy(seed) as any;
    malformed.setups[0].elements[0].path = 'not an array';
    expect(() => assertRoomProject(malformed)).toThrow(/FloorPlanElement/);
    const invalid = copy(seed); invalid.setups[0].elements[0].x = Number.POSITIVE_INFINITY;
    expect(() => assertRoomProject(invalid)).toThrow();
    const paint = copy(seed) as any; paint.setups[0].elements[0].color = 'url(https://example.com/external.svg)';
    expect(() => assertRoomProject(paint)).toThrow(/color/);
  });

  it('does not create a document when a room has no state and rejects missing media', () => {
    expect(readDocument(new Y.Doc())).toBeNull();
    const { seed } = peers();
    seed.setups[0].backgroundImage = { url: 'asset-sha256-123', x: 0, y: 0, width: 100, height: 100, opacity: 1, locked: false, visible: true };
    expect(() => assertRoomProject(seed)).toThrow(/without background images/);
  });

  it('keeps drag packets granular and round-trips a complete native JSON snapshot', () => {
    const { a, seed } = peers();
    const updates: Uint8Array[] = [];
    a.on('update', (update: Uint8Array) => updates.push(update));
    let previous = seed;
    for (let i = 0; i < 50; i++) {
      const next = copy(previous); next.setups[0].elements[0].x += 1;
      writeLocalChanges(a, previous, next); previous = next;
    }
    expect(Math.max(...updates.map((u) => u.length))).toBeLessThan(1024);
    const snapshot = JSON.parse(JSON.stringify(readDocument(a))) as Project;
    assertRoomProject(snapshot);
    expect(snapshot.setups[0].elements[0].x).toBe(seed.setups[0].elements[0].x + 50);
  });
});

describe('invitation boundary', () => {
  it('uses a cryptographic secret in a base-path preserving fragment', () => {
    const invite = createInvite('wss://relay.example');
    const link = inviteLink(invite, 'https://koosoli.github.io/OpenShotDesigner/');
    expect(new URL(link).pathname).toBe('/OpenShotDesigner/');
    expect(new URL(link).search).toBe('');
    expect(parseInvite(link)).toEqual(invite);
    expect(invite.room).toHaveLength(64);
    expect(createInvite(invite.relay).room).not.toBe(invite.room);
  });
  it('rejects remote plaintext, credentials, short codes and query credentials', () => {
    for (const endpoint of ['ws://example.com', 'wss://user:pass@example.com', 'wss://example.com/?secret=x']) expect(() => relayUrl(endpoint)).toThrow();
    expect(() => parseInvite('https://example.com/#collab=' + encodeURIComponent(JSON.stringify({ relay: 'wss://example.com', room: '123456' })))).toThrow();
  });
});
