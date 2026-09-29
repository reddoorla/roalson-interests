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
| `review/`                 | Broker review notes (source of the Dropbox PDF) and both QA reports with fix status.                                                             |
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

Needs Python 3 with `pymupdf pillow shapely qrcode markdown numpy`, Node 22, and in `build/`
a local `npm i playwright-core@1.56.1 maplibre-gl@5 qrcode` (gitignored). In a cloud container
Chromium must also trust the egress proxy CA (`~/.pki/nssdb`, see issue #164).

`build/all.sh` runs everything from a fresh checkout, in about 30 minutes:

1. `fetch_originals.py`: every property's `package_pdf` from Prismic, into `originals/`.
2. `extract.py`: covers, photos and carried-over exhibits from the originals, into `covers/`,
   `photos/` and `exhibits/`. The recipe is the file name in `build/plans.json`:
   `photos/<uid>-p<page>-<n>.png`, `covers/<uid>[-trim].png`, `exhibits/<uid>-p<page>.png`.
   Anything under `build/assets/` is committed as is.
3. `flood_verdicts.py`: the FEMA sentence for each site, into `geo/flood-verdicts.json`.
4. `make_jobs.py`, then `maps.mjs`: every map, into `maps/<uid>/`. A map is skipped only when
   its job spec matches the one stored beside it (`<map>.job.json`), so moving a pin re-renders
   that site's maps. The map style is not part of the spec: after a style change, pass `--force`.
   The TxDOT and FEMA caches in `geo/traffic/` and `geo/flood/` are keyed by the query point.
5. `postfix.py`: patches the one no-data scan line in the USGS imagery at Seguin
   (`build/postfix.json`). Re-measure it if that site's framing ever changes.
6. `pkg.py`, `print.mjs`, `assemble.py`: `out/pdf/<website title>.pdf`, with the original TREC
   IABS page appended.

To change a listing, edit `data/<uid>.json`. Title and map-label changes that are not typos
go in `build/overrides.json`. Typo fixes go in `build/corrections.json`; a `scope` key limits
one to a single section.

The documents for the people involved are made separately:

- `review_pdf.py`: `review/review-notes.md` becomes `out/00 - Review Notes (read first).pdf`.
- `showcase.py [facts-checked]`: `out/01 - Before and After.pdf`.
- `upload.sh <file-request-url> <label> <dir> <files…>`: pushes files into a Dropbox file
  request (the connector cannot upload binaries). Set `UPLOADER_EMAIL` first, then verify
  every file's size afterwards.

`review/` also holds both QA reports, with every finding marked fixed or open.

## Known limits

- Four sites have no reliable parcel match and are shown by pin: Menger Springs
  Road, IH 10 East at Loop 1604, Loop 1604 at Highway 181, and Tract 1 of IH 10
  at Menger Springs.
- Flood percentages are computed on the county parcel outline, so a 1–2%
  overlap is usually boundary misalignment; the exhibit says "along the edge"
  below 3%.
- The QR code points at `https://www.roalson.com/properties/<uid>`, which only
  resolves once the new site is live on that domain.
