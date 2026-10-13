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

Needs Python 3 with `pymupdf pillow shapely qrcode markdown numpy mapbox-vector-tile`, Node 22, and in `build/`
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

## Package standards (Roalson markup, 2026-10-12)

The client's marked-up 116 Old San Antonio Road package set these for every listing. They
live in the generator, so a rebuild picks them up:

- Cover: no property-type chip after the transaction ("For Sale", not "For Sale · Land"), a
  larger contact block, and the Ri watermark sized so its right edge lines up under the
  Roalson Interests wordmark (`--mark-w` in `template.css`).
- Spec pages: a row labelled "Investment" prints as "Price" (`LABEL_STANDARD` in `pkg.py`).
  The data files keep the broker's wording.
- Exhibits, in order: Location Map, Area Map with Traffic Counts, Aerial Map, FEMA Flood
  Zones. The close street map and the close aerial are gone. A site with no TxDOT station
  falls back to a plain Area Map.
- No survey page unless `build/plans.json` sets `"keep_survey": true` for that listing. None
  does: Matt Howard's package comments (2026-10-12) remove every survey. Four listings' "See Survey"
  cross-references are cut in `build/corrections.json`; St. Mary's flood sentence, which reports
  what the survey shows, is the broker's and stays.

Two per-site fields in `geo/sites.json` feed the area and aerial maps:

- `intersection` (`lat`, `lon`, `label`): the closest major intersection. Both maps are framed
  to include it and label it. `python3 lib/intersection.py <lat> <lon>` lists crossings of
  motorway, trunk and primary roads in the OpenFreeMap tiles: those with a motorway or trunk
  first, then nearest first. Check its answer on the map before storing it.
- `businesses`: names to label first on the Area Map with Traffic Counts (as spelled in
  OpenStreetMap). The map adds supermarkets, DIY stores, hospitals and the like from the same
  tiles (`lib/pois.py`), up to six, labelled after the traffic counts and the intersection; a
  business whose label does not fit is left off, dot and all. Names and pins only, no logos.
  The plain Area Map fallback shows OpenStreetMap's own POI labels instead.

`build/heroes.json` maps each listing to its Land ID share link (Matt Howard, 2026-10-12) and
the path its hero image has, `build/assets/heroes/<uid>.jpg`. When that file exists the
cover uses it instead of the NAIP aerial, credited "Aerial: Land id® · © Mapbox © Maxar". A listing
whose plan sets a `cover` (photography: 25331 IH-10 West, 101 W Commerce, 13810 Lookout Road, Urban
Loop Road) keeps it.

### Land ID (2026-10-12)

`node build/fetch_landid.mjs [uid…]` reads each share with no account. A share page's own
`share.json` call is refused to a plain `curl` (403), so the script loads the page in Chromium
and keeps that response: every polygon the broker drew, into `geo/landid/<uid>.json`. The hero is
a 1920×1080 capture of `id.land/map-screenshot/<slug>`, the view Land ID's own og:image is made
from. On the 14 shares that had one, the capture differs from Land ID's image by 0.01 to 1.10 of
255 on 13; on Menger Springs Road it differs by 29.4 because Mapbox has replaced the imagery under
the same outline. Two different sites differ by 48. Layers the broker switched on in a share
(`enabled_layers`: the floodplain at St. Mary's, parcels at 5930 Bandera and IH 10 at Highway 46)
are switched off for the hero, so a cover never shows a flood overlay without its legend; with the
floodplain on, St. Mary's differed from Land ID's own image by 3.8, and with it off by 0.08. It is
not part of `all.sh`, because the broker keeps editing the maps: re-fetch on purpose and review the
diff.

`python3 build/landid_compare.py` compares each Land ID outline with the boundary in
`geo/sites.json`: acres, overlap (IoU), and the FEMA sentence each would print. Recomputing the
current boundaries through the same code reproduces all 18 stored sentences.
`python3 build/apply_landid.py "October 2026" <uid…>` then writes the Land ID outline into
`geo/sites.json` for the listings named, with `boundary_source` and a `boundary_note` that says
where it came from. Since 2026-10-12 eight listings use it (Matt Howard's package comments):
Cascade Caverns, IH 10 at Highway 87, IH 10 at Menger Springs (both tracts), IH 10 at Scenic
Loop, IH 10 East at Loop 1604, Loop 1604 at Highway 181, Hwy 46 at Spencer Ranch and Menger
Springs Road. On 2026-10-13 eleven more followed, the ones whose FEMA sentence does not change
with the outline (Operator decisions 120). Four keep their county parcels because the Land ID
outline would change what the FEMA page says, and that goes to the broker first: 5001 Walzem,
IH 35 at Wonderworld, 13810 Lookout Road and St. Mary's at Martin.

Per-site extras in `geo/sites.json`: `aerial_notes` (a plain label on the Aerial Map, such as IH 10
at Highway 87's "HEB Owned" on Kendall CAD parcel 15300), `manual_businesses` (a name and dot
for a business OpenStreetMap does not have yet, such as "H-E-B (opening soon)" on Bexar CAD parcel
619012 at IH 10 East and Loop 1604), and `traffic_pad` (extra pixels of padding
that zoom the traffic map out). `build/overrides.json` can also carry `drop_rows`, labels of spec
rows to leave out, and stops the build if one names a row that does not exist.
`build/check_corrections.py` fails when a correction's `find` matches nothing, which the build
itself would ignore.

`maps.mjs` caches NAIP tiles in `tilecache/naip/` and retries a failed tile with backoff. A
map with a tile that never arrived is not written or stamped, and the process exits non-zero,
so `all.sh` stops before `pkg.py`. `postfix.json` still names the retired close aerial at
Seguin; whether the wide aerial there needs the same seam patch has not been checked.

## Known limits

- Four sites had no reliable parcel match and were shown by pin until 2026-10-12: Menger
  Springs Road, IH 10 East at Loop 1604, Loop 1604 at Highway 181, and Tract 1 of IH 10
  at Menger Springs. All four are now outlined from Land ID.
- Flood percentages are computed on the boundary in `geo/sites.json` (the broker's Land ID
  outline on the 19 listings above, the county parcel outline on the other four), so a 1–2% overlap is
  usually boundary misalignment; the exhibit says "along the edge" below 3%.
- The QR code points at `https://www.roalson.com/properties/<uid>`, which only
  resolves once the new site is live on that domain.
