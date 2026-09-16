/**
 * Save a real run of the data.police.uk API to `data/snapshot/`, so the
 * dashboard can paint before the service has answered, and can be opened
 * with no network at all.
 *
 * The copy is one file per month and dataset (`crimes/2026-07.json`,
 * `stops/2026-07.json`) plus `meta.json`, which lists the months and says
 * when the copy was taken. Small files are what let the page show the newest
 * month the moment it arrives, and what keeps a nightly refresh from
 * rewriting fifteen megabytes when only one month has changed.
 *
 * Run it with `npm run snapshot`. It is a development tool, also run on a
 * schedule by the refresh workflow: nothing the page loads imports it.
 */

import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchEverything } from '../src/police-api.js';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'data', 'snapshot');

const started = Date.now();
console.log('Fetching 12 months of central London crime and stop and search...');

const { crimes, stops, meta } = await fetchEverything({
  months: 12,
  onProgress: ({ done, total, dataset, month, rows }) => {
    console.log(`  [${String(done).padStart(2)}/${total}] ${dataset} ${month}: ${rows} rows`);
  },
});

const elapsed = ((Date.now() - started) / 1000).toFixed(1);
meta.crimeRows = crimes.length;
meta.stopRows = stops.length;
meta.seconds = Number(elapsed);

/** The rows of one month, in a stable order so an unchanged month writes the same bytes. */
function monthOf(rows, month) {
  return rows.filter((row) => row.month === month).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Write one month per file and take out any month no longer in the list. */
async function writeDataset(name, rows) {
  const dir = join(outDir, name);
  await mkdir(dir, { recursive: true });
  const wanted = new Set(meta.months.map((month) => `${month}.json`));
  for (const existing of await readdir(dir)) {
    if (!wanted.has(existing)) await rm(join(dir, existing));
  }
  for (const month of meta.months) {
    await writeFile(join(dir, `${month}.json`), JSON.stringify(monthOf(rows, month)));
  }
}

await mkdir(outDir, { recursive: true });
await writeDataset('crimes', crimes);
await writeDataset('stops', stops);
await writeFile(join(outDir, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`);

console.log(`\nSaved ${crimes.length} crimes and ${stops.length} stop and search records in ${elapsed}s.`);
console.log(`Fetched at ${meta.fetchedAt} over ${meta.requests} requests.`);
