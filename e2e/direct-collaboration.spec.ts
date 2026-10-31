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
  await expect(page.getByLabel('Project title', { exact: true })).toHaveValue(/shared (?:plan|project)/, { timeout: 60_000 });
}
async function rename(page: Page, value: string) {
  await page.locator('.actor-element').first().getByText('A', { exact: true }).click();
  await page.getByLabel('Element Name / Label', { exact: true }).fill(value);
  await page.getByLabel('Element Name / Label', { exact: true }).blur();
}

// Deterministic signaling fixture only. Peer discovery remains sealed and all
// plan data crosses real browser WebRTC channels, not this test harness.
function discoveryFixture(unavailableService?: string) {
  const sockets = new Map<WebSocketRoute, Map<string, string>>();
  const frames: string[] = [];
  const connections = new Map<string, number>();
  return {
    frames, connections,
    install: async (context: BrowserContext) => context.routeWebSocket(/^wss:\/\/(?:nos\.lol|cdn\.satellite\.earth|relay\.damus\.io)\/?$/, async (socket) => {
      const origin = new URL(socket.url()).origin;
      connections.set(origin, (connections.get(origin) ?? 0) + 1);
      if (origin === unavailableService) { await socket.close({ code: 1013, reason: 'Temporarily unavailable' }); return; }
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

test('an unavailable discovery service stops rapid retries while collaboration continues through healthy services', async ({ browser }) => {
  test.setTimeout(60_000);
  const creator = await browser.newContext(); const guest = await browser.newContext();
  const failedService = 'wss://relay.damus.io';
  const discovery = discoveryFixture(failedService);
  try {
    await discovery.install(creator); await discovery.install(guest);
    const a = await creator.newPage(); const b = await guest.newPage();
    await create(a, 'Discovery failover');
    await a.getByRole('button', { name: 'Live collaboration', exact: true }).click();
    await a.getByRole('button', { name: 'Start collaboration', exact: true }).click();
    await expect(a.getByLabel('Invitation link', { exact: true })).toBeVisible();
    await join(b, await a.getByLabel('Invitation link', { exact: true }).inputValue());
    await a.getByRole('button', { name: 'Live collaboration', exact: true }).click();
    await rename(a, 'Shared through the healthy services');
    await expect(b.locator('.actor-element').first()).toContainText('Shared through the healthy services');
    await expect.poll(() => discovery.connections.get(failedService), { timeout: 10_000 }).toBe(6);
    // An observation window catches a fourth rapid attempt without relying
    // on mocked browser clocks for the real WebRTC/crypto connections.
    await a.waitForTimeout(10_000);
    expect(discovery.connections.get(failedService)).toBe(6);
    expect(discovery.connections.get('wss://nos.lol')).toBe(2);
    expect(discovery.connections.get('wss://cdn.satellite.earth')).toBe(2);
    await rename(b, 'Still connected after retry cooldown');
    await expect(a.locator('.actor-element').first()).toContainText('Still connected after retry cooldown');
  } finally { await Promise.allSettled([creator.close(), guest.close()]); }
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

test('the whole production synchronizes scripts, crew, tasks and all scenes while navigation stays personal', async ({ browser }) => {
  test.setTimeout(120_000);
  const creator = await browser.newContext(); const guest = await browser.newContext();
  const discovery = discoveryFixture();
  try {
    if (process.env.COLLAB_PUBLIC_DISCOVERY_TEST !== '1') { await discovery.install(creator); await discovery.install(guest); }
    const a = await creator.newPage(); const b = await guest.newPage();
    await create(a, 'Full production source');
    const original = createProject({ title: 'Entire production', withSampleScenes: true });
    const chooser = a.waitForEvent('filechooser');
    await a.getByRole('button', { name: 'Open / Import Project JSON', exact: true }).click();
    await (await chooser).setFiles({ name: 'production.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(original)) });
    await expect(a.getByLabel('Project title', { exact: true })).toHaveValue(original.title);
    await a.getByRole('button', { name: 'Live collaboration', exact: true }).click();
    await a.getByRole('button', { name: 'Start collaboration', exact: true }).click();
    await expect(a.getByLabel('Invitation link', { exact: true })).toBeVisible();
    await join(b, await a.getByLabel('Invitation link', { exact: true }).inputValue());
    await a.getByRole('button', { name: 'Live collaboration', exact: true }).click();
    for (const page of [a, b]) {
      await page.locator('#tab-script').click();
      await page.getByText('Screenplay', { exact: true }).click();
    }
    await a.getByRole('textbox', { name: 'Action', exact: true }).first().fill('The creator edits the shared screenplay.');
    await a.getByRole('textbox', { name: 'Action', exact: true }).first().blur();
    await expect(b.getByRole('textbox', { name: 'Action', exact: true }).first()).toHaveValue('The creator edits the shared screenplay.');
    await b.getByRole('textbox', { name: 'Action', exact: true }).last().fill('The guest writes another paragraph.');
    await b.getByRole('textbox', { name: 'Action', exact: true }).last().blur();
    await expect(a.getByRole('textbox', { name: 'Action', exact: true }).last()).toHaveValue('The guest writes another paragraph.');
    const module = async (page: Page, name: string) => {
      await page.getByRole('button', { name: /^Production modules/ }).click();
      await page.getByRole('button', { name, exact: true }).click();
    };
    await module(a, 'Crew'); await module(b, 'Crew');
    await a.locator('#right-sidebar details').filter({ hasText: original.people![0].displayName }).locator('summary').click();
    await a.getByRole('button').filter({ hasText: original.people![0].displayName }).first().click();
    await a.getByPlaceholder('Full name', { exact: true }).fill('Shared crew edit');
    await a.getByPlaceholder('Full name', { exact: true }).blur();
    await a.getByRole('button', { name: 'Save', exact: true }).click();
    await b.locator('#right-sidebar details').filter({ hasText: 'Shared crew edit' }).locator('summary').click();
    await expect(b.getByRole('button').filter({ hasText: 'Shared crew edit' }).first()).toBeVisible();
    await module(a, 'Budget'); await module(b, 'Budget');
    await b.getByLabel('Currency', { exact: true }).fill('USD');
    await b.getByLabel('Currency', { exact: true }).blur();
    await expect(a.getByLabel('Currency', { exact: true })).toHaveValue('USD');
    await module(a, 'Tasks'); await module(b, 'Tasks');
    await a.getByLabel('Board name', { exact: true }).fill('Shared preproduction tasks');
    await a.getByLabel('Board name', { exact: true }).blur();
    await expect(b.getByLabel('Board name', { exact: true })).toHaveValue('Shared preproduction tasks');
    await b.reload();
    await b.getByRole('button', { name: 'Join session', exact: true }).click();
    await b.getByRole('alertdialog').getByRole('button', { name: 'Join session', exact: true }).click();
    await expect(b.getByRole('button', { name: 'Live collaboration', exact: true })).toHaveAttribute('title', /^Live|Waiting for participants/, { timeout: 30_000 });
    await module(b, 'Tasks');
    await expect(b.getByLabel('Board name', { exact: true })).toHaveValue('Shared preproduction tasks');
    await a.getByLabel('Board name', { exact: true }).fill('Shared tasks after rejoin');
    await a.getByLabel('Board name', { exact: true }).blur();
    await expect(b.getByLabel('Board name', { exact: true })).toHaveValue('Shared tasks after rejoin', { timeout: 45_000 });
    await b.screenshot({ path: 'test-results/full-production-collaboration.png', fullPage: true });
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
