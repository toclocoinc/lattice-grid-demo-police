/**
 * Talking to the data.police.uk open API, and turning what it returns into
 * flat rows the dashboard can show.
 *
 * The same module runs in the browser (live mode) and under Node (when the
 * offline snapshot is built), so there is one definition of what a row is.
 */

export const API_BASE = 'https://data.police.uk/api/';

/**
 * The area the dashboard covers: the heart of central London, taking in the
 * West End, Westminster and the City. Written as latitude,longitude pairs,
 * which is the order the API's `poly` parameter expects.
 */
export const AREA = [
  [51.5030, -0.1440],
  [51.5120, -0.1450],
  [51.5170, -0.1320],
  [51.5190, -0.1120],
  [51.5195, -0.0900],
  [51.5150, -0.0760],
  [51.5095, -0.0755],
  [51.5065, -0.0880],
  [51.5045, -0.1130],
  [51.5005, -0.1235],
  [51.4985, -0.1330],
];

/**
 * The City of London's boundary, near enough for a district label. A point
 * inside it is in the City; everything else in the area is West End and
 * Westminster. This is worked out from the coordinates the API publishes, not
 * asked of the API, because street level crime records carry no district.
 */
export const CITY = [
  [51.5205, -0.1005],
  [51.5215, -0.0870],
  [51.5180, -0.0745],
  [51.5100, -0.0760],
  [51.5078, -0.0855],
  [51.5095, -0.1010],
  [51.5140, -0.1110],
  [51.5180, -0.1080],
];

export const AREA_NAME = 'Central London';

/** The API wants `lat,lng:lat,lng:...`. */
export function polyParam(points) {
  return points.map(([lat, lng]) => `${lat},${lng}`).join(':');
}

/** Is a point inside a polygon? A plain ray cast, in latitude and longitude. */
export function inPolygon(lat, lng, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [latI, lngI] = polygon[i];
    const [latJ, lngJ] = polygon[j];
    const straddles = latI > lat !== latJ > lat;
    if (straddles && lng < ((lngJ - lngI) * (lat - latI)) / (latJ - latI) + lngI) {
      inside = !inside;
    }
  }
  return inside;
}

/** The district label for a coordinate. */
export function districtOf(lat, lng) {
  if (lat == null || lng == null) return 'Unknown';
  return inPolygon(lat, lng, CITY) ? 'City of London' : 'West End and Westminster';
}

/** `2026-07` reads as `Jul 2026`. */
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function monthLabel(month) {
  if (typeof month !== 'string' || month.length < 7) return '';
  const [year, mon] = month.split('-');
  return `${MONTH_NAMES[Number(mon) - 1] ?? mon} ${year}`;
}

/** Turn `On or near Waterloo` into `Waterloo`, and leave anything else alone. */
export function tidyStreet(name) {
  if (!name) return 'Location withheld';
  return String(name).replace(/^On or near\s+/i, '').trim() || 'Location withheld';
}

/** Title case for the API's hyphenated ids, used only when no name is supplied. */
function prettify(id) {
  return String(id || '')
    .split('-')
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ');
}

/**
 * Fetch JSON. The one failure handled here is 429, the service saying the
 * call rate was exceeded, which is answered by waiting and asking again. A
 * 503 means an area holds too many crimes to return and will not succeed on a
 * second ask; anything else is left to the caller, which retries a whole
 * month once.
 */
async function getJSON(path, params, { fetchImpl = fetch, retries = 3 } = {}) {
  const url = new URL(path, API_BASE);
  const body = new URLSearchParams(params || {});
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetchImpl(url.toString(), {
      method: body.toString() ? 'POST' : 'GET',
      headers: body.toString() ? { 'content-type': 'application/x-www-form-urlencoded' } : undefined,
      body: body.toString() || undefined,
    });
    if (response.ok) return response.json();
    if (response.status === 503) {
      throw new Error(`The area covers too many crimes for the service to return (${path}).`);
    }
    if (response.status === 429 && attempt < retries) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
      continue;
    }
    throw new Error(`${path} returned ${response.status}`);
  }
}

/** The most recent month of data the service holds, as `YYYY-MM`. */
export async function latestMonth(opts) {
  const body = await getJSON('crime-last-updated', null, opts);
  return String(body.date).slice(0, 7);
}

/** The `count` most recent months, newest first. */
export function recentMonths(latest, count) {
  const [year, mon] = latest.split('-').map(Number);
  const months = [];
  for (let back = 0; back < count; back += 1) {
    const date = new Date(Date.UTC(year, mon - 1 - back, 1));
    months.push(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

/** The published crime categories, as a lookup from id to display name. */
export async function crimeCategories(opts) {
  const list = await getJSON('crime-categories', { date: (opts && opts.date) || '' }, opts);
  const names = new Map();
  for (const entry of list) names.set(entry.url, entry.name);
  return names;
}

/** One month of street level crime for the area, as dashboard rows. */
export async function fetchCrimes(month, categoryNames, opts) {
  const raw = await getJSON('crimes-street/all-crime', { poly: polyParam(AREA), date: month }, opts);
  return raw.map((record) => normaliseCrime(record, categoryNames));
}

/** One month of stop and search for the area, as dashboard rows. */
export async function fetchStops(month, opts) {
  const raw = await getJSON('stops-street', { poly: polyParam(AREA), date: month }, opts);
  return raw.map((record, index) => normaliseStop(record, month, index));
}

/**
 * One published crime record, flattened.
 *
 * Every row carries `dataset`, because both kinds of row travel through one
 * data router on the page and that is the property it partitions them by.
 */
export function normaliseCrime(record, categoryNames) {
  const lat = record.location ? Number(record.location.latitude) : null;
  const lng = record.location ? Number(record.location.longitude) : null;
  const outcome = record.outcome_status ? record.outcome_status.category : null;
  return {
    id: record.id,
    dataset: 'crime',
    month: record.month,
    monthLabel: monthLabel(record.month),
    category: categoryNames.get(record.category) || prettify(record.category),
    street: tidyStreet(record.location && record.location.street && record.location.street.name),
    district: districtOf(lat, lng),
    reportedBy: record.location_type === 'BTP' ? 'British Transport Police' : 'Local force',
    outcome: outcome || 'No outcome recorded',
    outcomeKnown: outcome ? 'Recorded' : 'Not recorded',
    outcomeMonth: record.outcome_status ? record.outcome_status.date : null,
    lat,
    lng,
    count: 1,
  };
}

/**
 * One published stop and search record, flattened. These records carry no id
 * of their own, so one is built from the month and the record's position in
 * that month's response, which is stable for a given snapshot.
 */
export function normaliseStop(record, month, index) {
  const lat = record.location ? Number(record.location.latitude) : null;
  const lng = record.location ? Number(record.location.longitude) : null;
  const when = record.datetime ? String(record.datetime) : null;
  return {
    id: `${month}-${index}`,
    dataset: 'stop',
    month,
    monthLabel: monthLabel(month),
    datetime: when,
    hour: when ? Number(when.slice(11, 13)) : null,
    type: record.type || 'Not stated',
    objectOfSearch: record.object_of_search || 'Not stated',
    outcome: record.outcome || 'Not stated',
    linkedToObject: record.outcome_linked_to_object_of_search === true ? 'Yes' : 'No',
    legislation: record.legislation || 'Not stated',
    ageRange: record.age_range || 'Not stated',
    gender: record.gender || 'Not stated',
    ethnicity: record.officer_defined_ethnicity || 'Not stated',
    street: tidyStreet(record.location && record.location.street && record.location.street.name),
    district: districtOf(lat, lng),
    lat,
    lng,
    count: 1,
  };
}

/**
 * Fetch every month of both datasets and hand each one over as it lands.
 *
 * The service takes several seconds to answer a monthly request, so the
 * months are fetched a few at a time, newest first, and `onMonth` is called
 * for each one the moment it arrives rather than once everything has. A
 * month that fails is asked for a second time; if that fails too it is
 * reported through `onFailed` and the rest carry on.
 *
 * The published rate limit is 15 requests a second. Six slow requests never
 * approach it, but the service answers a repeated request from its cache in
 * a fraction of a second, and six workers fed that quickly would. So no two
 * requests start within `spacing` milliseconds of each other, whatever the
 * workers are doing: at 100 ms that is ten a second at most.
 *
 * `onStart` is called once the months are known, before any of them lands.
 * The promise resolves once every month has landed or been given up on.
 */
export async function streamEverything({
  months = 12,
  concurrency = 6,
  spacing = 100,
  onStart,
  onMonth,
  onFailed,
  fetchImpl,
} = {}) {
  const opts = fetchImpl ? { fetchImpl } : undefined;

  let nextStart = 0;
  const takeTurn = async () => {
    const now = Date.now();
    const at = Math.max(now, nextStart);
    nextStart = at + spacing;
    if (at > now) await new Promise((resolve) => setTimeout(resolve, at - now));
  };

  const [latest, categoryNames] = await Promise.all([latestMonth(opts), crimeCategories(opts)]);
  const monthList = recentMonths(latest, months);
  if (onStart) onStart({ months: monthList, latestMonth: latest });

  /* Newest month first, with its crimes and its stop and search side by
     side, so the most recent figures are the first to reach the page. */
  const jobs = [];
  for (const month of monthList) {
    jobs.push({ dataset: 'crime', month });
    jobs.push({ dataset: 'stop', month });
  }

  const failed = [];
  let done = 0;
  let requests = 2; // last updated, plus categories

  const fetchJob = (job) =>
    job.dataset === 'crime' ? fetchCrimes(job.month, categoryNames, opts) : fetchStops(job.month, opts);

  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next];
      next += 1;
      let rows = null;
      let error = null;
      for (let attempt = 0; attempt < 2 && !rows; attempt += 1) {
        /* A moment's pause before asking again: a request the service
           turned away is not helped by an identical one on its heels. */
        if (attempt) await new Promise((resolve) => setTimeout(resolve, 1000));
        await takeTurn();
        requests += 1;
        try {
          rows = await fetchJob(job);
        } catch (thrown) {
          error = thrown;
        }
      }
      done += 1;
      if (rows) {
        if (onMonth) onMonth({ dataset: job.dataset, month: job.month, rows, done, total: jobs.length });
      } else {
        failed.push({ dataset: job.dataset, month: job.month, error });
        if (onFailed) onFailed({ dataset: job.dataset, month: job.month, error, done, total: jobs.length });
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));

  return {
    area: AREA_NAME,
    months: monthList,
    latestMonth: latest,
    requests,
    failed,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Fetch every month of both datasets and return them whole, for the tool
 * that saves a copy. A month that could not be fetched is an error here,
 * because a saved copy with a month missing is worse than the one before it.
 */
export async function fetchEverything({ months = 12, concurrency = 6, onProgress, fetchImpl } = {}) {
  const crimes = [];
  const stops = [];
  const meta = await streamEverything({
    months,
    concurrency,
    fetchImpl,
    onMonth: ({ dataset, month, rows, done, total }) => {
      if (dataset === 'crime') crimes.push(...rows);
      else stops.push(...rows);
      if (onProgress) onProgress({ done, total, dataset, month, rows: rows.length });
    },
  });
  if (meta.failed.length) {
    const what = meta.failed.map((f) => `${f.dataset} ${f.month} (${f.error && f.error.message})`).join(', ');
    throw new Error(`Could not fetch ${what}.`);
  }

  crimes.sort((a, b) => (a.month < b.month ? 1 : a.month > b.month ? -1 : 0));
  stops.sort((a, b) => (a.datetime < b.datetime ? 1 : a.datetime > b.datetime ? -1 : 0));

  const { failed, ...rest } = meta;
  return { crimes, stops, meta: rest };
}
