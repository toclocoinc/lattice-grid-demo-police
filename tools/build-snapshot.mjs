/**
 * Save a real run of the data.police.uk API to `data/snapshot/`, so the
 * dashboard can also be opened with no network at all.
 *
 * Run it with `npm run snapshot`. It is a development tool: nothing the page
 * loads imports it.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchEverything } from '../src/police-api.js';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'data', 'snapshot');

const started = Date.now();
console.log('Fetching 12 months of central London crime and stop and search...');

const { crimes, stops, meta } = await fetchEverything({
  months: 12,
  concurrency: 3,
  onProgress: ({ done, total, kind, month, rows }) => {
    console.log(`  [${String(done).padStart(2)}/${total}] ${kind} ${month}: ${rows} rows`);
  },
});

const elapsed = ((Date.now() - started) / 1000).toFixed(1);
meta.crimeRows = crimes.length;
meta.stopRows = stops.length;
meta.seconds = Number(elapsed);

await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, 'crimes.json'), JSON.stringify(crimes));
await writeFile(join(outDir, 'stops.json'), JSON.stringify(stops));
await writeFile(join(outDir, 'meta.json'), JSON.stringify(meta, null, 2));

console.log(`\nSaved ${crimes.length} crimes and ${stops.length} stop and search records in ${elapsed}s.`);
console.log(`Fetched at ${meta.fetchedAt} over ${meta.requests} requests.`);
