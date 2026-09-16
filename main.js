/**
 * The entry point: build the dashboard, paint it from the saved copy, then
 * refresh it from the police data service a month at a time.
 *
 * The service takes several seconds to answer each monthly request, so the
 * page does not wait for it. The saved copy in `data/snapshot/` is on screen
 * within a second; the live months then land on top of it, newest first,
 * each one updating the grid, the tiles, the charts and the tab badges as it
 * arrives. The badge at the top says which you are looking at.
 *
 * Add `?source=snapshot` to the address to read only the saved copy and
 * never call the service.
 */

import { createGrid, createHeadlessGrid, setLicence } from './node_modules/@toclocoinc/lattice-grid/lattice-grid.esm.min.js';
import { createChart } from './node_modules/@toclocoinc/lattice-grid/modules/charts.esm.min.js';
import { createKPI } from './node_modules/@toclocoinc/lattice-grid/modules/kpi.esm.min.js';
import { createTabs } from './node_modules/@toclocoinc/lattice-grid/modules/tabs.esm.min.js';
import { createDataRouter } from './node_modules/@toclocoinc/lattice-grid/modules/data-router.esm.min.js';
import { DEMO_LICENCE } from './src/licence.js';
import { monthLabel, recentMonths, streamEverything } from './src/police-api.js';
import { buildDashboard } from './src/dashboard.js';

/* Applied before anything is drawn, because a grid that already exists keeps
   whatever licence was in force when it was built. */
setLicence(DEMO_LICENCE);

const root = document.querySelector('#app');
const params = new URLSearchParams(location.search);
const mode = params.get('source') === 'snapshot' ? 'snapshot' : 'live';
const MONTHS = 12;
const CONCURRENCY = 6;

/** Draw the waiting state, shown only until the dashboard exists. */
function showProgress(text) {
  root.textContent = '';
  const panel = document.createElement('div');
  panel.className = 'loading';
  const title = document.createElement('h1');
  title.textContent = 'Street crime in central London';
  const message = document.createElement('p');
  message.className = 'loading-message';
  message.textContent = text;
  panel.append(title, message);
  root.append(panel);
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
  panel.append(title, message);
  root.append(panel);
  console.error('[police demo]', error);
}

/** One file of the saved copy. */
async function readSaved(path) {
  const response = await fetch(`./data/snapshot/${path}`);
  if (!response.ok) throw new Error(`The saved copy is missing ${path}.`);
  return response.json();
}

/**
 * Milliseconds since this page's HTML began to arrive, which is the zero a
 * reader experiences: the moment the browser stopped showing whatever came
 * before. The navigation entry carries that moment. The clock's own zero is
 * not used, because a page opened by a tool that made the tab first can
 * have a clock that started long before the page was asked for.
 */
function sinceRequest() {
  const [navigation] = performance.getEntriesByType('navigation');
  return Math.round(performance.now() - (navigation ? navigation.responseStart : 0));
}

/** This calendar month, as `YYYY-MM`. */
function thisMonth() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * The months the saved copy holds, plus the one after its newest.
 *
 * The month column's option list is fixed when the grid is built, and the
 * live months are not known until the service has answered, so the list has
 * to name any month the service could answer with. The saved copy is
 * refreshed nightly and the service publishes a month at a time, so the
 * live data can be at most one month ahead of it. A month in the list that
 * holds no rows shows in the Month filter with nothing behind it, which is
 * why the list is not made any wider than that.
 */
function monthsToOffer(saved) {
  if (!saved) return recentMonths(thisMonth(), MONTHS + 1);
  const [year, mon] = saved.months.slice().sort().pop().split('-').map(Number);
  const next = new Date(Date.UTC(year, mon, 1));
  const following = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`;
  return [...saved.months, following];
}

/** A label for a dataset and month, as the badge and the console report it. */
function nameOf(dataset, month) {
  return `${dataset === 'crime' ? 'street crime' : 'stop and search'} ${monthLabel(month)}`;
}

async function start() {
  showProgress('Reading the saved copy...');

  let saved = null;
  try {
    saved = await readSaved('meta.json');
  } catch (error) {
    if (mode === 'snapshot') {
      window.__policeDemo = { ready: false, error: String(error.message || error) };
      showError(error);
      return;
    }
    console.warn('[police demo] no saved copy to paint from:', error);
  }

  const built = buildDashboard({
    root,
    createGrid,
    createHeadlessGrid,
    createChart,
    createKPI,
    createTabs,
    createDataRouter,
    months: monthsToOffer(saved),
  });

  const timings = { mode, fellBack: false, firstPaintMs: null, savedMs: null, liveMs: null, requests: 0 };
  const live = mode === 'live' ? { settled: false, firstPaintMs: null, allMonthsMs: null, months: 0, landed: 0, failed: [], requests: 0 } : null;
  /* `built` is kept by reference, not copied: the stop and search grid is
     only created when its tab is first opened, and a copy taken now would
     never see it. */
  window.__policeDemo = Object.assign(built, { timings, live, ready: false });

  /* The moment rows first reach the screen, from whichever copy got there
     first, measured from the start of the page request. */
  const noteFirstPaint = () => {
    if (timings.firstPaintMs != null) return;
    timings.firstPaintMs = sinceRequest();
    if (live) live.firstPaintMs = timings.firstPaintMs;
  };

  /* Which months the service has already delivered, so a slower read of the
     saved copy can never land on top of live data. */
  const liveLanded = new Set();

  /** The months of one dataset not yet superseded by the service. */
  const stillWanted = (months) => months.filter(({ dataset, month }) => !liveLanded.has(`${dataset} ${month}`));

  /**
   * Read the saved copy: the newest month goes on the page the moment it
   * arrives, and the other eleven follow together in one change once they
   * have all arrived. Two changes rather than twenty four, because every
   * change is a full pass over the grid, and the newest month alone is
   * enough to give a reader something to look at.
   */
  const loadSaved = async () => {
    if (!saved) return;
    const read = async (dataset, month) => {
      try {
        const rows = await readSaved(`${dataset === 'crime' ? 'crimes' : 'stops'}/${month}.json`);
        return { dataset, month, rows };
      } catch (error) {
        console.warn(`[police demo] ${nameOf(dataset, month)} is missing from the saved copy:`, error);
        return null;
      }
    };
    const [newest, ...older] = saved.months;
    const rest = older.flatMap((month) => [read('crime', month), read('stop', month)]);

    const first = stillWanted((await Promise.all([read('crime', newest), read('stop', newest)])).filter(Boolean));
    if (first.length) {
      built.ingest(first);
      noteFirstPaint();
    }

    const remaining = stillWanted((await Promise.all(rest)).filter(Boolean));
    if (remaining.length) {
      built.ingest(remaining);
      noteFirstPaint();
    }
    timings.savedMs = sinceRequest();
  };

  /** Ask the service for every month and put each on the page as it lands. */
  const loadLive = async () => {
    let total = 0;
    let done = 0;
    const failed = [];
    const progress = () => built.setStatus({ state: 'refreshing', fetchedAt: saved && saved.fetchedAt, done, total });
    progress();
    const result = await streamEverything({
      months: MONTHS,
      concurrency: CONCURRENCY,
      onStart: ({ months }) => {
        total = months.length * 2;
        live.months = months.length;
        progress();
      },
      onMonth: ({ dataset, month, rows }) => {
        done += 1;
        liveLanded.add(`${dataset} ${month}`);
        built.ingest([{ dataset, month, rows }]);
        if (dataset === 'crime') noteFirstPaint();
        live.landed = done;
        progress();
      },
      onFailed: ({ dataset, month, error }) => {
        done += 1;
        failed.push({ dataset, month });
        console.warn(`[police demo] ${nameOf(dataset, month)} could not be fetched:`, error);
        progress();
      },
    });
    return { ...result, failed };
  };

  try {
    built.setStatus({ state: mode === 'live' ? 'refreshing' : 'saved', fetchedAt: saved && saved.fetchedAt });

    /* The service is out of our hands, so a bad day for it should not be a
       blank page here. Its failure is caught the moment it happens, while
       the saved copy is still being read, and answered once that is on
       screen: the masthead then says plainly what you are looking at. */
    const savedDone = loadSaved();
    const liveDone =
      mode === 'live'
        ? loadLive().catch((liveError) => {
            console.warn('[police demo] the police data service could not be reached:', liveError);
            return null;
          })
        : null;

    await savedDone;
    built.ready = true;
    console.log('[police demo] saved copy on screen', { savedMs: timings.savedMs, firstPaintMs: timings.firstPaintMs });
    if (!liveDone) return;

    const result = await liveDone;
    timings.liveMs = sinceRequest();
    live.allMonthsMs = timings.liveMs;
    live.settled = true;

    const landed = result ? result.months.length * 2 - result.failed.length : 0;
    timings.requests = result ? result.requests : 0;
    live.requests = timings.requests;
    live.failed = result ? result.failed.map((f) => `${f.dataset} ${f.month}`) : [];

    if (!landed) {
      timings.fellBack = true;
      built.setStatus({ state: 'offline', fetchedAt: saved && saved.fetchedAt });
    } else {
      /* A month the saved copy held that has since left the twelve month
         window goes; a month that would not refresh keeps its saved rows. */
      built.retainMonths(result.months);
      const failedMonths = [...new Set(result.failed.map((f) => f.month))].sort().reverse();
      built.setStatus({
        state: failedMonths.length ? 'partial' : 'live',
        fetchedAt: result.fetchedAt,
        failedMonths,
      });
    }
    console.log('[police demo] live months landed', { ...timings, failed: live.failed });
  } catch (error) {
    /* A page that already has the saved copy on it is not taken down for a
       failure that came later; that is logged and the page is left as it
       stands. Before that point there is nothing to leave, so it says what
       went wrong. */
    built.error = String((error && error.message) || error);
    if (built.ready) {
      console.error('[police demo]', error);
      return;
    }
    built.ready = false;
    showError(error);
  }
}

start();
