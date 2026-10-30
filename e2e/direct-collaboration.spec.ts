import { expect, test, type Page, type BrowserContext, type WebSocketRoute } from '@playwright/test';
import { createProject } from '../src/utils/projectLibrary';

const baseUrl = process.env.COLLAB_TEST_BASE_URL ?? 'http://127.0.0.1:3000/';
test.use({ actionTimeout: 15_000 });
async function create(page: Page, title: string, url = baseUrl) {
  await page.goto(url);
  await page.getByPlaceholder('Production title (e.g. The Long Walk Home)').fill(title);
  await page.getByLabel(/Start with the example scenes/).uncheck();
  await page.getByRole('button', { name: 'Full Production', exact: true }).click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByLabel('Project title', { exact: true })).toHaveValue(title);
}
async function join(page: Page, invite: string) {
  await page.goto(invite);
  await page.getByRole('button', { name: 'Join session', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Join session', exact: true }).click();
  await expect(page.getByLabel('Project title', { exact: true })).toHaveValue(/shared plan/, { timeout: 60_000 });
}
async function rename(page: Page, value: string) {
  await page.locator('.actor-element').first().getByText('A', { exact: true }).click();
  await page.getByLabel('Element Name / Label', { exact: true }).fill(value);
  await page.getByLabel('Element Name / Label', { exact: true }).blur();
}

// Deterministic signaling fixture only. Peer discovery remains sealed and all
// plan data crosses real browser WebRTC channels, not this test harness.
function discoveryFixture() {
  const sockets = new Map<WebSocketRoute, Map<string, string>>();
  const frames: string[] = [];
  return {
    frames,
    install: async (context: BrowserContext) => context.routeWebSocket(/^wss:\/\/(?:nos\.lol|cdn\.satellite\.earth|relay\.damus\.io)\/?$/, (socket) => {
      const subscriptions = new Map<string, string>(); sockets.set(socket, subscriptions);
      socket.onClose(() => { sockets.delete(socket); });
      socket.onMessage((raw) => {
        frames.push(String(raw));
        const message = JSON.parse(String(raw));
        if (message[0] === 'REQ') { subscriptions.set(message[1], message[2]['#x'][0]); socket.send(JSON.stringify(['EOSE', message[1]])); }
        if (message[0] === 'CLOSE') subscriptions.delete(message[1]);
        if (message[0] === 'EVENT') {
          const event = message[1]; const topic = event.tags.find((tag: string[]) => tag[0] === 'x')?.[1];
          for (const [peer, topics] of sockets) if (peer.url() === socket.url()) for (const [id, value] of topics) if (value === topic) peer.send(JSON.stringify(['EVENT', id, event]));
        }
      });
    }),
  };
}

for (const mode of ['fixture', 'public-services', 'public-page'] as const) test(`automatic browser sessions (${mode}) need no relay setup or account`, async ({ browser, request }) => {
  test.skip(mode === 'public-services' && process.env.COLLAB_PUBLIC_DISCOVERY_TEST !== '1', 'Optional live public-service check; deterministic real-WebRTC cases run in CI.');
  test.setTimeout(180_000);
  const ca = await browser.newContext(); const cb = await browser.newContext(); const cc = await browser.newContext();
  const discovery = discoveryFixture();
  try {
    if (mode !== 'public-services') await Promise.all([ca, cb, cc].map((context) => discovery.install(context)));
    if (mode === 'public-page' || mode === 'public-services') {
      await Promise.all([ca, cb, cc].map((context) => context.route('https://koosoli.github.io/**', async (route) => {
        const url = new URL(route.request().url());
        const response = await request.get(new URL(url.pathname + url.search, baseUrl).href);
        await route.fulfill({ response });
      })));
    }
    const appUrl = mode === 'public-page' || mode === 'public-services' ? `https://koosoli.github.io${new URL(baseUrl).pathname}` : baseUrl;
    const a = await ca.newPage(); const b = await cb.newPage(); const c = await cc.newPage();
    await create(a, 'Automatic creator', appUrl); await create(b, 'Unrelated guest', appUrl);
    await a.getByRole('button', { name: 'Live collaboration', exact: true }).click();
    await expect(a.getByLabel('Relay address')).toBeHidden();
    await expect(a.getByLabel('Relay creation key')).toBeHidden();
    await a.getByRole('button', { name: 'Start collaboration', exact: true }).click();
    await expect(a.getByLabel('Invitation link', { exact: true })).toBeVisible();
    const invitation = await a.getByLabel('Invitation link', { exact: true }).inputValue();
    const secret = JSON.parse(new URLSearchParams(new URL(invitation).hash.slice(1)).get('collab')!).room;
    expect(invitation).toContain('webrtc');
    await join(b, invitation);
    await a.getByRole('button', { name: 'Live collaboration', exact: true }).click();
    await rename(a, 'Automatic shared actor');
    await expect(b.locator('.actor-element').first()).toContainText('Automatic shared actor', { timeout: 45_000 });
    await join(c, invitation);
    await expect(c.locator('.actor-element').first()).toContainText('Automatic shared actor', { timeout: 45_000 });
    // Guests remain connected after the original session starter leaves.
    await a.close();
    await rename(b, 'Guests without starter');
    await expect(c.locator('.actor-element').first()).toContainText('Guests without starter', { timeout: 45_000 });
    await cb.setOffline(true); await rename(b, 'Offline direct edit'); await cb.setOffline(false);
    await expect(c.locator('.actor-element').first()).toContainText('Offline direct edit', { timeout: 60_000 });
    if (mode !== 'public-services') {
      expect(discovery.frames.some((frame) => frame.includes(secret))).toBe(false);
      expect(discovery.frames.some((frame) => frame.includes('Automatic shared actor'))).toBe(false);
    }
  } finally { await Promise.allSettled([ca.close(), cb.close(), cc.close()]); }
});

test('a plan with storyboard images can share an explicit media-free copy and keep the original intact', async ({ browser }) => {
  test.setTimeout(120_000);
  const creator = await browser.newContext(); const guest = await browser.newContext();
  const discovery = discoveryFixture();
  try {
    await discovery.install(creator); await discovery.install(guest);
    const a = await creator.newPage(); const b = await guest.newPage();
    await create(a, 'Media source');
    const original = createProject({ title: 'Original with storyboards', withSampleScenes: true });
    expect(original.setups[0].shots.some((shot) => shot.storyboardImage || shot.storyboardFrames)).toBe(true);
    const chooser = a.waitForEvent('filechooser');
    await a.getByRole('button', { name: 'Open / Import Project JSON', exact: true }).click();
    await (await chooser).setFiles({ name: 'with-storyboards.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(original)) });
    await expect(a.getByLabel('Project title', { exact: true })).toHaveValue(original.title);
    await a.getByRole('button', { name: 'Live collaboration', exact: true }).click();
    await a.getByText('How to start or join', { exact: true }).click();
    await a.getByRole('button', { name: 'Start collaboration', exact: true }).click();
    await expect(a.getByRole('alert')).toContainText('Share without images');
    await expect(a.getByRole('button', { name: 'Copy invite link', exact: true })).toBeHidden();
    await expect(a.getByLabel('Project title', { exact: true })).toHaveValue(original.title);
    await a.getByRole('checkbox', { name: /^Share without images/ }).check();
    await a.getByRole('button', { name: 'Start collaboration', exact: true }).click();
    await expect(a.getByRole('button', { name: 'Copy invite link', exact: true })).toBeInViewport();
    const invitation = await a.getByLabel('Invitation link', { exact: true }).inputValue();
    await join(b, invitation);
    await expect(b.locator('.actor-element')).toHaveCount(original.setups[0].elements.filter((element) => element.type === 'actor').length);
    const saved = await a.evaluate((id) => new Promise<unknown>((resolve, reject) => {
      const open = indexedDB.open('local-workspace-v1');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const get = db.transaction('projects', 'readonly').objectStore('projects').get(id);
        get.onsuccess = () => { resolve(get.result); db.close(); };
        get.onerror = () => { reject(get.error); db.close(); };
      };
    }), original.id);
    // Import fits the viewport; the source objects, shots and their media stay intact.
    expect(saved).toMatchObject({ title: original.title, activeSetupId: original.activeSetupId,
      setups: original.setups.map((setup) => ({ id: setup.id, name: setup.name, elements: setup.elements, shots: setup.shots })),
    });
    await a.screenshot({ path: 'test-results/collaboration-invite-media-copy.png', fullPage: true });
  } finally { await Promise.allSettled([creator.close(), guest.close()]); }
});

test('direct collaboration transfers a chunked thousand-object plan and applies the following edit', async ({ browser }) => {
  test.setTimeout(120_000);
  const ca = await browser.newContext(); const cb = await browser.newContext();
  const discovery = discoveryFixture();
  try {
    await discovery.install(ca); await discovery.install(cb);
    const a = await ca.newPage(); const b = await cb.newPage();
    await create(a, 'Large direct source'); await create(b, 'Large direct guest');
    const project = createProject({ title: 'Thousand-object direct plan' });
    const actor = project.setups[0].elements.find((e) => e.type === 'actor')!;
    project.setups[0].elements = Array.from({ length: 1000 }, (_, i) => ({ ...actor, id: `direct-actor-${i}`, x: (i % 40) * 120, y: Math.floor(i / 40) * 120 }));
    project.setups[0].shots = [];
    const chooser = a.waitForEvent('filechooser');
    await a.getByRole('button', { name: 'Open / Import Project JSON', exact: true }).click();
    await (await chooser).setFiles({ name: 'large-direct.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) });
    await expect(a.getByLabel('Project title', { exact: true })).toHaveValue(project.title);
    await a.getByRole('button', { name: 'Live collaboration', exact: true }).click();
    await a.getByRole('button', { name: 'Start collaboration', exact: true }).click();
    await expect(a.getByLabel('Invitation link', { exact: true })).toBeVisible();
    await join(b, await a.getByLabel('Invitation link', { exact: true }).inputValue());
    await expect(b.locator('.actor-element')).toHaveCount(1000, { timeout: 45_000 });
    await a.getByRole('button', { name: 'Live collaboration', exact: true }).click();
    await a.getByLabel('Scene Setup Name', { exact: true }).fill('After the chunked transfer');
    await a.getByLabel('Scene Setup Name', { exact: true }).blur();
    await expect(b.getByLabel('Scene Setup Name', { exact: true })).toHaveValue('After the chunked transfer', { timeout: 30_000 });
  } finally { await Promise.allSettled([ca.close(), cb.close()]); }
});
