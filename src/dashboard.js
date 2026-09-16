/**
 * The dashboard itself: the grids, the tiles and the charts.
 *
 * Nothing here imports the grid. Every factory it needs is handed in, so the
 * same code builds the page you serve locally and the single file preview,
 * which loads the same library a different way.
 */

import { monthLabel } from './police-api.js';

/** Make an element with a class and optional text, the long way round. */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/** One number, written the way a reader expects to see it. */
function commas(value) {
  return Number(value || 0).toLocaleString('en-GB');
}

/**
 * Month options for a column that stores `2026-07` and should read `Jul 2026`,
 * oldest first. The list is fixed when the grid is built, before any row has
 * arrived, so it has to name every month a row could carry.
 */
function monthOptions(months) {
  return [...new Set(months)].sort().map((month) => ({ id: month, label: monthLabel(month) }));
}

/** How many crimes fall in each month, oldest first. */
function countsByMonth(rows) {
  const counts = new Map();
  for (const row of rows) counts.set(row.month, (counts.get(row.month) || 0) + 1);
  return [...counts.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

/** The commonest value of a field, and how often it occurs. */
function topValue(rows, field) {
  const counts = new Map();
  for (const row of rows) {
    const value = row[field];
    if (value == null) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  let best = null;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return { value: best, count: bestCount };
}

/* ------------------------------------------------------------------ */
/* Columns                                                             */
/* ------------------------------------------------------------------ */

/** The crime grid's columns, grouped under three headings. */
function crimeColumns(months) {
  const coordinate = {
    type: 'number',
    format: { decimals: 4, thousandsSeparator: false },
    filter: { type: 'number' },
    layout: { width: 96 },
  };
  return [
    {
      title: 'When',
      columns: [
        /*
         * Sorted oldest first, which is what puts the time axis of the
         * charts the right way round: a chart lays its categories out in the
         * order the grid walks its rows, so the grid's order is the chart's
         * order. Clicking the heading reverses both together.
         */
        {
          id: 'month',
          field: 'month',
          title: 'Month',
          lookup: { options: months, sortBy: 'optionOrder' },
          filter: { type: 'set' },
          sort: { direction: 'asc' },
          layout: { width: 110 },
        },
      ],
    },
    {
      title: 'What happened',
      columns: [
        {
          id: 'category',
          field: 'category',
          title: 'Crime type',
          filter: { type: 'set' },
          layout: { width: 210 },
        },
        {
          id: 'outcome',
          field: 'outcome',
          title: 'Latest outcome',
          filter: { type: 'set' },
          layout: { width: 290 },
        },
        {
          id: 'outcomeKnown',
          field: 'outcomeKnown',
          title: 'Outcome',
          filter: { type: 'set' },
          layout: { width: 120 },
        },
        /*
         * Every row is one crime, so this column is always 1. It is what the
         * charts add up, and what a group subtotal counts, but it says
         * nothing in a flat list, so it starts hidden and can be switched on
         * from the Columns panel.
         */
        {
          id: 'count',
          field: 'count',
          title: 'Crimes',
          type: 'number',
          total: 'sum',
          groupTotal: 'sum',
          filter: { type: 'none' },
          layout: { width: 90, hidden: true },
        },
      ],
    },
    {
      title: 'Where',
      columns: [
        { id: 'street', field: 'street', title: 'Street', filter: { type: 'text' }, layout: { width: 230 } },
        {
          id: 'district',
          field: 'district',
          title: 'District',
          filter: { type: 'set' },
          layout: { width: 200 },
        },
        {
          id: 'reportedBy',
          field: 'reportedBy',
          title: 'Reported by',
          filter: { type: 'set' },
          layout: { width: 170 },
        },
        { ...coordinate, id: 'lat', field: 'lat', title: 'Latitude' },
        { ...coordinate, id: 'lng', field: 'lng', title: 'Longitude' },
      ],
    },
  ];
}

/** The stop and search grid's columns. */
function stopColumns(months) {
  return [
    {
      title: 'When',
      columns: [
        {
          id: 'month',
          field: 'month',
          title: 'Month',
          lookup: { options: months, sortBy: 'optionOrder' },
          filter: { type: 'set' },
          layout: { width: 110 },
        },
        { id: 'hour', field: 'hour', title: 'Hour', type: 'number', filter: { type: 'number' }, layout: { width: 80 } },
      ],
    },
    {
      title: 'The search',
      columns: [
        { id: 'type', field: 'type', title: 'Search type', filter: { type: 'set' }, layout: { width: 170 } },
        { id: 'objectOfSearch', field: 'objectOfSearch', title: 'Looking for', filter: { type: 'set' }, layout: { width: 200 } },
        { id: 'legislation', field: 'legislation', title: 'Legislation', filter: { type: 'set' }, layout: { width: 250 } },
      ],
    },
    {
      title: 'The result',
      columns: [
        { id: 'outcome', field: 'outcome', title: 'Outcome', filter: { type: 'set' }, layout: { width: 230 } },
        { id: 'linkedToObject', field: 'linkedToObject', title: 'Linked to the search', filter: { type: 'set' }, layout: { width: 160 } },
      ],
    },
    {
      title: 'Who and where',
      columns: [
        { id: 'ageRange', field: 'ageRange', title: 'Age range', filter: { type: 'set' }, layout: { width: 110 } },
        { id: 'gender', field: 'gender', title: 'Gender', filter: { type: 'set' }, layout: { width: 110 } },
        { id: 'ethnicity', field: 'ethnicity', title: 'Ethnicity', filter: { type: 'set' }, layout: { width: 140 } },
        { id: 'street', field: 'street', title: 'Street', filter: { type: 'text' }, layout: { width: 220 } },
        { id: 'district', field: 'district', title: 'District', filter: { type: 'set' }, layout: { width: 200 } },
        /* Always 1, as on the crime grid: it is what the chart adds up. */
        {
          id: 'count',
          field: 'count',
          title: 'Searches',
          type: 'number',
          total: 'sum',
          groupTotal: 'sum',
          filter: { type: 'none' },
          layout: { width: 90, hidden: true },
        },
      ],
    },
  ];
}

/* ------------------------------------------------------------------ */
/* The dashboard                                                       */
/* ------------------------------------------------------------------ */

/**
 * Build the whole page into `root`, empty, and return the handles that feed
 * it.
 *
 * Rows arrive afterwards, a month at a time, through `ingest`. One data
 * router partitions them by `dataset` and hands each viewer its slice as a
 * keyed diff, so a month that is already on screen is updated in place
 * rather than drawn twice, and the tiles, charts and tab badges follow the
 * grids they read.
 *
 * @param {object} options
 * @param {HTMLElement} options.root where the dashboard is drawn
 * @param {Function} options.createGrid the grid factory
 * @param {Function} options.createHeadlessGrid the headless grid factory, for tab badges
 * @param {Function} options.createChart the charts module's factory
 * @param {Function} options.createKPI the KPI module's factory
 * @param {Function} options.createTabs the tabs module's factory
 * @param {Function} options.createDataRouter the data router module's factory
 * @param {string[]} options.months every month a row may carry, oldest first
 * @returns {object} the pieces that were built and the calls that feed them
 */
export function buildDashboard({
  root,
  createGrid,
  createHeadlessGrid,
  createChart,
  createKPI,
  createTabs,
  createDataRouter,
  months,
}) {
  root.textContent = '';

  const options = monthOptions(months);

  /* The masthead. */
  const header = el('header', 'head');
  const heading = el('div', 'head-text');
  heading.append(el('h1', null, 'Street crime in central London'));
  const lede = el('p', 'lede', 'Loading...');
  heading.append(lede);
  /* Said when the figures are not today's: the saved copy standing in for a
     service that could not be reached, or a month that would not refresh. A
     reader should never have to wonder whether what they see is current. */
  const notice = el('p', 'notice');
  notice.hidden = true;
  heading.append(notice);
  header.append(heading);

  const provenance = el('div', 'head-note');
  const pill = el('span', 'pill', 'Saved copy');
  const fetchedAt = el('span', 'fetched-at');
  const progress = el('span', 'progress');
  progress.hidden = true;
  provenance.append(pill, fetchedAt, progress);
  header.append(provenance);
  root.append(header);

  /* The tiles across the top. */
  const kpiHost = el('section', 'kpi-strip');
  kpiHost.setAttribute('aria-label', 'Headline figures');
  root.append(kpiHost);

  /* The tabs, and the panes inside them. */
  const tabsHost = el('section', 'tabs-host');
  root.append(tabsHost);

  /* Every row on the page, by id: what the router is loaded from when a
     viewer arrives late, and what the headline counts are read from. */
  const store = new Map();

  const built = { crimeGrid: null, stopGrid: null, charts: [], kpi: null, tabs: null, router: null, store };

  /** How many rows of a dataset the store holds, and which months. */
  const summarise = (dataset) => {
    let count = 0;
    const seen = new Set();
    for (const row of store.values()) {
      if (row.dataset !== dataset) continue;
      count += 1;
      seen.add(row.month);
    }
    return { count, months: [...seen].sort() };
  };

  /** The sentence under the title: what is on the page right now. */
  const refreshHeadline = () => {
    const crimes = summarise('crime');
    const stops = summarise('stop');
    const period = crimes.months.length
      ? `${monthLabel(crimes.months[0])} to ${monthLabel(crimes.months[crimes.months.length - 1])}`
      : 'no months loaded yet';
    lede.textContent =
      `${commas(crimes.count)} recorded crimes and ${commas(stops.count)} stop and search records, ` +
      `covering the West End, Westminster and the City. ${period}.`;
  };

  /* ---------------- the router ---------------- */

  /*
   * One stream in, two grids out. Rows are partitioned by `dataset`, so a
   * crime reaches the crime grid and a stop and search the stop and search
   * grid, and each grid is updated in place by `id`: a row it already holds
   * is updated if it changed and left alone if it did not.
   */
  const router = createDataRouter({ key: 'dataset', rowKey: 'id' });
  built.router = router;

  /**
   * Put months of data on the page, each replacing whatever the page held
   * for that month of that dataset.
   *
   * A row already present with the same id is updated rather than added,
   * which is what lets a live month land on top of the saved copy of the
   * same month without doubling it. A row the page held for that month that
   * the new copy no longer carries is taken off.
   *
   * Everything passed in goes through the router as one change, so the grids
   * lay themselves out once for the batch rather than once per month. That
   * is the difference between painting the saved copy in one go and doing
   * it twelve times over.
   *
   * @param {{ dataset: 'crime'|'stop', month: string, rows: object[] }[]} batch
   *   the months, each with the dataset its rows belong to and the month as
   *   `YYYY-MM`
   * @returns {{ applied: number, removed: number }} what was sent
   */
  const ingest = (batch) => {
    const incoming = new Set();
    const replaced = new Set();
    for (const { dataset, month, rows } of batch) {
      replaced.add(`${dataset} ${month}`);
      for (const row of rows) incoming.add(String(row.id));
    }
    const deltas = [];
    for (const [id, row] of store) {
      if (replaced.has(`${row.dataset} ${row.month}`) && !incoming.has(id)) {
        store.delete(id);
        deltas.push({ op: 'delete', row });
      }
    }
    const removed = deltas.length;
    for (const { rows } of batch) {
      for (const row of rows) {
        store.set(String(row.id), row);
        deltas.push({ op: 'upsert', row });
      }
    }
    if (deltas.length) router.apply(deltas);
    refreshHeadline();
    return { applied: incoming.size, removed };
  };
  built.ingest = ingest;

  /**
   * Keep only these months, taking every other month off the page. Used
   * once the live months have all landed, so a month the saved copy held
   * that has since left the twelve month window goes with it.
   *
   * @param {string[]} keep the months to keep, as `YYYY-MM`
   * @returns {number} how many rows were taken off
   */
  const retainMonths = (keep) => {
    const wanted = new Set(keep);
    const deltas = [];
    for (const [id, row] of store) {
      if (!wanted.has(row.month)) {
        store.delete(id);
        deltas.push({ op: 'delete', row });
      }
    }
    if (deltas.length) router.apply(deltas);
    refreshHeadline();
    return deltas.length;
  };
  built.retainMonths = retainMonths;

  /**
   * Say where the figures came from and how fresh they are.
   *
   * @param {object} status
   * @param {'saved'|'refreshing'|'live'|'partial'|'offline'} status.state
   * @param {string} [status.fetchedAt] when the data on the page was fetched
   * @param {number} [status.done] how many requests have landed, while refreshing
   * @param {number} [status.total] how many there are, while refreshing
   * @param {string[]} [status.failedMonths] the months that would not refresh
   */
  const setStatus = ({ state, fetchedAt: when, done, total, failedMonths }) => {
    const failed = failedMonths || [];
    const failedText = failed.map(monthLabel).join(', ');
    const fetched = when ? `Data fetched ${new Date(when).toLocaleString('en-GB')}` : '';
    progress.hidden = true;
    progress.textContent = '';
    notice.hidden = true;
    notice.textContent = '';
    fetchedAt.textContent = fetched;
    if (state === 'saved') {
      pill.textContent = 'Saved copy';
    } else if (state === 'refreshing') {
      pill.textContent = 'Saved copy - refreshing';
      if (total) {
        progress.hidden = false;
        progress.textContent = `Refreshing from the police data service: ${done || 0} of ${total} months of data`;
      }
    } else if (state === 'live') {
      pill.textContent = 'Live';
    } else if (state === 'partial') {
      pill.textContent = `Live - ${failed.length === 1 ? '1 month' : `${failed.length} months`} not refreshed`;
      notice.hidden = false;
      notice.textContent =
        `${failedText} could not be fetched from the police data service after two attempts, ` +
        'so the saved copy is shown for that period. Reloading the page will try again.';
    } else if (state === 'offline') {
      pill.textContent = 'Saved copy';
      notice.hidden = false;
      notice.textContent =
        'The police data service could not be reached, so this is the saved copy. Reloading the page will try again.';
    }
  };
  built.setStatus = setStatus;

  /* ---------------- the panes ---------------- */

  /** Two rows of chart panes over the crime grid. */
  const chartPane = (host) => {
    const wrap = el('div', 'chart-wrap');
    const boxes = [];
    for (let i = 0; i < 4; i += 1) {
      const box = el('div', 'chart-box');
      wrap.append(box);
      boxes.push(box);
    }
    host.append(wrap);

    const grid = built.crimeGrid;
    if (!grid) return { destroy() {} };

    /*
     * Every chart here reads the crime grid, so all four follow whatever the
     * grid is filtered to, and redraw as each month lands in it. The order
     * along the bottom of each chart is the order the grid walks its rows,
     * which is why the Month column is sorted oldest first.
     */
    const specs = [
      {
        type: 'bar',
        x: 'category',
        y: 'count',
        title: 'Crimes by type',
        axis: { y: 'Crimes', x: { labels: true } },
        legend: false,
      },
      {
        type: 'line',
        x: 'month',
        y: 'count',
        title: 'Crimes recorded each month',
        axis: { y: 'Crimes', x: { format: monthLabel } },
        legend: false,
        curve: true,
      },
      {
        type: 'bar',
        x: 'month',
        series: 'outcomeKnown',
        y: 'count',
        stack: true,
        title: 'Whether an outcome has been recorded, by month',
        axis: { y: 'Crimes', x: { format: monthLabel } },
        legend: { position: 'bottom' },
      },
      {
        type: 'line',
        x: 'month',
        series: 'district',
        y: 'count',
        title: 'Crimes each month, by district',
        axis: { y: 'Crimes', x: { format: monthLabel } },
        legend: { position: 'bottom' },
      },
    ];

    const charts = [];
    specs.forEach((spec, index) => {
      try {
        charts.push(createChart({ grid, container: boxes[index], ...spec }));
      } catch (error) {
        boxes[index].append(el('p', 'chart-error', `This chart could not be drawn: ${error.message}`));
      }
    });
    built.charts.push(...charts);
    return {
      destroy() {
        for (const chart of charts) chart.destroy();
      },
    };
  };

  /**
   * The stop and search pane: its own grid, with a chart beside it.
   *
   * The pane is built the first time its tab is opened, so its grid joins
   * the router at that moment and is handed the stop and search rows that
   * arrived before it existed. From then on it is fed like the crime grid.
   *
   * What is returned exposes the grid's rows and events, which is how the
   * tab's badge counts them.
   */
  const stopPane = (host) => {
    const split = el('div', 'split');
    const chartBox = el('div', 'chart-box tall');
    const gridBox = el('div', 'grid-box');
    split.append(chartBox, gridBox);
    host.append(split);

    const grid = createGrid(gridBox, {
      rowKey: 'id',
      rows: [],
      columns: stopColumns(options),
      theme: 'light',
      density: 'compact',
      stripedRows: true,
      columnMenu: true,
      groupPanel: true,
      statusBar: true,
      find: true,
      grandTotalRow: 'bottom',
      toolPanel: { side: 'right', panels: ['filters', 'columns'] },
      selection: 'multiple',
      title: 'Stop and search',
    });
    built.stopGrid = grid;

    router.attach(grid, 'stop');
    const waiting = [];
    for (const row of store.values()) if (row.dataset === 'stop') waiting.push({ op: 'upsert', row });
    if (waiting.length) router.apply(waiting);

    try {
      built.charts.push(
        createChart({
          grid,
          container: chartBox,
          type: 'horizontalBar',
          x: 'objectOfSearch',
          series: 'outcome',
          y: 'count',
          stack: true,
          title: 'What officers were looking for, and what came of it',
          /* The reasons for a search are long phrases, so they need the room. */
          margin: { left: 165 },
          legend: { position: 'bottom' },
        }),
      );
    } catch (error) {
      chartBox.append(el('p', 'chart-error', `This chart could not be drawn: ${error.message}`));
    }

    return {
      grid,
      rows: grid.rows,
      on: (name, fn) => grid.on(name, fn),
      off: (name, fn) => grid.off(name, fn),
      destroy() {
        router.detach(grid);
        grid.destroy();
      },
    };
  };

  /*
   * The row of grouping buttons belongs to the crime tab alone, and showing
   * or hiding it changes how much height is left for the tab below it. That
   * has to happen before the incoming tab is built, not after: a pane that is
   * measured and then made taller has to lay itself out a second time, which
   * a reader sees as the view redrawing. `actions` is filled in further down,
   * so this tolerates being called before it exists.
   */
  let actions = null;
  const showActionsFor = (id) => {
    if (actions) actions.hidden = id !== 'crime';
  };

  const tabs = createTabs(tabsHost, {
    createGrid,
    createHeadlessGrid,
    ariaLabel: 'Dashboard views',
    onBeforeTabChange: (event) => showActionsFor(event.id),
    onTabChangeCancelled: (event) => showActionsFor(event.previousId),
    tabs: [
      {
        id: 'crime',
        label: 'Street crime',
        badge: true,
        config: {
          rowKey: 'id',
          rows: [],
          columns: crimeColumns(options),
          theme: 'light',
          density: 'compact',
          stripedRows: true,
          columnMenu: true,
          groupPanel: true,
          statusBar: true,
          find: true,
          grandTotalRow: 'bottom',
          groupDefaultExpanded: 0,
          toolPanel: { side: 'right', panels: ['filters', 'columns'] },
          selection: 'multiple',
          title: 'Recorded street crime',
        },
      },
      { id: 'charts', label: 'Charts', view: chartPane },
      /* The count appears once the tab has been opened and its grid exists
         to be counted; from then on it follows the grid. */
      { id: 'stops', label: 'Stop and search', badge: true, view: stopPane },
    ],
  });
  built.tabs = tabs;
  built.crimeGrid = tabs.tab('crime');

  router.attach(built.crimeGrid, 'crime');

  /*
   * The commonest crime type reads as words, and every tile in the panel is
   * a number, so it gets a tile of its own beside the panel rather than being
   * forced through a number format.
   */
  const namedTile = el('div', 'kpi-named');
  const namedValue = el('div', 'kpi-named-value', 'No data');
  const namedLabel = el('div', 'kpi-named-label', 'Most common crime type');
  namedTile.append(namedValue, namedLabel);

  const panelHost = el('div', 'kpi-panel');
  kpiHost.append(panelHost, namedTile);

  /**
   * Every crime the grid currently matches, whether or not it is grouped.
   *
   * Walking the grid gives back what is on screen, and once the rows are
   * grouped that is a handful of headings rather than the crimes themselves,
   * which would leave the figures above reading nothing. Taking the crimes
   * beneath each heading, and keying them so an open group is not counted
   * twice, gives the same set in either arrangement.
   */
  const matchedRows = () => {
    const grid = built.crimeGrid;
    if (!grid) return [];
    const seen = new Map();
    grid.rows.forEach((row) => {
      if (!row) return;
      if (row.group) {
        for (const leaf of grid.rows.leavesOf(row.key) || []) {
          if (leaf && leaf.data) seen.set(leaf.key, leaf.data);
        }
      } else if (row.data) {
        seen.set(row.key, row.data);
      }
    });
    return [...seen.values()];
  };

  /** Read the commonest crime type from whatever the grid currently matches. */
  const refreshNamedTile = (rows) => {
    const top = topValue(rows, 'category');
    namedValue.textContent = top.value ? top.value : 'No data';
    namedLabel.textContent = top.value
      ? `Most common crime type, ${commas(top.count)} of ${commas(rows.length)}`
      : 'Most common crime type';
  };

  /* The tiles are fed the matched crimes, so they follow the grid's filters. */
  if (built.crimeGrid) {
    built.kpi = createKPI(panelHost, {
      rows: [],
      rowKey: 'id',
      columns: 3,
      ariaLabel: 'Headline figures',
      tiles: [
        { id: 'total', label: 'Crimes in view', aggregation: 'count', format: 'number' },
        {
          id: 'outcomeShare',
          label: 'Share with a recorded outcome',
          aggregation: 'custom',
          format: { type: 'percent', decimals: 1 },
          compute: (rows) => {
            if (!rows.length) return null;
            const recorded = rows.filter((row) => row.outcomeKnown === 'Recorded').length;
            return recorded / rows.length;
          },
        },
        {
          id: 'monthChange',
          label: 'Change on the month before',
          aggregation: 'custom',
          format: { type: 'percent', decimals: 1 },
          compute: (rows) => {
            const series = countsByMonth(rows);
            if (series.length < 2) return null;
            const latest = series[series.length - 1][1];
            const previous = series[series.length - 2][1];
            if (!previous) return null;
            return (latest - previous) / previous;
          },
        },
      ],
    });
  }

  /* Recomputing whenever the grid's rows, filters or arrangement move keeps
     the figures honest about what is actually in view, month by month as
     the data lands. */
  if (built.crimeGrid) {
    const refresh = () => {
      const rows = matchedRows();
      if (built.kpi) built.kpi.setRows(rows);
      refreshNamedTile(rows);
    };
    built.crimeGrid.on('filter:changed', refresh);
    built.crimeGrid.on('model:changed', refresh);
    built.crimeGrid.on('column:grouped', refresh);
    refresh();
  }

  /* A short row of shortcuts under the tabs, for the grouped views. */
  actions = el('div', 'actions');
  const button = (label, onClick) => {
    const node = el('button', 'action', label);
    node.type = 'button';
    node.addEventListener('click', onClick);
    return node;
  };
  actions.append(el('span', 'actions-label', 'Group the crimes by'));
  actions.append(button('Crime type', () => built.crimeGrid && built.crimeGrid.columns.group(['category'])));
  actions.append(button('Month', () => built.crimeGrid && built.crimeGrid.columns.group(['month'])));
  actions.append(button('Type, then month', () => built.crimeGrid && built.crimeGrid.columns.group(['category', 'month'])));
  actions.append(button('No grouping', () => built.crimeGrid && built.crimeGrid.columns.group([])));
  tabsHost.prepend(actions);

  showActionsFor(tabs.activeId);

  /* The licence line the Open Government Licence asks for. */
  const footer = el('footer', 'foot');
  footer.append(
    el('p', null, 'Contains public sector information licensed under the Open Government Licence v3.0'),
  );
  const link = el('a', null, 'data.police.uk');
  link.href = 'https://data.police.uk/';
  link.rel = 'noopener';
  const line = el('p', null, 'Source: ');
  line.append(link);
  line.append(
    document.createTextNode(
      '. Street level locations are approximate: each crime is mapped to a nearby point, not to an address.',
    ),
  );
  footer.append(line);
  root.append(footer);

  refreshHeadline();
  return built;
}
