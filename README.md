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

## Running it

You need Node. Nothing is compiled and there is no build step.

```
npm install
npm start
```

The server prints the address to open, for example `http://localhost:41234/`. It picks a free port each time so it will not clash with anything else you have running.

The page fetches from the police data service as it loads, which takes about twenty seconds and makes twenty six requests. To open the saved copy instead, so the page works with no network at all, add `?source=snapshot` to the address:

```
http://localhost:41234/?source=snapshot
```

The saved copy lives in `data/snapshot/` and records the date and time it was fetched. To take a fresh one:

```
npm run snapshot
```

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
