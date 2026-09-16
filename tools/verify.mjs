/**
 * Load the demo in a real browser and check that it works.
 *
 * Serves the project and opens it three ways, none of which depends on the
 * police data service being reachable:
 *
 *   - the saved copy (`?source=snapshot`): the grid holds rows, the stop and
 *     search tab holds rows, the page logged no errors, and a month sent to
 *     the page a second time updates the rows it already has rather than
 *     adding them again;
 *   - the live page with the service blocked in the browser: the saved copy
 *     is on screen within two seconds, the page says the service could not
 *     be reached, and nothing was thrown;
 *   - with `--live`, the live page for real: every month lands, the badge
 *     reads Live, and the page logged no errors. Off by default because it
 *     depends on a service we do not run.
 *
 * Exits non-zero when any of that fails, so it can gate a deployment.
 *
 * Usage: node tools/verify.mjs [--live]
 */

import { setTimeout as sleep } from 'node:timers/promises';
import { launchBrowser } from './browser.mjs';
import { startServer } from './serve.mjs';

const withLive = process.argv.includes('--live');
const failures = [];
let browser;
let server;

/** The state of the page, as the checks below read it. */
const READ_STATE = `(() => {
  const demo = window.__policeDemo;
  const notice = document.querySelector('.notice');
  const pill = document.querySelector('.head-note .pill');
  const note = document.querySelector('.head-note');
  const grid = demo && demo.crimeGrid;
  const months = new Set();
  if (grid) grid.rows.forEachAll((row) => { if (row && row.data) months.add(row.data.month); });
  return {
    ready: !!(demo && demo.ready),
    error: (demo && demo.error) || null,
    rows: grid ? grid.rows.totalCount() : 0,
    shown: grid ? grid.rows.count() : 0,
    months: [...months].sort(),
    painted: document.querySelectorAll('.lattice [role="row"]').length,
    columns: grid ? grid.columns.visible().length : 0,
    timings: demo ? demo.timings : null,
    live: demo ? demo.live : null,
    badge: pill ? pill.textContent.trim() : null,
    notice: notice && !notice.hidden ? notice.textContent.trim() : null,
    fetchedAtShown: note ? /Data fetched/.test(note.textContent) : false,
    tabs: [...document.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent.trim()),
  };
})()`;

try {
  const started = await startServer(0);
  server = started.server;
  const base = `http://127.0.0.1:${started.port}/index.html`;
  browser = await launchBrowser();
  const { call, evaluate, waitFor, consoleErrors, pageErrors } = browser;
  console.log(`Browser: ${browser.chromePath}`);

  /* Console lines a blocked request writes on its own account: the browser
     reporting the block, which is the point of that check, not a defect. */
  const realConsoleErrors = () => consoleErrors.filter((line) => !/ERR_BLOCKED_BY_CLIENT/.test(line));

  /* ------------------------------------------------------------------ */
  /* The saved copy                                                      */
  /* ------------------------------------------------------------------ */

  console.log(`\nOpening the saved copy: ${base}?source=snapshot`);
  await call('Page.navigate', { url: `${base}?source=snapshot` });
  await waitFor('!!(window.__policeDemo && window.__policeDemo.ready)', 120000, 'the dashboard to load');
  await waitFor('window.__policeDemo.crimeGrid && window.__policeDemo.crimeGrid.rows.count() > 0', 60000, 'the crime rows');

  const saved = await evaluate(READ_STATE);
  console.log(`  crime grid: ${saved.rows} rows, ${saved.columns} columns, ${saved.painted} painted, ${saved.months.length} months`);
  console.log(`  first rows on screen at ${saved.timings.firstPaintMs} ms, the whole saved copy at ${saved.timings.savedMs} ms`);
  if (!(saved.rows > 0)) failures.push(`the crime grid holds ${saved.rows} rows`);
  if (!(saved.painted > 0)) failures.push('the crime grid painted no rows');
  if (saved.badge !== 'Saved copy') failures.push(`the saved copy's badge read "${saved.badge}" rather than "Saved copy"`);
  if (!saved.fetchedAtShown) failures.push("the saved copy's date was not shown");
  if (!saved.tabs.some((tab) => /^Street crime/.test(tab) && /\d/.test(tab))) {
    failures.push(`the Street crime tab carries no row count (tabs: ${saved.tabs.join(' | ')})`);
  }

  await evaluate("window.__policeDemo.tabs.activate('stops')");
  await waitFor('window.__policeDemo.stopGrid && window.__policeDemo.stopGrid.rows.count() > 0', 60000, 'the stop and search rows');
  const stops = await evaluate('window.__policeDemo.stopGrid.rows.totalCount()');
  console.log(`  stop and search grid: ${stops} rows.`);
  if (!(stops > 0)) failures.push(`the stop and search grid holds ${stops} rows`);

  /*
   * A month landing a second time.
   *
   * This is what happens in live mode whenever the service answers for a
   * month the saved copy already holds. The newest month is sent to the page
   * again three ways, exactly as the live fetch sends it, and the grid is
   * counted by id before and after: the same rows change nothing, a changed
   * row is updated in place, and a row that has gone is taken off. Nothing
   * is ever added twice.
   */
  console.log('\nA month landing a second time:');
  const twice = await evaluate(`(() => {
    const demo = window.__policeDemo;
    const grid = demo.crimeGrid;
    const ids = () => { const seen = new Set(); grid.rows.forEachAll((row) => { if (row && row.data) seen.add(String(row.data.id)); }); return seen; };
    const month = [...demo.store.values()].filter((row) => row.dataset === 'crime').map((row) => row.month).sort().pop();
    const rows = [...demo.store.values()].filter((row) => row.dataset === 'crime' && row.month === month).map((row) => ({ ...row }));
    const stopRows = [...demo.store.values()].filter((row) => row.dataset === 'stop' && row.month === month).map((row) => ({ ...row }));
    const before = { total: grid.rows.totalCount(), ids: ids().size, stops: demo.stopGrid.rows.totalCount() };

    demo.ingest([{ dataset: 'crime', month, rows }, { dataset: 'stop', month, rows: stopRows }]);
    const same = { total: grid.rows.totalCount(), ids: ids().size, stops: demo.stopGrid.rows.totalCount() };

    const changed = rows.map((row, i) => (i === 0 ? { ...row, outcome: 'Changed for the check' } : row));
    demo.ingest([{ dataset: 'crime', month, rows: changed }]);
    const updated = { total: grid.rows.totalCount(), ids: ids().size, outcome: grid.rows.value(String(rows[0].id), 'outcome') };

    demo.ingest([{ dataset: 'crime', month, rows: rows.slice(1) }]);
    const dropped = { total: grid.rows.totalCount(), ids: ids().size, gone: !grid.rows.byKey(String(rows[0].id)) };

    demo.ingest([{ dataset: 'crime', month, rows }]);
    const restored = { total: grid.rows.totalCount(), ids: ids().size, outcome: grid.rows.value(String(rows[0].id), 'outcome') };
    return { month, sent: rows.length, before, same, updated, dropped, restored };
  })()`);
  console.log(`  ${twice.month}: ${twice.sent} rows sent again; ${twice.before.total} rows before, ${twice.same.total} after (${twice.same.ids} distinct ids)`);
  console.log(`  one row changed: ${twice.updated.total} rows, outcome now "${twice.updated.outcome}"; one row gone: ${twice.dropped.total} rows; restored: ${twice.restored.total} rows`);
  if (twice.same.total !== twice.before.total || twice.same.ids !== twice.before.ids) {
    failures.push(`sending a month again changed the row count from ${twice.before.total} to ${twice.same.total} (${twice.same.ids} distinct ids)`);
  }
  if (twice.same.stops !== twice.before.stops) {
    failures.push(`sending a month of stop and search again changed its row count from ${twice.before.stops} to ${twice.same.stops}`);
  }
  if (twice.updated.total !== twice.before.total || twice.updated.outcome !== 'Changed for the check') {
    failures.push(`a changed row was not updated in place (${twice.updated.total} rows, outcome "${twice.updated.outcome}")`);
  }
  if (twice.dropped.total !== twice.before.total - 1 || !twice.dropped.gone) {
    failures.push(`a row missing from a month that landed again was not taken off (${twice.dropped.total} rows)`);
  }
  if (twice.restored.total !== twice.before.total || twice.restored.outcome === 'Changed for the check') {
    failures.push(`the month could not be restored (${twice.restored.total} rows, outcome "${twice.restored.outcome}")`);
  }

  await sleep(500);
  if (realConsoleErrors().length) failures.push(`the saved copy logged ${realConsoleErrors().length} console error(s):\n    ${realConsoleErrors().join('\n    ')}`);
  if (pageErrors.length) failures.push(`the saved copy threw ${pageErrors.length} error(s):\n    ${pageErrors.join('\n    ')}`);

  /* ------------------------------------------------------------------ */
  /* The service unreachable                                             */
  /* ------------------------------------------------------------------ */

  /*
   * What a visitor gets when the police data service cannot be reached.
   *
   * The service is blocked in the browser rather than asked politely to fail,
   * so this exercises the same path a real outage takes and the demo carries
   * no test only code. The saved copy has to be on screen within two seconds
   * of the page arriving, which is before any live request could have
   * answered, and the page has to say what it is showing.
   */
  console.log('\nWith the police data service unreachable:');
  consoleErrors.length = 0;
  pageErrors.length = 0;
  await call('Network.enable');
  await call('Network.setBlockedURLs', { urls: ['*data.police.uk*'] });
  await call('Page.navigate', { url: base });

  await waitFor('!!(window.__policeDemo && window.__policeDemo.crimeGrid && window.__policeDemo.crimeGrid.rows.count() > 0)', 30000, 'rows with the service blocked');
  const early = await evaluate(READ_STATE);
  console.log(`  first rows on screen at ${early.timings.firstPaintMs} ms after the page arrived (${early.rows} rows, badge "${early.badge}")`);
  if (!(early.timings.firstPaintMs <= 2000)) {
    failures.push(`the saved copy took ${early.timings.firstPaintMs} ms to reach the screen, more than the 2000 ms allowed`);
  }
  if (early.badge !== 'Saved copy - refreshing' && early.badge !== 'Saved copy') {
    failures.push(`while the service was being asked the badge read "${early.badge}"`);
  }

  await waitFor('!!(window.__policeDemo && window.__policeDemo.live && window.__policeDemo.live.settled)', 120000, 'the page to settle with the service blocked');
  const fallback = await evaluate(READ_STATE);
  console.log(`  settled at ${fallback.timings.liveMs} ms: ${fallback.rows} rows, badge "${fallback.badge}", fell back: ${fallback.timings.fellBack}`);
  console.log(`  notice: ${fallback.notice}`);
  if (!fallback.ready) failures.push(`the page did not fall back to the saved copy, it failed outright: ${fallback.error}`);
  if (!(fallback.rows > 0)) failures.push(`the fallback showed ${fallback.rows} rows`);
  if (!(fallback.painted > 0)) failures.push('the fallback painted no rows');
  if (!fallback.timings.fellBack) failures.push('the page did not record that it fell back to the saved copy');
  if (fallback.timings.mode !== 'live') failures.push(`the fallback ran in "${fallback.timings.mode}" mode, not the live default`);
  if (fallback.badge !== 'Saved copy') failures.push(`the badge read "${fallback.badge}" rather than "Saved copy"`);
  if (!fallback.notice || !/could not be reached/i.test(fallback.notice)) {
    failures.push(`the page did not say the service was unreachable (notice: ${fallback.notice})`);
  }
  if (!fallback.fetchedAtShown) failures.push("the saved copy's date was not shown");
  if (realConsoleErrors().length) failures.push(`the fallback logged ${realConsoleErrors().length} console error(s):\n    ${realConsoleErrors().join('\n    ')}`);
  if (pageErrors.length) failures.push(`the fallback threw ${pageErrors.length} error(s):\n    ${pageErrors.join('\n    ')}`);
  await call('Network.setBlockedURLs', { urls: [] });

  /* ------------------------------------------------------------------ */
  /* Live, on request                                                    */
  /* ------------------------------------------------------------------ */

  if (withLive) {
    console.log('\nLive, from the police data service:');
    consoleErrors.length = 0;
    pageErrors.length = 0;
    await call('Page.navigate', { url: base });
    await waitFor('!!(window.__policeDemo && window.__policeDemo.crimeGrid && window.__policeDemo.crimeGrid.rows.count() > 0)', 30000, 'the first rows in live mode');
    const first = await evaluate(READ_STATE);
    console.log(`  first rows on screen at ${first.timings.firstPaintMs} ms (badge "${first.badge}")`);
    await waitFor('!!(window.__policeDemo && window.__policeDemo.live && window.__policeDemo.live.settled)', 240000, 'every live month to land');
    const live = await evaluate(READ_STATE);
    console.log(`  all months landed at ${live.timings.liveMs} ms over ${live.live.requests} requests: ${live.rows} rows, ${live.months.length} months, badge "${live.badge}"`);
    if (live.live.failed.length) console.log(`  not refreshed: ${live.live.failed.join(', ')}`);
    if (live.timings.fellBack) failures.push('the live page fell back to the saved copy');
    if (!/^Live/.test(live.badge)) failures.push(`after every month landed the badge read "${live.badge}"`);
    if (live.months.length !== live.live.months) {
      failures.push(`the grid holds ${live.months.length} months (${live.months.join(', ')}) against ${live.live.months} live months`);
    }
    if (!live.fetchedAtShown) failures.push('the live fetch time was not shown');
    await sleep(500);
    if (consoleErrors.length) failures.push(`the live page logged ${consoleErrors.length} console error(s):\n    ${consoleErrors.join('\n    ')}`);
    if (pageErrors.length) failures.push(`the live page threw ${pageErrors.length} error(s):\n    ${pageErrors.join('\n    ')}`);
  }
} catch (error) {
  failures.push(String(error.message || error));
} finally {
  if (browser) await browser.close();
  if (server) server.close();
}

if (failures.length) {
  console.error('\nFAILED:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log('\nAll checks passed.');
process.exit(0);
