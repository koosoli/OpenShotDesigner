/**
 * Capture the README screenshots by driving a headless Chrome over the
 * DevTools protocol.
 *
 * No new dependencies (plan rule 31): it launches the Chrome already installed
 * on the machine and speaks CDP over Node's built-in WebSocket. Each shot loads
 * the app, runs a small in-page script to reach the view, and captures it.
 *
 * A fresh Chrome profile means empty IndexedDB, so the app opens its first-run
 * project — which ships the full example production. The screenshots therefore
 * show real data without anyone hand-building a demo project.
 *
 * Usage:
 *   node scripts/capture-screenshots.mjs [--url http://localhost:3000] [--out docs/screenshots]
 *   node scripts/capture-screenshots.mjs --only floor-plan,schedule
 *   node scripts/capture-screenshots.mjs --print call-sheet   # print-media render
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};

const APP_URL = arg('url', 'http://localhost:3000');
const OUT_DIR = arg('out', 'docs/screenshots');
const ONLY = arg('only', '')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);
// README images display around 900px wide on GitHub; 1.5x keeps them crisp on
// retina without committing multi-megabyte PNGs.
const VIEWPORT = { width: 1500, height: 940, scale: 1.5 };

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

const findChrome = () => {
  for (const candidate of CHROME_CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    `No Chrome found. Set CHROME_PATH to a Chrome or Edge executable.\nLooked in:\n  ${CHROME_CANDIDATES.join('\n  ')}`,
  );
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Poll the DevTools endpoint until Chrome is listening. */
const waitForDevtools = async (port, timeoutMs = 20000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return (await response.json()).webSocketDebuggerUrl;
    } catch {
      // not up yet
    }
    await sleep(200);
  }
  throw new Error('Chrome did not expose its DevTools endpoint in time.');
};

/** Minimal CDP client: send(method, params) -> result. */
class Cdp {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.sessionId = undefined;
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      const entry = this.pending.get(message.id);
      if (!entry) return;
      this.pending.delete(message.id);
      if (message.error) entry.reject(new Error(`${entry.method}: ${message.error.message}`));
      else entry.resolve(message.result);
    });
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', () => reject(new Error(`Could not connect to ${url}`)), { once: true });
    });
    return new Cdp(socket);
  }

  send(method, params = {}) {
    const id = this.nextId++;
    const payload = { id, method, params };
    if (this.sessionId) payload.sessionId = this.sessionId;
    this.socket.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject, method }));
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? 'page script threw');
    }
    return result.result?.value;
  }

  close() {
    this.socket.close();
  }
};

/**
 * First run opens on the project dashboard, so every shot starts by entering
 * the bundled example production. Shared rather than repeated per shot.
 */
const ENTER_APP = `(async () => {
  for (let attempt = 0; attempt < 20; attempt++) {
    const cont = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Continue');
    if (cont) { cont.click(); break; }
    // No regex here on purpose: this string is a template literal in the
    // capture script, so backslash escapes would be eaten before the page saw
    // them. Plain comparisons survive the trip intact.
    const create = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Create');
    if (create) { create.click(); break; }
    await new Promise(r => setTimeout(r, 200));
  }
  await new Promise(r => setTimeout(r, 900));
  return 'entered';
})()`;

/**
 * Every shot: a slug, a caption for the README, and a `prepare` script run in
 * the page to reach the view. `prepare` returns a promise; the runner waits for
 * it, then settles a beat before capturing.
 */
const SHOTS = [
  {
    slug: 'floor-plan',
    title: 'Floor plan & blocking',
    prepare: `(async () => {
      const tab = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Shot list');
      tab && tab.click();
      await new Promise(r => setTimeout(r, 400));
      return 'ok';
    })()`,
  },
  {
    slug: 'lined-script',
    title: 'Lined script',
    prepare: `(async () => {
      const tab = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Script');
      tab && tab.click();
      await new Promise(r => setTimeout(r, 600));
      return 'ok';
    })()`,
  },
  {
    slug: 'storyboard',
    title: 'Storyboard',
    prepare: `(async () => {
      const tab = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Storyboard');
      tab && tab.click();
      await new Promise(r => setTimeout(r, 600));
      return 'ok';
    })()`,
  },
  {
    slug: 'equipment',
    title: 'Equipment manifest',
    prepare: `(async () => {
      const tab = [...document.querySelectorAll('button')].find(b => b.innerText.trim().startsWith('Gear'));
      tab && tab.click();
      await new Promise(r => setTimeout(r, 600));
      return 'ok';
    })()`,
  },
  {
    slug: 'schedule',
    title: 'Stripboard scheduling',
    prepare: `(async () => {
      const menu = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Production');
      menu && menu.click();
      await new Promise(r => setTimeout(r, 250));
      const tab = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Schedule');
      tab && tab.click();
      await new Promise(r => setTimeout(r, 700));
      return 'ok';
    })()`,
  },
  {
    slug: 'call-sheet',
    title: 'Call sheets',
    prepare: `(async () => {
      const menu = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Production');
      menu && menu.click();
      await new Promise(r => setTimeout(r, 250));
      const tab = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Schedule');
      tab && tab.click();
      await new Promise(r => setTimeout(r, 600));
      const sheets = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Call sheets');
      sheets && sheets.click();
      await new Promise(r => setTimeout(r, 700));
      return 'ok';
    })()`,
  },
  {
    slug: 'crew',
    title: 'Crew, cast & key roles',
    prepare: `(async () => {
      const menu = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Production');
      menu && menu.click();
      await new Promise(r => setTimeout(r, 250));
      const tab = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Crew');
      tab && tab.click();
      await new Promise(r => setTimeout(r, 600));
      return 'ok';
    })()`,
  },
  {
    slug: 'power',
    title: 'Power: per-truss load & phase balance',
    prepare: `(async () => {
      const menu = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Production');
      menu && menu.click();
      await new Promise(r => setTimeout(r, 250));
      const tab = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Power');
      tab && tab.click();
      await new Promise(r => setTimeout(r, 600));
      return 'ok';
    })()`,
  },
  {
    slug: 'locations',
    title: 'Locations with a map pin',
    prepare: `(async () => {
      const menu = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Production');
      menu && menu.click();
      await new Promise(r => setTimeout(r, 250));
      const tab = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Locations');
      tab && tab.click();
      await new Promise(r => setTimeout(r, 1500));
      return 'ok';
    })()`,
  },
  {
    slug: 'moodboard',
    title: 'Mood boards',
    prepare: `(async () => {
      const menu = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Production');
      menu && menu.click();
      await new Promise(r => setTimeout(r, 250));
      const tab = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Moodboard');
      tab && tab.click();
      await new Promise(r => setTimeout(r, 700));
      return 'ok';
    })()`,
  },
  {
    slug: 'tasks',
    title: 'Task board',
    prepare: `(async () => {
      const menu = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Production');
      menu && menu.click();
      await new Promise(r => setTimeout(r, 250));
      const tab = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Tasks');
      tab && tab.click();
      await new Promise(r => setTimeout(r, 600));
      return 'ok';
    })()`,
  },
  {
    slug: 'call-sheet-print',
    title: 'Printed call sheet',
    // Mounts the hidden print document and captures it under print media, so
    // the screenshot is literally what comes out of the printer.
    printMedia: true,
    prepare: `(async () => {
      // Headless has no dialog UI: the readiness confirm would block forever,
      // and window.print() would too. Both are stubbed for the capture only.
      window.confirm = () => true;
      window.print = () => {};
      const menu = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Production');
      if (menu) menu.click();
      await new Promise(r => setTimeout(r, 300));
      const tab = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Schedule');
      if (tab) tab.click();
      await new Promise(r => setTimeout(r, 700));
      const sheets = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Call sheets');
      if (sheets) sheets.click();
      await new Promise(r => setTimeout(r, 900));
      return 'ok';
    })()`,
    finish: `(async () => {
      for (let attempt = 0; attempt < 15; attempt++) {
        const print = [...document.querySelectorAll('button')].find(b => b.innerText.includes('Print / PDF'));
        if (print) { print.click(); break; }
        await new Promise(r => setTimeout(r, 200));
      }
      // Wait for the print document to actually mount before the capture.
      for (let attempt = 0; attempt < 25; attempt++) {
        if (document.querySelector('.call-sheet-print-host')) break;
        await new Promise(r => setTimeout(r, 200));
      }
      await new Promise(r => setTimeout(r, 800));
      return document.querySelector('.call-sheet-print-host') ? 'mounted' : 'NOT MOUNTED';
    })()`,
  },
  {
    slug: 'export',
    title: 'Export & print studio',
    prepare: `(async () => {
      const btn = [...document.querySelectorAll('button')].find(b => (b.title || '').includes('Export & Print Studio'));
      btn && btn.click();
      await new Promise(r => setTimeout(r, 1200));
      return 'ok';
    })()`,
  },
];

const run = async () => {
  const chromePath = findChrome();
  const port = 9333;
  const profile = path.join(tmpdir(), `osd-shots-${Date.now()}`);
  mkdirSync(profile, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const chrome = spawn(
    chromePath,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      '--force-color-profile=srgb',
      `--user-data-dir=${profile}`,
      `--remote-debugging-port=${port}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  let cdp;
  try {
    const browserWs = await waitForDevtools(port);
    const browser = await Cdp.connect(browserWs);
    const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
    cdp = browser;
    cdp.sessionId = sessionId;

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('DOM.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: VIEWPORT.width,
      height: VIEWPORT.height,
      deviceScaleFactor: VIEWPORT.scale,
      mobile: false,
    });

    const wanted = SHOTS.filter((shot) => ONLY.length === 0 || ONLY.includes(shot.slug));
    if (wanted.length === 0) throw new Error(`No shots matched --only "${ONLY.join(',')}"`);

    for (const shot of wanted) {
      await cdp.send('Page.navigate', { url: APP_URL });
      // Wait for the app shell rather than a fixed guess.
      const deadline = Date.now() + 20000;
      let ready = false;
      while (Date.now() < deadline && !ready) {
        await sleep(250);
        ready = await cdp.evaluate("!!document.querySelector('#app-root')").catch(() => false);
      }
      if (!ready) throw new Error(`App never rendered at ${APP_URL} — is the dev server running?`);
      await sleep(900);

      await cdp.evaluate(ENTER_APP);
      await sleep(500);

      await cdp.evaluate(shot.prepare);
      await sleep(700);

      if (shot.finish) {
        await cdp.evaluate(shot.finish);
        await sleep(900);
      }

      if (shot.printMedia) {
        await cdp.send('Emulation.setEmulatedMedia', { media: 'print' });
        await sleep(500);
      }

      const { data } = await cdp.send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: !!shot.printMedia,
      });

      if (shot.printMedia) await cdp.send('Emulation.setEmulatedMedia', { media: '' });
      const file = path.join(OUT_DIR, `${shot.slug}.png`);
      writeFileSync(file, Buffer.from(data, 'base64'));
      console.log(`captured ${file}`);
    }
  } finally {
    cdp?.close();
    chrome.kill();
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {
      // a locked profile directory is harmless; it lives in the temp dir
    }
  }
};

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
