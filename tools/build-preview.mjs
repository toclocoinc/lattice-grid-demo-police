/**
 * Build `preview.html`: the whole dashboard in one file that can be opened
 * from disk, with the saved data written into the page and the grid loaded
 * from a public CDN.
 *
 * Run it with `npm run preview`. It is a development tool.
 */

import { readFile, writeFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const pkgDir = join(root, 'node_modules', '@toclocoinc', 'lattice-grid');
const CDN = 'https://cdn.jsdelivr.net/npm/@toclocoinc/lattice-grid@1.61.0';

/** Fields that are worked out again on the way in rather than being stored. */
const DERIVED = new Set(['monthLabel', 'count']);

/**
 * Pack rows column by column.
 *
 * Written out row by row, the same few hundred street names and the same
 * dozen crime types are repeated tens of thousands of times. Listing each
 * column's distinct values once and then referring to them by position is
 * what keeps the file small enough to open. A column whose values are nearly
 * all different is written as it stands, because a list of them would save
 * nothing.
 */
function pack(rows) {
  const fields = new Set();
  for (const row of rows) {
    for (const key of Object.keys(row)) if (!DERIVED.has(key)) fields.add(key);
  }

  const columns = {};
  for (const field of fields) {
    const values = rows.map((row) => (row[field] === undefined ? null : row[field]));
    /* Keyed on the value itself, so `null`, `1` and `'1'` stay three
       different things rather than collapsing into one. */
    const distinct = new Set(values);

    if (distinct.size <= Math.max(64, values.length / 8)) {
      const dictionary = [];
      const index = new Map();
      const codes = new Array(values.length);
      for (let i = 0; i < values.length; i += 1) {
        let code = index.get(values[i]);
        if (code === undefined) {
          code = dictionary.length;
          dictionary.push(values[i]);
          index.set(values[i], code);
        }
        codes[i] = code;
      }
      columns[field] = { d: dictionary, v: codes };
    } else {
      columns[field] = { r: values };
    }
  }
  return { n: rows.length, columns };
}

/**
 * Strip the module syntax so a file can be dropped into a classic script.
 * Everything it declares becomes an ordinary global, which is what lets the
 * one copy of the dashboard serve both the served page and this file.
 */
function flatten(source) {
  const flat = source
    .replace(/^import\s[^;]*;$/gm, '')
    .replace(/^export\s+default\s+[^;]*;$/gm, '')
    .replace(/^export\s*\{[^}]*\};$/gm, '')
    .replace(/^export\s+(?=(?:async\s+)?(?:function|const|class|let|var)\b)/gm, '');

  const leftover = flat.match(/^\s*(export|import)\s.*$/gm);
  if (leftover) {
    throw new Error(`module syntax survived flattening:\n${leftover.join('\n')}`);
  }
  return flat;
}

/**
 * Make a JSON string safe to sit inside a script element: a literal `<` would
 * let a value close the element early, and the two Unicode line separators
 * are not valid inside a JavaScript string. They are matched by character
 * code so that this file never has to contain one.
 */
function safeJSON(value) {
  const lineSeparator = String.fromCharCode(0x2028);
  const paragraphSeparator = String.fromCharCode(0x2029);
  return JSON.stringify(value)
    .split('<')
    .join('\\u003c')
    .split(lineSeparator)
    .join('\\u2028')
    .split(paragraphSeparator)
    .join('\\u2029');
}

const [crimes, stops, meta, gridCss, pageCss, apiSrc, dashSrc] = await Promise.all([
  readFile(join(root, 'data', 'snapshot', 'crimes.json'), 'utf8').then(JSON.parse),
  readFile(join(root, 'data', 'snapshot', 'stops.json'), 'utf8').then(JSON.parse),
  readFile(join(root, 'data', 'snapshot', 'meta.json'), 'utf8').then(JSON.parse),
  readFile(join(pkgDir, 'lattice-grid.min.css'), 'utf8'),
  readFile(join(root, 'styles.css'), 'utf8'),
  readFile(join(root, 'src', 'police-api.js'), 'utf8'),
  readFile(join(root, 'src', 'dashboard.js'), 'utf8'),
]);

const packed = { crimes: pack(crimes), stops: pack(stops), meta: { ...meta, live: false } };

const bootstrap = `
/** Put the packed columns back together as ordinary rows. */
function unpack(packedRows) {
  var rows = new Array(packedRows.n);
  var entries = Object.entries(packedRows.columns);
  for (var i = 0; i < packedRows.n; i += 1) {
    var row = {};
    for (var e = 0; e < entries.length; e += 1) {
      var field = entries[e][0];
      var column = entries[e][1];
      row[field] = column.d ? column.d[column.v[i]] : column.r[i];
    }
    row.monthLabel = monthLabel(row.month);
    row.count = 1;
    rows[i] = row;
  }
  return rows;
}

/** Say what went wrong, where a reader will see it. */
function showFailure(host, error) {
  host.textContent = '';
  var panel = document.createElement('div');
  panel.className = 'loading';
  var title = document.createElement('h1');
  title.textContent = 'The dashboard could not be shown';
  var message = document.createElement('p');
  message.className = 'loading-message';
  message.textContent = String((error && error.message) || error);
  panel.appendChild(title);
  panel.appendChild(message);
  host.appendChild(panel);
}

(function start() {
  var host = document.querySelector('#app');
  try {
    if (!window.LatticeGrid || !window.LatticeGrid.createGrid) {
      throw new Error('The grid could not be loaded. This page needs to be able to reach cdn.jsdelivr.net.');
    }
    var packedData = JSON.parse(document.getElementById('police-data').textContent);
    var began = performance.now();
    var built = buildDashboard({
      root: host,
      createGrid: window.LatticeGrid.createGrid,
      createChart: window.LatticeGrid.createChart,
      createKPI: window.LatticeGridKPI.createKPI,
      createTabs: window.LatticeGridTabs.createTabs,
      crimes: unpack(packedData.crimes),
      stops: unpack(packedData.stops),
      meta: packedData.meta
    });
    built.timings = { mode: 'preview', buildMs: Math.round(performance.now() - began) };
    built.ready = true;
    window.__policeDemo = built;
  } catch (error) {
    window.__policeDemo = { ready: false, error: String((error && error.message) || error) };
    showFailure(host, error);
  }
})();
`;

const html = `<!doctype html>
<html lang="en-GB">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Street crime in central London</title>
    <link rel="icon" href="data:," />
    <style>
${gridCss}
    </style>
    <style>
${pageCss}
    </style>
  </head>
  <body>
    <main id="app">
      <div class="loading">
        <h1>Street crime in central London</h1>
        <p class="loading-message">Starting...</p>
      </div>
    </main>

    <script id="police-data" type="application/json">${safeJSON(packed)}</script>

    <script src="${CDN}/lattice-grid.min.js"></script>
    <script src="${CDN}/modules/charts.min.js"></script>
    <script src="${CDN}/modules/kpi.min.js"></script>
    <script src="${CDN}/modules/tabs.min.js"></script>

    <script>
${flatten(apiSrc)}
${flatten(dashSrc)}
${bootstrap}
    </script>
  </body>
</html>
`;

const out = join(root, 'preview.html');
await writeFile(out, html);
const { size } = await stat(out);
const mb = size / 1024 / 1024;
console.log(`Wrote ${out}`);
console.log(`${mb.toFixed(2)} MB, ${crimes.length} crimes and ${stops.length} stop and search records.`);
if (size > 16 * 1024 * 1024) {
  console.log('WARNING: over 16 MB.');
  process.exitCode = 1;
}
