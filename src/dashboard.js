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

/** The months present in the rows, oldest first. */
function monthsIn(rows) {
  const seen = new Set();
  for (const row of rows) if (row.month) seen.add(row.month);
  return [...seen].sort();
}

/** Month options for a column that stores `2026-07` and should read `Jul 2026`. */
function monthOptions(rows) {
  return monthsIn(rows).map((month) => ({ id: month, label: monthLabel(month) }));
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
function crimeColumns(rows) {
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
          lookup: { options: monthOptions(rows), sortBy: 'optionOrder' },
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
function stopColumns(rows) {
  return [
    {
      title: 'When',
      columns: [
        {
          id: 'month',
          field: 'month',
          title: 'Month',
          lookup: { options: monthOptions(rows), sortBy: 'optionOrder' },
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
 * Build the whole page into `root`.
 *
 * @param {object} options
 * @param {HTMLElement} options.root where the dashboard is drawn
 * @param {Function} options.createGrid the grid factory
 * @param {Function} options.createChart the charts module's factory
 * @param {Function} options.createKPI the KPI module's factory
 * @param {Function} options.createTabs the tabs module's factory
 * @param {object[]} options.crimes the street crime rows
 * @param {object[]} options.stops the stop and search rows
 * @param {object} options.meta what was fetched, and when
 * @returns {object} the pieces that were built, for a caller that wants them
 */
export function buildDashboard({ root, createGrid, createChart, createKPI, createTabs, crimes, stops, meta }) {
  root.textContent = '';

  const months = monthsIn(crimes);
  const period = months.length
    ? `${monthLabel(months[0])} to ${monthLabel(months[months.length - 1])}`
    : 'no months loaded';

  /* The masthead. */
  const header = el('header', 'head');
  const heading = el('div', 'head-text');
  heading.append(el('h1', null, 'Street crime in central London'));
  heading.append(
    el(
      'p',
      'lede',
      `${commas(crimes.length)} recorded crimes and ${commas(stops.length)} stop and search records, ` +
        `covering the West End, Westminster and the City. ${period}.`,
    ),
  );
  header.append(heading);

  const provenance = el('div', 'head-note');
  provenance.append(el('span', 'pill', meta.live ? 'Live from the police data service' : 'Saved copy'));
  provenance.append(el('span', null, meta.fetchedAt ? `Data fetched ${new Date(meta.fetchedAt).toLocaleString('en-GB')}` : ''));
  header.append(provenance);
  root.append(header);

  /* The tiles across the top. */
  const kpiHost = el('section', 'kpi-strip');
  kpiHost.setAttribute('aria-label', 'Headline figures');
  root.append(kpiHost);

  /* The tabs, and the panes inside them. */
  const tabsHost = el('section', 'tabs-host');
  root.append(tabsHost);

  const built = { crimeGrid: null, stopGrid: null, charts: [], kpi: null, tabs: null };

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
     * grid is filtered to. The order along the bottom of each chart is the
     * order the grid walks its rows, which is why the Month column is sorted
     * oldest first.
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

  /** The stop and search pane: its own grid, with a chart beside it. */
  const stopPane = (host) => {
    const split = el('div', 'split');
    const chartBox = el('div', 'chart-box tall');
    const gridBox = el('div', 'grid-box');
    split.append(chartBox, gridBox);
    host.append(split);

    const grid = createGrid(gridBox, {
      rowKey: 'id',
      rows: stops,
      columns: stopColumns(stops),
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
      destroy() {
        grid.destroy();
      },
    };
  };

  const tabs = createTabs(tabsHost, {
    createGrid,
    ariaLabel: 'Dashboard views',
    tabs: [
      {
        id: 'crime',
        label: 'Street crime',
        badge: true,
        config: {
          rowKey: 'id',
          rows: crimes,
          columns: crimeColumns(crimes),
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
      { id: 'stops', label: 'Stop and search', badge: stops.length, view: stopPane },
    ],
  });
  built.tabs = tabs;
  built.crimeGrid = tabs.tab('crime');

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

  /* Recomputing whenever the grid's filters or arrangement move keeps the
     figures honest about what is actually in view. */
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
  const actions = el('div', 'actions');
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

  /* These buttons act on the crime grid, so they only belong on its tab. */
  const showActionsFor = (id) => {
    actions.hidden = id !== 'crime';
  };
  showActionsFor(tabs.activeId);
  tabs.on('tab:changed', (event) => showActionsFor(event.id));

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

  return built;
}
