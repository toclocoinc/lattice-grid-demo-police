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
 * Fetch JSON, retrying the two failures this API actually produces: 429 when
 * the call rate is exceeded, and 503 when an area holds too many crimes to
 * return. A 503 is not retried, because it will not succeed on a second ask.
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
    if (attempt < retries && response.status >= 500) {
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
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

/** One published crime record, flattened. */
export function normaliseCrime(record, categoryNames) {
  const lat = record.location ? Number(record.location.latitude) : null;
  const lng = record.location ? Number(record.location.longitude) : null;
  const outcome = record.outcome_status ? record.outcome_status.category : null;
  return {
    id: record.id,
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
 * Fetch every month of both datasets, a few requests at a time so the
 * published rate limit of 15 requests a second is never approached.
 * `onProgress` is called as each request finishes.
 */
export async function fetchEverything({ months = 12, concurrency = 3, onProgress, fetchImpl } = {}) {
  const opts = fetchImpl ? { fetchImpl } : undefined;
  const latest = await latestMonth(opts);
  const monthList = recentMonths(latest, months);
  const categoryNames = await crimeCategories(opts);

  const jobs = [];
  for (const month of monthList) jobs.push({ kind: 'crimes', month });
  for (const month of monthList) jobs.push({ kind: 'stops', month });

  const crimes = [];
  const stops = [];
  let done = 0;
  let requests = 2; // last updated, plus categories

  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next];
      next += 1;
      const rows =
        job.kind === 'crimes'
          ? await fetchCrimes(job.month, categoryNames, opts)
          : await fetchStops(job.month, opts);
      if (job.kind === 'crimes') crimes.push(...rows);
      else stops.push(...rows);
      done += 1;
      requests += 1;
      if (onProgress) onProgress({ done, total: jobs.length, kind: job.kind, month: job.month, rows: rows.length });
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));

  crimes.sort((a, b) => (a.month < b.month ? 1 : a.month > b.month ? -1 : 0));
  stops.sort((a, b) => (a.datetime < b.datetime ? 1 : a.datetime > b.datetime ? -1 : 0));

  return {
    crimes,
    stops,
    meta: {
      area: AREA_NAME,
      months: monthList,
      latestMonth: latest,
      requests,
      fetchedAt: new Date().toISOString(),
    },
  };
}
