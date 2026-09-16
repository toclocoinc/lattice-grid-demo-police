/**
 * Time the live load in a real browser.
 *
 * Serves the project, opens the page in live mode and reads how long it took
 * from navigation until every month had landed, as the page itself measures
 * it with `performance.now()`. Runs it more than once because the police
 * data service is the slow part and its speed varies from minute to minute.
 *
 * Usage: node tools/measure-load.mjs [runs]
 */

import { launchBrowser } from './browser.mjs';
import { startServer } from './serve.mjs';

const runs = Math.max(1, Number(process.argv[2]) || 3);
const { server, port } = await startServer(0);
const url = `http://127.0.0.1:${port}/index.html`;
console.log(`Opening ${url} ${runs} time(s)...`);

const results = [];
let browser;
try {
  for (let run = 1; run <= runs; run += 1) {
    browser = await launchBrowser();
    await browser.call('Page.navigate', { url });
    /* Settled means the page has nothing more to wait for: on the current
       page that is the moment the last live month landed (or was given up
       on), and the page records that moment against navigation. */
    await browser.waitFor(
      '!!(window.__policeDemo && window.__policeDemo.ready && (!window.__policeDemo.live || window.__policeDemo.live.settled))',
      180000,
      'the live load to finish',
    );
    const reading = await browser.evaluate(`(() => {
      const demo = window.__policeDemo;
      const live = demo.live || null;
      return {
        observedMs: Math.round(performance.now()),
        firstPaintMs: live ? live.firstPaintMs : null,
        allMonthsMs: live ? live.allMonthsMs : (demo.timings ? demo.timings.totalMs : null),
        months: live ? live.months : null,
        failed: live ? live.failed : null,
        rows: demo.crimeGrid ? demo.crimeGrid.rows.totalCount() : null,
        requests: live ? live.requests : (demo.timings ? demo.timings.requests : null),
      };
    })()`);
    results.push(reading);
    console.log(
      `Run ${run}: all months landed at ${reading.allMonthsMs ?? reading.observedMs} ms` +
        (reading.firstPaintMs != null ? `, first rows on screen at ${reading.firstPaintMs} ms` : '') +
        (reading.months ? `, ${reading.months} months` : '') +
        (reading.failed && reading.failed.length ? `, failed: ${reading.failed.join(' ')}` : '') +
        `, ${reading.rows} crime rows, ${reading.requests} requests` +
        (browser.pageErrors.length ? `, ${browser.pageErrors.length} page error(s)` : ''),
    );
    await browser.close();
    browser = null;
  }
} finally {
  if (browser) await browser.close();
  server.close();
}

const landed = results.map((r) => r.allMonthsMs ?? r.observedMs);
const median = landed.slice().sort((a, b) => a - b)[Math.floor(landed.length / 2)];
console.log(`\nAll months landed: median ${median} ms over ${landed.length} run(s) (${landed.join(', ')}).`);
const paints = results.map((r) => r.firstPaintMs).filter((v) => v != null);
if (paints.length) {
  const medianPaint = paints.slice().sort((a, b) => a - b)[Math.floor(paints.length / 2)];
  console.log(`First rows on screen: median ${medianPaint} ms (${paints.join(', ')}).`);
}
