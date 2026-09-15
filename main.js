/**
 * The entry point: work out where the data should come from, fetch it, and
 * hand it to the dashboard.
 *
 * Add `?source=snapshot` to the address to read the saved copy in `data/`
 * instead of calling the police data service. Without it the page fetches
 * live.
 */

import { createGrid, setLicence } from './node_modules/@toclocoinc/lattice-grid/lattice-grid.esm.min.js';
import { createChart } from './node_modules/@toclocoinc/lattice-grid/modules/charts.esm.min.js';
import { createKPI } from './node_modules/@toclocoinc/lattice-grid/modules/kpi.esm.min.js';
import { createTabs } from './node_modules/@toclocoinc/lattice-grid/modules/tabs.esm.min.js';
import { DEMO_LICENCE } from './src/licence.js';
import { fetchEverything } from './src/police-api.js';
import { buildDashboard } from './src/dashboard.js';

/* Applied before anything is drawn, because a grid that already exists keeps
   whatever licence was in force when it was built. */
setLicence(DEMO_LICENCE);

const root = document.querySelector('#app');
const params = new URLSearchParams(location.search);
const mode = params.get('source') === 'snapshot' ? 'snapshot' : 'live';

/** Draw the waiting state, and return a function that updates its message. */
function showProgress(first) {
  root.textContent = '';
  const panel = document.createElement('div');
  panel.className = 'loading';
  const title = document.createElement('h1');
  title.textContent = 'Street crime in central London';
  const message = document.createElement('p');
  message.className = 'loading-message';
  message.textContent = first;
  const bar = document.createElement('div');
  bar.className = 'loading-bar';
  const fill = document.createElement('div');
  fill.className = 'loading-fill';
  bar.append(fill);
  panel.append(title, message, bar);
  root.append(panel);
  return (text, fraction) => {
    message.textContent = text;
    fill.style.width = `${Math.round((fraction || 0) * 100)}%`;
  };
}

/** Say what went wrong, in words a reader can act on. */
function showError(error) {
  root.textContent = '';
  const panel = document.createElement('div');
  panel.className = 'loading';
  const title = document.createElement('h1');
  title.textContent = 'The data could not be loaded';
  const message = document.createElement('p');
  message.className = 'loading-message';
  message.textContent = String((error && error.message) || error);
  const hint = document.createElement('p');
  hint.className = 'loading-message';
  hint.textContent = 'You can open the same dashboard from the saved copy by adding ?source=snapshot to the address.';
  panel.append(title, message, hint);
  root.append(panel);
  console.error('[police demo]', error);
}

/** Read the saved copy that ships with the demo. */
async function loadSnapshot() {
  const [crimes, stops, meta] = await Promise.all(
    ['crimes', 'stops', 'meta'].map(async (name) => {
      const response = await fetch(`./data/snapshot/${name}.json`);
      if (!response.ok) throw new Error(`The saved copy is missing ${name}.json.`);
      return response.json();
    }),
  );
  return { crimes, stops, meta: { ...meta, live: false } };
}

async function start() {
  const started = performance.now();
  try {
    let data;
    if (mode === 'snapshot') {
      const update = showProgress('Reading the saved copy...');
      data = await loadSnapshot();
      update('Building the dashboard...', 1);
    } else {
      const update = showProgress('Asking the police data service what it holds...');
      try {
        const result = await fetchEverything({
          months: 12,
          concurrency: 3,
          onProgress: ({ done, total, kind, month }) => {
            const what = kind === 'crimes' ? 'street crime' : 'stop and search';
            update(`Fetched ${what} for ${month} (${done} of ${total} months of data)`, done / total);
          },
        });
        data = { ...result, meta: { ...result.meta, live: true } };
      } catch (liveError) {
        /* The service is out of our hands, so a bad day for it should not be
           a blank page here. The saved copy shows the same dashboard, and the
           masthead says plainly that is what you are looking at. */
        console.warn('[police demo] the live fetch failed, falling back to the saved copy:', liveError);
        update('The police data service could not be reached. Opening the saved copy...', 1);
        const saved = await loadSnapshot();
        data = { ...saved, meta: { ...saved.meta, live: false, fellBack: true } };
      }
    }

    const fetched = performance.now();
    const built = buildDashboard({
      root,
      createGrid,
      createChart,
      createKPI,
      createTabs,
      crimes: data.crimes,
      stops: data.stops,
      meta: data.meta,
    });

    const finished = performance.now();
    const timings = {
      mode,
      fellBack: !!data.meta.fellBack,
      crimes: data.crimes.length,
      stops: data.stops.length,
      requests: data.meta.requests || 0,
      fetchMs: Math.round(fetched - started),
      buildMs: Math.round(finished - fetched),
      totalMs: Math.round(finished - started),
    };
    /* `built` is kept by reference, not copied: the stop and search grid is
       only created when its tab is first opened, and a copy taken now would
       never see it. */
    window.__policeDemo = Object.assign(built, { data, timings, ready: true });
    console.log('[police demo] ready', timings);
  } catch (error) {
    window.__policeDemo = { ready: false, error: String((error && error.message) || error) };
    showError(error);
  }
}

start();
