# Listing packages

Regenerates the 22 property packages (the "listing PDFs") in the approved
Claude Design template — Land and Existing Property variants — from the data
in this folder. First run: 2026-09-29. See `docs/workJournal.md` for why each
choice was made.

Nothing here is part of `pnpm build`. It is an offline tool that talks to
public GIS services and prints with the pre-installed Chromium.

## What is in here

| Path                      | What it is                                                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `data/<uid>.json`         | Every fact in each original package, transcribed verbatim (schema in `data/SCHEMA.md`). 2,033 values were re-checked against the PDF text layer. |
| `build/corrections.json`  | The only edits made to the broker's text: 25 unambiguous typos (find → replace, with a reason each).                                             |
| `geo/sites.json`          | Site geometry: the county parcels (Texas StratMap, via the appraisal districts) chosen for each listing, or a pin where no parcel matched.       |
| `geo/meta.json`           | TxDOT 2025 AADT stations near each site, FEMA NFHL zones and panel.                                                                              |
| `geo/flood-verdicts.json` | Share of each site inside the floodway / 1% / 0.2% annual-chance zones, and the sentence printed on the flood exhibit.                           |
| `build/plans.json`        | Per listing: cover source, the original pages carried over (surveys, plats, floor plans) and their crop, photos.                                 |
| `build/`                  | The renderer: `maps.mjs` (MapLibre maps), `pkg.py` (HTML), `flow.js` (spec/demographics pagination), `print.mjs`, `assemble.py`.                 |
| `lib/`                    | Data fetchers: parcels, FEMA NFHL, TxDOT AADT, map job builder.                                                                                  |

## Sources, and what each may be used for

- **Location / area / traffic maps** — OpenFreeMap vector tiles in this site's own
  brand style (`static/map-style.json`). © OpenMapTiles © OpenStreetMap contributors;
  the credit is printed on every map page.
- **Aerials and covers** — USGS The National Map, NAIP Plus / high-resolution
  orthoimagery. Public domain. Google/Bing imagery from the old packages is not reused.
- **Site boundaries** — Texas StratMap land parcels (county appraisal district data).
  Approximate; every aerial caption says so and points to the survey.
- **Traffic** — TxDOT AADT Annuals (public view), 2025 counts.
- **Flood** — FEMA National Flood Hazard Layer, flood hazard zones layer.
- **TREC IABS form** — appended from each original package unaltered, as the
  statute requires.

## Regenerating

Needs Python 3 with `pymupdf pillow shapely qrcode markdown`, Node 22 with
`playwright-core maplibre-gl@5 qrcode` (install into a scratch folder, not this
workspace), the original PDFs in `originals/<uid>.pdf` (download from each
property's `package_pdf` in Prismic), and Chromium trusting the egress proxy CA
if run in a cloud container.

1. Edit `data/<uid>.json` (e.g. once the broker answers the review notes).
2. `python3 build/pkg.py <uid>` → `node build/print.mjs <uid>` → `python3 build/assemble.py <uid>`.
3. Maps only need re-rendering if the site geometry changes:
   `python3 build/make_jobs.py [uid …]` writes `build/jobs-all.json`, then
   `node build/maps.mjs build/jobs-all.json --force`.
4. Title and map-label changes that are not typos live in `build/overrides.json`;
   typo fixes live in `build/corrections.json` (a `scope` key limits one to a
   single section).

## Known limits

- Four sites have no reliable parcel match and are shown by pin: Menger Springs
  Road, IH 10 East at Loop 1604, Loop 1604 at Highway 181, and Tract 1 of IH 10
  at Menger Springs.
- Flood percentages are computed on the county parcel outline, so a 1–2%
  overlap is usually boundary misalignment; the exhibit says "along the edge"
  below 3%.
- The QR code points at `https://www.roalson.com/properties/<uid>`, which only
  resolves once the new site is live on that domain.
