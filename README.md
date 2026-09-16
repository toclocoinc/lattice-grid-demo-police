# Street crime in central London

A dashboard of recorded street crime and stop and search in the heart of central London, built on Lattice Grid and reading the police data service directly from the browser.

**[See it running](https://toclocoinc.github.io/lattice-grid-demo-police/)**

| | |
| --- | --- |
| Grid on npm | [@toclocoinc/lattice-grid](https://www.npmjs.com/package/@toclocoinc/lattice-grid) |
| Grid repository | [toclocoinc/latticegrid](https://github.com/toclocoinc/latticegrid) |
| Product site | [latticegrid.dev](https://www.latticegrid.dev) |

## What it shows

Twelve months of data covering the West End, Westminster and the City: tens of thousands of individual records, in a table you can sort, filter and group, alongside headline figures and charts that all read the same rows. Filter the table and everything else follows it.

**Street crime.** Every recorded crime in the area, one row each: the month, the type of crime, the street it was recorded near, the latest outcome, the district, and the coordinates. Group the rows by crime type, by month, or by both. Filter any column, search the whole table, and choose which columns you want to see.

**Headline figures.** How many crimes are in view, how many of them have an outcome recorded, how the latest month compares with the one before it, and the most common type of crime.

**Charts.** Crimes by type, crimes recorded each month, whether an outcome has been recorded month by month, and how the City compares with the West End.

**Stop and search.** Every stop and search recorded in the same area over the same months, with its own table and a chart of what officers were looking for and what came of it.

## How it loads

The police data service takes between four and fifteen seconds to answer each monthly request, and the dashboard needs twenty four of them. Waiting for all of that before drawing anything left a reader looking at a blank page for half a minute or more, for a dataset of forty thousand rows that the grid draws in a fraction of a second.

So the page does not wait. It paints from a saved copy first and refreshes from the service afterwards:

1. **The saved copy is on screen within half a second.** `data/snapshot/` holds one small file per month and dataset. The newest month is put on the page the moment it arrives; the other eleven follow together a moment later. The badge at the top reads *Saved copy - refreshing* and says when the copy was taken.
2. **The live months land on top of it, newest first.** Six requests run at a time, never more than ten started in any second, which is two thirds of the service's published limit. Each month goes into the dashboard through the grid's data router as it lands, keyed by row id, so a month the saved copy already holds is updated in place rather than added again, the grid, the tiles, the charts and the tab counts all move month by month, and nothing is ever drawn twice. A month that fails is asked for a second time; if that fails too the badge says so and the saved copy of that month stays on screen.
3. **When the last month has landed the badge reads *Live***, with the time it was fetched, and any month the saved copy held that has since left the twelve month window is taken off.

If the service cannot be reached at all, the saved copy stays on screen and the page says so. The page is never blank once the saved copy has arrived, and `?source=snapshot` still reads only the saved copy and never calls the service.

### What that changed

Measured in headless Chrome on the same machine, against the served page, from the moment the page's HTML started arriving:

| | Before | After |
| --- | --- | --- |
| First rows on screen | when every month had landed | **0.4 s** |
| Whole saved copy on screen | | **2.1 s** |
| Every live month landed, service answering cold | 36.8 s (3 requests at a time, one run) | 22.6 s and 30.6 s (6 at a time, two runs) |
| Every live month landed, service answering from its cache | 2.5 s | 4.6 to 4.8 s |

The service's own speed is what the last two lines measure, and it varies from minute to minute: the same twenty four requests repeated within half an hour are answered from its cache in a few seconds, and the after figure there is slower because the requests are now spaced out to stay inside the service's rate limit. The number a reader feels is the first line.

`node tools/measure-load.mjs [runs]` takes the live measurement again.

### The saved copy

`data/snapshot/meta.json` lists the months and says when the copy was taken; `crimes/YYYY-MM.json` and `stops/YYYY-MM.json` hold the rows. A workflow refreshes it every night and commits it when it has changed, then publishes the page, so the copy is never more than a day behind the service. To take one yourself:

```
npm run snapshot
```

## Running it

You need Node. Nothing is compiled and there is no build step.

```
npm install
npm start
```

The server prints the address to open, for example `http://localhost:41234/`. It picks a free port each time so it will not clash with anything else you have running.

To open the saved copy only, so the page works with no network at all, add `?source=snapshot` to the address:

```
http://localhost:41234/?source=snapshot
```

## Checking it

```
npm run verify
```

opens the page in a headless browser three ways and insists it works in each: the saved copy alone, the live page with the service blocked in the browser (the saved copy has to reach the screen within two seconds, and a month sent to the page a second time must update the rows it already has rather than add them again), and, with `npm run verify -- --live`, the live page for real. The publishing workflow runs the first two before every deploy.

## The single file version

`preview.html` is the whole dashboard in one file, with the data written into the page. Open it straight from disk, with no server. It still needs to reach the internet to load the grid itself. Rebuild it after taking a new snapshot:

```
npm run preview
```

## Where the data comes from

The police data service at [data.police.uk](https://data.police.uk/), which publishes recorded crime and stop and search for England, Wales and Northern Ireland. The page calls it directly from your browser.

Three things are worth knowing when you read the numbers.

Street level locations are approximate. Each crime is mapped to a nearby point rather than to an address, so the street shown is the closest anchor point, not where the crime happened.

Outcomes are the latest known at the time the data was published, and a recent month will have fewer of them recorded than an older one simply because less time has passed.

The district shown against each record is worked out from the published coordinates, because street level crime records do not carry one.

## Licence

The code in this repository is available under the MIT licence. See [LICENSE](LICENSE).

Lattice Grid itself is a separate commercial product with its own terms. It is free to use on localhost, with no key and no watermark, so a copy of this repository runs unrestricted on your own machine. This demo carries a key for its own published address only, which is why you will find one in the source. Keys for your own sites come from [latticegrid.dev](https://www.latticegrid.dev).

Contains public sector information licensed under the Open Government Licence v3.0

The data comes from [data.police.uk](https://data.police.uk/).
