import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createCollaborationRelay } from '../server/collaborationRelay';
import type { Project } from '../src/types';
import { WebSocketServer } from 'ws';
import * as Y from 'yjs';
import { fileURLToPath } from 'node:url';

const baseUrl = process.env.COLLAB_TEST_BASE_URL ?? 'http://127.0.0.1:3000/';
const relay = createCollaborationRelay({ origins: [new URL(baseUrl).origin] });
test.use({ actionTimeout: 15_000 });
let endpoint = '';
test.beforeAll(async () => { endpoint = `ws://127.0.0.1:${await relay.listen(0)}`; });
test.afterAll(async () => { await relay.close(); });

async function create(page: Page, title: string) {
  await page.goto(baseUrl);
  await page.getByPlaceholder('Production title (e.g. The Long Walk Home)').fill(title);
  await page.getByLabel(/Start with the example scenes/).uncheck();
  await page.getByRole('button', { name: 'Full Production', exact: true }).click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Project title', exact: true })).toHaveValue(title);
}
async function snapshot(page: Page): Promise<Project> {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save project file', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Save project file format' });
  await dialog.getByLabel(/JSON/).check();
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  const download = await downloadPromise;
  return JSON.parse(await readFile((await download.path())!, 'utf8')) as Project;
}
async function join(page: Page, invite: string) {
  await page.goto(invite);
  await page.getByRole('button', { name: 'Join session', exact: true }).click();
  await page.getByRole('alertdialog', { name: 'Join shared floor plan?' }).getByRole('button', { name: 'Join session', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Project title', exact: true })).toHaveValue(/shared plan/);
  await page.getByRole('button', { name: 'Live collaboration', exact: true }).click();
  await expect(page.getByText(/Changes received by the relay/)).toBeVisible();
  await page.getByRole('button', { name: 'Live collaboration', exact: true }).click();
}
async function renameActor(page: Page, value: string) {
  await page.locator('.actor-element').first().getByText('A', { exact: true }).click();
  await page.getByLabel('Element Name / Label', { exact: true }).fill(value);
  await page.getByLabel('Element Name / Label', { exact: true }).blur();
}

test('three isolated browsers share a real editor, retain originals, undo locally, reconnect, refresh and export', async ({ browser }) => {
  test.setTimeout(120_000);
  const ca = await browser.newContext(); const cb = await browser.newContext(); const cc = await browser.newContext();
  const a = await ca.newPage(); const b = await cb.newPage(); const c = await cc.newPage();
  try {
    await create(a, 'Creator original'); await create(b, 'Guest unrelated original');
    const titleBounds = await a.getByLabel('Project title', { exact: true }).boundingBox();
    const shareBounds = await a.getByRole('button', { name: 'Live collaboration', exact: true }).boundingBox();
    expect(titleBounds!.width).toBeGreaterThan(80);
    expect(titleBounds!.x + titleBounds!.width).toBeLessThanOrEqual(shareBounds!.x);
    const original = await snapshot(a); const guestOriginal = await snapshot(b);
    await a.getByRole('button', { name: 'Live collaboration', exact: true }).click();
    await a.getByText('Private relay (optional)', { exact: true }).click();
    await a.getByLabel('Relay address').fill(endpoint);
    await a.getByRole('button', { name: 'Start collaboration', exact: true }).click();
    await expect(a.getByRole('textbox', { name: 'Project title', exact: true })).toHaveValue(/shared plan/);
    const invite = await a.getByLabel('Invitation link', { exact: true }).inputValue();
    await expect(a.getByText(/Changes received by the relay/)).toBeVisible();
    await a.getByRole('button', { name: 'Live collaboration', exact: true }).click();
    await join(b, invite); await join(c, invite);
    const originalStillStored = await a.evaluate((id) => new Promise<Project | undefined>((resolve, reject) => {
      const open = indexedDB.open('local-workspace-v1');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const get = db.transaction('projects', 'readonly').objectStore('projects').get(id);
        get.onsuccess = () => { resolve(get.result); db.close(); };
        get.onerror = () => { reject(get.error); db.close(); };
      };
    }), original.id);
    expect(originalStillStored?.title).toBe('Creator original');
    expect(originalStillStored?.setups[0].elements).toEqual(original.setups[0].elements);
    const joined = await snapshot(b);
    expect(joined.id).not.toBe(original.id);
    expect(joined.id).not.toBe(guestOriginal.id);
    expect(joined.setups[0].elements).toEqual(original.setups[0].elements);
    await renameActor(a, 'Shared actor');
    await expect(b.locator('.actor-element').first()).toContainText('Shared actor');
    await expect(c.locator('.actor-element').first()).toContainText('Shared actor');
    // Guest edits a different field; creator's Undo must leave that change intact.
    await b.getByLabel('Scene Setup Name', { exact: true }).fill('Guest scene');
    await b.getByLabel('Scene Setup Name', { exact: true }).blur();
    await expect(a.getByText('Guest scene', { exact: true }).first()).toBeVisible();
    await a.getByRole('button', { name: 'Undo (Ctrl+Z)', exact: true }).click();
    await expect(b.locator('.actor-element').first()).not.toContainText('Shared actor');
    expect((await snapshot(b)).setups[0].name).toBe('Guest scene');
    // Closing the creator does not stop the two guests.
    await a.close();
    await renameActor(b, 'Guests continue');
    await expect(c.locator('.actor-element').first()).toContainText('Guests continue');
    await cb.setOffline(true);
    await renameActor(b, 'Offline local edit');
    await b.getByRole('button', { name: 'Live collaboration', exact: true }).click();
    await expect(b.getByText('Offline: changes not shared', { exact: true }).last()).toBeVisible();
    await cb.setOffline(false);
    await expect(c.locator('.actor-element').first()).toContainText('Offline local edit');
    await b.getByRole('button', { name: 'Live collaboration', exact: true }).click();
    // Rejoin from persisted CRDT state after refresh, without duplicating seed objects.
    await b.reload(); await b.getByRole('button', { name: 'Join session', exact: true }).click();
    await b.getByRole('alertdialog', { name: 'Join shared floor plan?' }).getByRole('button', { name: 'Join session', exact: true }).click();
    await expect(b.getByRole('button', { name: 'Live collaboration', exact: true })).toHaveAttribute('title', /^Live/);
    await expect(b.locator('.actor-element').first()).toContainText('Offline local edit');
    const exported = await snapshot(b);
    expect(exported.setups[0].elements).toHaveLength(original.setups[0].elements.length);
    expect(exported.setups[0].name).toBe('Guest scene');
    expect(exported.setups[0].elements).toEqual((await snapshot(c)).setups[0].elements);
    // An ordinary .osd package must be usable outside the room as well.
    const downloadPromise = b.waitForEvent('download');
    await b.getByRole('button', { name: 'Save project file', exact: true }).click();
    const save = b.getByRole('dialog', { name: 'Save project file format' });
    await save.getByLabel(/OSD|\.osd/).check();
    await save.getByRole('button', { name: 'Save', exact: true }).click();
    const packageFile = await (await downloadPromise).path();
    expect(packageFile).toBeTruthy();
    await b.getByRole('button', { name: 'Live collaboration', exact: true }).click();
    await b.getByRole('button', { name: 'Leave session', exact: true }).click();
    const choose = b.waitForEvent('filechooser');
    await b.getByRole('button', { name: 'Open / Import Project JSON', exact: true }).click();
    await (await choose).setFiles(packageFile!);
    await expect(b.locator('.actor-element').first()).toContainText('Offline local edit');
    expect((await snapshot(b)).setups[0].elements).toEqual(exported.setups[0].elements);
    await b.screenshot({ path: 'test-results/collaboration-preview.png', fullPage: true });
  } finally { await ca.close(); await cb.close(); await cc.close(); }
});

test('a fresh browser waits for unavailable room data without replacing its local plan', async ({ page }) => {
  await create(page, 'Keep this local plan');
  const before = await snapshot(page);
  const { createInvite, inviteLink } = await import('../src/collaboration/invite');
  const invite = inviteLink(createInvite(endpoint), baseUrl);
  await page.goto(invite);
  await page.getByRole('button', { name: 'Join session', exact: true }).click();
  await page.getByRole('alertdialog', { name: 'Join shared floor plan?' }).getByRole('button', { name: 'Join session', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Live collaboration', exact: true })).toHaveAttribute('title', 'Waiting for document');
  await expect(page.getByRole('textbox', { name: 'Project title', exact: true })).toHaveValue('Keep this local plan');
  const after = await snapshot(page);
  expect(after.id).toBe(before.id);
  expect(after.setups).toEqual(before.setups);
});

test('protected room creation keeps the creation key out of invitations and admits a signed guest', async ({ page, browser }) => {
  const creationKey = '1'.repeat(64); // Fixed test-only keys.
  const secure = createCollaborationRelay({ origins: [new URL(baseUrl).origin], publicAccess: { creationKey, signingKey: '2'.repeat(64) } });
  const port = await secure.listen(0);
  const guestContext = await browser.newContext();
  try {
    await create(page, 'Protected source');
    await page.getByRole('button', { name: 'Live collaboration', exact: true }).click();
    await page.getByText('Private relay (optional)', { exact: true }).click();
    await page.getByLabel('Relay address').fill(`ws://127.0.0.1:${port}`);
    await page.getByRole('button', { name: 'Start collaboration', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('403');
    await expect(page.getByRole('textbox', { name: 'Project title', exact: true })).toHaveValue('Protected source');
    await page.getByLabel('Relay creation key', { exact: true }).fill(creationKey);
    await page.getByRole('button', { name: 'Start collaboration', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Project title', exact: true })).toHaveValue(/shared plan/);
    const invitation = await page.getByLabel('Invitation link', { exact: true }).inputValue();
    expect(invitation).not.toContain(creationKey);
    expect(invitation).not.toContain('creationKey');
    const parsed = JSON.parse(new URLSearchParams(new URL(invitation).hash.slice(1)).get('collab')!);
    expect(parsed.ticket).toBeTruthy();
    const guest = await guestContext.newPage();
    await join(guest, invitation);
    await renameActor(page, 'Protected shared actor');
    await expect(guest.locator('.actor-element').first()).toContainText('Protected shared actor');
  } finally { await guestContext.close(); await secure.close(); }
});

test('a malicious relay cannot replace or receive the unrelated local production', async ({ page }) => {
  await create(page, 'Local confidential production');
  const original = await snapshot(page);
  const { roomProject, seedDocument } = await import('../src/collaboration/model');
  const doc = new Y.Doc(); seedDocument(doc, roomProject(original));
  const actorId = original.setups[0].elements.find((e) => e.type === 'actor')!.id;
  doc.getMap('plan').set(`elements:${JSON.stringify(actorId)}:name`, JSON.stringify({ injected: '<img src=x onerror=alert(1)>' }));
  const hostile = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await new Promise<void>((resolve) => hostile.once('listening', resolve));
  const address = hostile.address() as { port: number };
  const received: string[] = [];
  hostile.on('connection', (socket) => {
    socket.on('message', (raw) => received.push(raw.toString()));
    socket.send(JSON.stringify({ type: 'update', data: Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64') }));
  });
  try {
    const { createInvite, inviteLink } = await import('../src/collaboration/invite');
    await page.goto(inviteLink(createInvite(`ws://127.0.0.1:${address.port}`), baseUrl));
    await page.getByRole('button', { name: 'Join session', exact: true }).click();
    await page.getByRole('alertdialog', { name: 'Join shared floor plan?' }).getByRole('button', { name: 'Join session', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Live collaboration', exact: true })).toHaveAttribute('title', 'Collaboration needs attention');
    await page.getByRole('button', { name: 'Live collaboration', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Collaboration stopped');
    await expect(page.getByRole('textbox', { name: 'Project title', exact: true })).toHaveValue('Local confidential production');
    const after = await snapshot(page);
    expect(after.id).toBe(original.id); expect(after.setups).toEqual(original.setups);
    for (const raw of received) {
      const message = JSON.parse(raw);
      if (message.type !== 'update') continue;
      const sent = new Y.Doc();
      Y.applyUpdate(sent, new Uint8Array(Buffer.from(message.data, 'base64')));
      expect(sent.getMap('meta').has('seed')).toBe(false);
      sent.destroy();
    }
  } finally {
    hostile.clients.forEach((socket) => socket.terminate());
    await new Promise<void>((resolve) => hostile.close(() => resolve())); doc.destroy();
  }
});

test('shared label text is rendered as text instead of executable HTML', async ({ page }) => {
  await create(page, 'Escaped text');
  await page.getByRole('button', { name: 'Live collaboration', exact: true }).click();
  await page.getByText('Private relay (optional)', { exact: true }).click();
  await page.getByLabel('Relay address').fill(endpoint);
  await page.getByRole('button', { name: 'Start collaboration', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Project title', exact: true })).toHaveValue(/shared plan/);
  await page.getByRole('button', { name: 'Live collaboration', exact: true }).click();
  const payload = '<img src=x onerror="document.body.dataset.injected=1">';
  await renameActor(page, payload);
  await expect(page.locator('.actor-element').first()).toContainText(payload);
  await expect(page.locator('.actor-element img, .actor-element script')).toHaveCount(0);
  expect(await page.locator('body').getAttribute('data-injected')).toBeNull();
});

test('the production policy blocks an injected inline script', async ({ page }) => {
  test.skip(!process.env.COLLAB_TEST_BASE_URL, 'The development server needs its own HMR script policy.');
  await create(page, 'Production policy');
  expect(await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')).not.toContain("'unsafe-eval'");
  await page.evaluate(() => {
    const script = document.createElement('script');
    script.textContent = 'document.body.dataset.untrustedScript = "executed"';
    document.head.appendChild(script);
  });
  expect(await page.locator('body').getAttribute('data-untrusted-script')).toBeNull();
});

test('the production policy preserves screenplay PDF import and shot-list PDF export', async ({ page }) => {
  test.skip(!process.env.COLLAB_TEST_BASE_URL, 'Checks the built production policy.');
  await create(page, 'Production PDF compatibility');
  await page.locator('#tab-script').click();
  await page.locator('input[type="file"][accept*=".celtx"]').setInputFiles(fileURLToPath(new URL('./fixtures/bank-job.pdf', import.meta.url)));
  await page.getByText('Screenplay', { exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Set / location' }).first()).toHaveValue('BANK');
  await expect(page.getByRole('textbox', { name: 'Dialogue' })).toHaveValue('Give it back.');
  await page.getByRole('button', { name: /Shot list/ }).click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download the shot list as a PDF' }).click();
  const downloaded = await downloading;
  expect(downloaded.suggestedFilename()).toMatch(/\.pdf$/);
  expect(await downloaded.path()).toBeTruthy();
});

test('an unconfigured public installation refuses a hostile relay before connecting', async ({ browser, request }) => {
  test.skip(!process.env.COLLAB_TEST_BASE_URL, 'Requires the built installation.');
  const context = await browser.newContext({ serviceWorkers: 'block' });
  try {
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== 'https://public.example') { await route.abort(); return; }
      const response = await request.get(new URL(url.pathname + url.search, baseUrl).href);
      await route.fulfill({ response });
    });
    const page = await context.newPage();
    const sockets: string[] = [];
    page.on('websocket', (socket) => sockets.push(socket.url()));
    const url = new URL('https://public.example/OpenShotDesigner/');
    url.hash = new URLSearchParams({ collab: JSON.stringify({ relay: 'wss://attacker.example', room: 'a'.repeat(64) }) }).toString();
    await page.goto(url.href);
    await expect(page.getByRole('button', { name: 'Start collaboration', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Join session', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('not configured');
    expect(sockets).toEqual([]);
  } finally { await context.close(); }
});

test('adding a scene stops sharing and preserves the whole local production against later remote changes', async ({ browser }) => {
  const ownerContext = await browser.newContext(); const guestContext = await browser.newContext();
  try {
    const owner = await ownerContext.newPage(); const guest = await guestContext.newPage();
    await create(owner, 'Scene boundary audit');
    await owner.getByRole('button', { name: 'Live collaboration', exact: true }).click();
    await owner.getByText('Private relay (optional)', { exact: true }).click();
    await owner.getByLabel('Relay address').fill(endpoint);
    await owner.getByRole('button', { name: 'Start collaboration', exact: true }).click();
    await expect(owner.getByLabel('Invitation link', { exact: true })).toBeVisible();
    await join(guest, await owner.getByLabel('Invitation link', { exact: true }).inputValue());
    await owner.getByRole('button', { name: 'Live collaboration', exact: true }).click();
    await owner.getByRole('button', { name: /^Sc / }).click();
    await owner.getByRole('button', { name: '+ New Scene Setup', exact: true }).click();
    await owner.getByRole('button', { name: 'Live collaboration', exact: true }).click();
    await expect(owner.getByRole('alert')).toContainText('Collaboration stopped');
    await expect(owner.getByRole('alert')).toContainText('one fixed plan');
    const before = await snapshot(owner); expect(before.setups).toHaveLength(2);
    await renameActor(guest, 'Guest after owner left');
    await expect(guest.locator('.actor-element').first()).toContainText('Guest after owner left');
    const after = await snapshot(owner);
    expect(after.setups).toEqual(before.setups);
  } finally { await ownerContext.close(); await guestContext.close(); }
});
