import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { createProject } from '../../utils/projectLibrary';
import type { Project } from '../../types';
import { LOCAL_ORIGIN, MAX_DOCUMENT_BYTES, localChanges, projectView, readDocument, seedDocument, writeLocalChanges } from '../model';
import { assertProductionProject, decodeProductionFields, productionFields, productionProject } from '../productionModel';
import { validateIncomingUpdate } from '../validateUpdate';

const copy = (project: Project): Project => JSON.parse(JSON.stringify(project));
function peers(samples = false) {
  const original = createProject({ title: 'Shared production', withSampleScenes: samples });
  const seed = productionProject(original);
  const a = new Y.Doc(); const b = new Y.Doc(); seedDocument(a, seed); Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  return { original, seed, a, b };
}
function exchange(a: Y.Doc, b: Y.Doc) {
  const au = Y.encodeStateAsUpdate(a); const bu = Y.encodeStateAsUpdate(b);
  Y.applyUpdate(a, bu); Y.applyUpdate(b, au);
  expect(readDocument(a)).toEqual(readDocument(b));
}

describe('whole-production collaboration', () => {
  it('round-trips every sample production module, including scripts, contacts, schedules and budgets', () => {
    const { original, seed, a } = peers(true);
    expect(seed.setups).toHaveLength(original.setups.length);
    expect(seed.scriptLines).toEqual(original.scriptLines);
    expect(seed.people?.map(({ headshotAssetId: _image, ...person }) => person)).toEqual(original.people?.map(({ headshotAssetId: _image, ...person }) => person));
    expect(seed.productionDays).toEqual(original.productionDays);
    expect(seed.tasks).toEqual(original.tasks);
    expect(seed.budget).toEqual(original.budget);
    expect(seed.director).toBe(original.director);
    expect(readDocument(a)).toEqual(seed);
    expect(Y.encodeStateAsUpdate(a).length).toBeLessThan(MAX_DOCUMENT_BYTES);
  });

  it('removes media from every module and revision snapshot without touching the original', () => {
    const original = createProject({ title: 'With media', withSampleScenes: true });
    original.logo = 'data:image/png;base64,AA==';
    original.people![0].headshotAssetId = 'asset-sha256-headshot';
    original.locations![0].referenceAssetIds = ['asset-sha256-photo'];
    original.moodBoards![0].cards[0].assetId = 'asset-sha256-mood';
    original.productionDays![0].callSheet = { ...original.productionDays![0].callSheet, mapAssetId: 'asset-sha256-map' };
    original.revisions = [{ id: 'milestone', name: 'Before shoot', createdAt: '2026-10-30', snapshot: copy(original) }];
    const before = copy(original);
    const shared = productionProject(original);
    expect(original).toEqual(before);
    const text = JSON.stringify(shared);
    for (const marker of ['data:image', 'asset-sha256-headshot', 'asset-sha256-photo', 'asset-sha256-mood', 'asset-sha256-map']) expect(text).not.toContain(marker);
    expect(shared.moodBoards![0].cards[0].caption).toBe(original.moodBoards![0].cards[0].caption);
    expect(shared.revisions![0].snapshot.scriptLines).toEqual(original.scriptLines);
    expect(() => productionProject(original, false)).toThrow();
    expect(() => assertProductionProject({ ...shared, logo: 'https://example.com/image.png' })).toThrow(/attachments/);
    shared.revisions![0].snapshot.logo = 'asset-sha256-secret';
    expect(() => assertProductionProject(shared)).toThrow(/attachments/);
  });

  it('merges offline edits to different screenplay paragraphs and independent preproduction fields', () => {
    const { seed, a, b } = peers(true);
    const left = copy(seed); const right = copy(seed);
    left.scriptLines![0].text = 'Changed by the writer';
    right.scriptLines![1].text = 'Changed by the director';
    left.people![0].displayName = 'Updated crew name';
    right.productionDays![0].notes = 'Meet at the north entrance';
    writeLocalChanges(a, seed, left); writeLocalChanges(b, seed, right); exchange(a, b);
    const merged = readDocument(a)!;
    expect(merged.scriptLines![0].text).toBe(left.scriptLines![0].text);
    expect(merged.scriptLines![1].text).toBe(right.scriptLines![1].text);
    expect(merged.people![0].displayName).toBe(left.people![0].displayName);
    expect(merged.productionDays![0].notes).toBe(right.productionDays![0].notes);
  });

  it('preserves concurrent record insertions and lets deletion win over an offline edit', () => {
    const { seed, a, b } = peers();
    seed.scriptLines = [{ id: 'line', type: 'action', text: 'Original', lineNumber: 1 }];
    // Seed a separate room after adding the screenplay fixture.
    a.destroy(); b.destroy();
    const first = new Y.Doc(); const second = new Y.Doc(); seedDocument(first, seed); Y.applyUpdate(second, Y.encodeStateAsUpdate(first));
    const left = copy(seed); const right = copy(seed);
    left.scriptLines = [{ id: 'left', type: 'action', text: 'Left insertion', lineNumber: 1 }];
    right.scriptLines![0].text = 'Offline edit of deleted line';
    right.scriptLines!.push({ id: 'right', type: 'action', text: 'Right insertion', lineNumber: 2 });
    writeLocalChanges(first, seed, left); writeLocalChanges(second, seed, right); exchange(first, second);
    expect(readDocument(first)!.scriptLines!.map((line) => line.id).sort()).toEqual(['left', 'right']);
  });

  it('keeps text and its formatting anchors atomic when two participants edit the same paragraph', () => {
    const { a, seed } = peers(true);
    const b = new Y.Doc(); Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    const index = seed.scriptLines!.findIndex((line) => line.type === 'action');
    const left = copy(seed); const right = copy(seed);
    Object.assign(left.scriptLines![index], { text: 'Left', styles: [{ start: 0, end: 4, bold: true }] });
    Object.assign(right.scriptLines![index], { text: 'Right', styles: [{ start: 0, end: 5, italic: true }] });
    writeLocalChanges(a, seed, left); writeLocalChanges(b, seed, right); exchange(a, b);
    expect([left.scriptLines![index], right.scriptLines![index]]).toContainEqual(readDocument(a)!.scriptLines![index]);
  });

  it('synchronizes scene creation, deletion and edits while retaining each browser navigation and id', () => {
    const { seed, a, b } = peers(true);
    const local = projectView(seed); local.activeSetupId = local.setups[1].id;
    local.setups[1].canvasScale = 2; local.setups[1].currentBeat = 2;
    const before = Y.encodeStateAsUpdate(a);
    expect(localChanges(projectView(seed, local), local, 'project').size).toBe(0);
    expect(Y.encodeStateAsUpdate(a)).toEqual(before);
    const next = copy(seed); next.setups[0].name = 'Other scene changed';
    writeLocalChanges(a, seed, next); exchange(a, b);
    const view = projectView(readDocument(b)!, local);
    expect(view.id).toBe(local.id); expect(view.activeSetupId).toBe(local.activeSetupId);
    expect(view.setups[1].canvasScale).toBe(2); expect(view.setups[1].currentBeat).toBe(2);
    expect(view.setups[0].name).toBe('Other scene changed');
  });

  it('keeps local-only undo across script and budget edits without reverting incoming crew changes', () => {
    const { seed, a, b } = peers(true);
    const undo = new Y.UndoManager(a.getMap('plan'), { trackedOrigins: new Set([LOCAL_ORIGIN]) });
    const left = copy(seed); left.scriptLines![0].text = 'Local writing';
    const right = copy(seed); right.people![0].displayName = 'Remote person';
    writeLocalChanges(a, seed, left); writeLocalChanges(b, seed, right); exchange(a, b);
    undo.undo(); exchange(a, b);
    expect(readDocument(a)!.scriptLines![0].text).toBe(seed.scriptLines![0].text);
    expect(readDocument(a)!.people![0].displayName).toBe('Remote person');
  });

  it('rejects prototype paths, malformed module data, media injection and seed replacement before applying', () => {
    const { a } = peers(true); const snapshot = Y.encodeStateAsUpdate(a);
    for (const [key, value] of [
      ['p:["__proto__","polluted"]', '["v",true]'],
      ['p:["people"]', '["v","not an array"]'],
      ['p:["logo"]', '["v","https://example.com/logo.png"]'],
      ['p:["unexpectedProperty"]', '["v","hidden"]'],
    ]) {
      const attacker = new Y.Doc(); Y.applyUpdate(attacker, snapshot); attacker.getMap('plan').set(key, value);
      expect(() => validateIncomingUpdate(snapshot, Y.encodeStateAsUpdate(attacker))).toThrow();
      attacker.destroy();
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('accepts literal website URLs and long screenplay source while rejecting executable URLs and excessive geometry', () => {
    const { seed } = peers(); seed.productionCompanyInfo = { website: 'https://example.com' }; seed.scriptText = 'Screenplay\n'.repeat(3000);
    expect(decodeProductionFields(productionFields(seed)).scriptText).toBe(seed.scriptText);
    expect(() => productionFields({ ...seed, productionCompanyInfo: { website: 'javascript:alert(1)' } })).toThrow();
    seed.setups[0].elements[0].x = 1e10;
    expect(() => productionFields(seed)).toThrow();
  });

  it('keeps newly attached images local while production edits continue to synchronize', () => {
    const { seed, a } = peers(true);
    const local = projectView(seed);
    const withMedia = copy(local);
    withMedia.logo = 'asset-sha256-personal-logo';
    withMedia.people![0].headshotAssetId = 'asset-sha256-personal-headshot';
    withMedia.setups[0].backgroundImage = { url: 'asset-sha256-personal-plan', x: 0, y: 0, width: 100, height: 100, opacity: 1, locked: false, visible: true };
    expect(localChanges(local, withMedia, 'project').size).toBe(0);
    const remote = copy(seed); remote.director = 'Incoming director';
    writeLocalChanges(a, seed, remote);
    const view = projectView(readDocument(a)!, withMedia);
    expect(view.logo).toBe(withMedia.logo);
    expect(view.people![0].headshotAssetId).toBe(withMedia.people![0].headshotAssetId);
    expect(view.setups[0].backgroundImage).toEqual(withMedia.setups[0].backgroundImage);
    expect(view.director).toBe('Incoming director');
    expect(JSON.stringify(readDocument(a))).not.toContain('personal-');
  });

  it('remaps project-level review and mood-board links to each local library identity', () => {
    const original = createProject({ withSampleScenes: true });
    original.reviewComments = [{ id: 'review', targetKind: 'project', targetId: original.id, targetLabel: 'Production', body: 'Review production', createdAt: '2026-10-30', replies: [] }];
    original.moodBoards![0].cards[0].linkedEntity = { kind: 'project', id: original.id };
    const seed = productionProject(original);
    expect(seed.reviewComments![0].targetId).toBe(seed.id);
    const view = projectView(seed);
    expect(view.reviewComments![0].targetId).toBe(view.id);
    expect(view.moodBoards![0].cards[0].linkedEntity?.id).toBe(view.id);
    expect(decodeProductionFields(productionFields(view)).reviewComments![0].targetId).toBe(seed.id);
  });
});
