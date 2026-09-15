/**
 * Load the demo in a real browser and check that it works.
 *
 * Serves the project, opens the saved copy so the check never depends on the
 * police data service being reachable, waits for the dashboard to report
 * itself ready, and then insists on three things: the grid holds rows, the
 * stop and search tab holds rows, and the page logged no errors.
 *
 * Exits non-zero when any of that fails, so it can gate a deployment.
 *
 * Usage: node tools/verify.mjs
 */

import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { startServer } from './serve.mjs';

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/snap/bin/chromium',
].filter(Boolean);

/** The first browser on this machine that actually exists. */
async function findChrome() {
  for (const path of CHROME_CANDIDATES) {
    try {
      await access(path);
      return path;
    } catch {}
  }
  throw new Error(
    `No browser found. Tried:\n  ${CHROME_CANDIDATES.join('\n  ')}\nSet CHROME_PATH to point at one.`,
  );
}

/**
 * This check talks to the browser over a WebSocket, which Node only provides
 * as a global from version 22. Say so plainly rather than failing later with
 * an unexplained missing name.
 */
function requireModernNode() {
  if (typeof WebSocket === 'undefined') {
    throw new Error(
      `This check needs Node 22 or newer. You are running ${process.version}, which has no built in WebSocket.`,
    );
  }
}

/** A free TCP port, asked of the operating system. */
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

const failures = [];
let browser;
let profile;
let server;

try {
  requireModernNode();
  const chromePath = await findChrome();
  const started = await startServer(0);
  server = started.server;
  const url = `http://127.0.0.1:${started.port}/index.html?source=snapshot`;
  console.log(`Browser: ${chromePath}`);
  console.log(`Opening: ${url}`);

  profile = await mkdtemp(join(tmpdir(), 'police-demo-verify-'));
  /* A port of the operating system's choosing, so two checks running side by
     side on one machine cannot land on the same debugging socket. */
  const port = await freePort();
  browser = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--hide-scrollbars',
    '--window-size=1440,900',
    'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  browser.stderr.on('data', () => {});

  let wsUrl;
  for (let i = 0; i < 150 && !wsUrl; i += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) wsUrl = (await response.json()).webSocketDebuggerUrl;
    } catch {}
    if (!wsUrl) await sleep(200);
  }
  if (!wsUrl) throw new Error('the browser never opened its debugging port');

  const socket = new WebSocket(wsUrl);
  await new Promise((done, fail) => {
    socket.onopen = done;
    socket.onerror = () => fail(new Error('could not attach to the browser'));
  });

  let nextId = 0;
  const pending = new Map();
  const consoleErrors = [];
  const pageErrors = [];

  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id != null && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result);
      return;
    }
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      consoleErrors.push(message.params.args.map((a) => a.value ?? a.description ?? a.type).join(' '));
    }
    if (message.method === 'Runtime.exceptionThrown') {
      const details = message.params.exceptionDetails;
      pageErrors.push(details.exception?.description || details.text);
    }
    if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
      consoleErrors.push(message.params.entry.text);
    }
  };

  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params, sessionId }));
    });

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const call = (method, params) => send(method, params, sessionId);

  await call('Page.enable');
  await call('Runtime.enable');
  await call('Log.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await call('Page.navigate', { url });

  const evaluate = async (expression) => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text + ' ' + (result.exceptionDetails.exception?.description || ''));
    }
    return result.result.value;
  };

  const waitFor = async (expression, timeout, what) => {
    const until = Date.now() + timeout;
    while (Date.now() < until) {
      let value;
      try {
        value = await evaluate(expression);
      } catch {}
      if (value) return value;
      await sleep(250);
    }
    throw new Error(`timed out waiting for ${what}`);
  };

  await waitFor('!!(window.__policeDemo)', 120000, 'the dashboard to load');
  const state = await evaluate('({ ready: window.__policeDemo.ready, error: window.__policeDemo.error || null })');
  if (!state.ready) throw new Error(`the dashboard reported a failure: ${state.error}`);

  await waitFor('window.__policeDemo.crimeGrid && window.__policeDemo.crimeGrid.rows.count() > 0', 60000, 'the crime rows');

  const crime = await evaluate(`(() => {
    const grid = window.__policeDemo.crimeGrid;
    return {
      total: grid.rows.totalCount(),
      shown: grid.rows.count(),
      columns: grid.columns.visible().length,
      painted: document.querySelectorAll('.lattice [role="row"]').length,
    };
  })()`);
  console.log(`Crime grid: ${crime.total} rows, ${crime.columns} columns, ${crime.painted} painted.`);
  if (!(crime.total > 0)) failures.push(`the crime grid holds ${crime.total} rows`);
  if (!(crime.painted > 0)) failures.push('the crime grid painted no rows');

  await evaluate("window.__policeDemo.tabs.activate('stops')");
  await waitFor('window.__policeDemo.stopGrid && window.__policeDemo.stopGrid.rows.count() > 0', 60000, 'the stop and search rows');
  const stops = await evaluate('window.__policeDemo.stopGrid.rows.totalCount()');
  console.log(`Stop and search grid: ${stops} rows.`);
  if (!(stops > 0)) failures.push(`the stop and search grid holds ${stops} rows`);

  await sleep(500);
  if (consoleErrors.length) failures.push(`the page logged ${consoleErrors.length} console error(s):\n    ${consoleErrors.join('\n    ')}`);
  if (pageErrors.length) failures.push(`the page threw ${pageErrors.length} error(s):\n    ${pageErrors.join('\n    ')}`);

  /*
   * What a visitor gets when the police data service cannot be reached.
   *
   * The service is blocked in the browser rather than asked politely to fail,
   * so this exercises the same path a real outage takes and the demo carries
   * no test only code. A failed request does log to the console, so the check
   * here is that nothing was thrown and the saved copy is on screen saying so.
   */
  console.log('\nWith the police data service unreachable:');
  pageErrors.length = 0;
  await call('Network.enable');
  await call('Network.setBlockedURLs', { urls: ['*data.police.uk*'] });
  await call('Page.navigate', { url: `http://127.0.0.1:${started.port}/index.html` });

  await waitFor('!!(window.__policeDemo)', 120000, 'the page to settle with the service blocked');
  const fallback = await evaluate(`(() => {
    const demo = window.__policeDemo;
    const notice = document.querySelector('.notice');
    const pill = document.querySelector('.head-note .pill');
    const note = document.querySelector('.head-note');
    return {
      ready: !!demo.ready,
      error: demo.error || null,
      rows: demo.crimeGrid ? demo.crimeGrid.rows.totalCount() : 0,
      painted: document.querySelectorAll('.lattice [role="row"]').length,
      fellBack: !!(demo.timings && demo.timings.fellBack),
      mode: demo.timings && demo.timings.mode,
      badge: pill ? pill.textContent.trim() : null,
      notice: notice ? notice.textContent.trim() : null,
      fetchedAtShown: note ? /Data fetched/.test(note.textContent) : false,
    };
  })()`);
  if (!fallback.ready) failures.push(`the page did not fall back to the saved copy, it failed outright: ${fallback.error}`);
  console.log(`  rows ${fallback.rows}, badge "${fallback.badge}", fell back: ${fallback.fellBack}`);
  console.log(`  notice: ${fallback.notice}`);

  if (!(fallback.rows > 0)) failures.push(`the fallback showed ${fallback.rows} rows`);
  if (!(fallback.painted > 0)) failures.push('the fallback painted no rows');
  if (!fallback.fellBack) failures.push('the page did not record that it fell back to the saved copy');
  if (fallback.mode !== 'live') failures.push(`the fallback ran in "${fallback.mode}" mode, not the live default`);
  if (fallback.badge !== 'Saved copy') failures.push(`the badge read "${fallback.badge}" rather than "Saved copy"`);
  if (!fallback.notice || !/could not be reached/i.test(fallback.notice)) {
    failures.push(`the page did not say the service was unreachable (notice: ${fallback.notice})`);
  }
  if (!fallback.fetchedAtShown) failures.push('the saved copy\'s date was not shown');
  if (pageErrors.length) failures.push(`the fallback threw ${pageErrors.length} error(s):\n    ${pageErrors.join('\n    ')}`);

  await call('Network.setBlockedURLs', { urls: [] });
  socket.close();
} catch (error) {
  failures.push(String(error.message || error));
} finally {
  if (browser) browser.kill('SIGKILL');
  if (server) server.close();
  await sleep(300);
  if (profile) await rm(profile, { recursive: true, force: true });
}

if (failures.length) {
  console.error('\nFAILED:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log('\nAll checks passed.');
process.exit(0);
